"""
Caching Service
Provides Redis-based caching with local fallback for improved performance and rate limiting
"""

import asyncio
import json
import logging
import hashlib
from typing import Any, Optional, Dict, Union
from datetime import datetime, timedelta
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    print("Redis not available, using local memory cache only")

from config.api_keys import db_settings

logger = logging.getLogger(__name__)


class CacheService:
    """
    Comprehensive caching service with Redis backend and local fallback
    Supports TTL, rate limiting, and data freshness tracking
    """
    
    def __init__(self):
        self.redis_client = None
        self.local_cache = {}  # Fallback local cache
        self.cache_stats = {
            'hits': 0,
            'misses': 0,
            'sets': 0,
            'expires': 0,
            'errors': 0
        }
        
        # Default TTL values (in seconds)
        self.default_ttls = {
            'coin_metadata': 3600 * 24,      # 24 hours
            'price_analysis': 3600 * 6,      # 6 hours  
            'liquidity_analysis': 3600 * 2,  # 2 hours
            'github_analysis': 3600 * 12,    # 12 hours
            'risk_assessment': 3600 * 4,     # 4 hours
            'rate_limit': 3600 * 24,         # 24 hours
            'api_response': 1800,            # 30 minutes
            'user_session': 3600 * 2         # 2 hours
        }
        
        # Rate limiting windows
        self.rate_limits = {
            'api_calls_per_ip': {'limit': 100, 'window': 3600},      # 100 per hour
            'risk_assessments_per_ip': {'limit': 20, 'window': 3600}, # 20 per hour
            'heavy_operations_per_ip': {'limit': 5, 'window': 3600}   # 5 per hour
        }
        
    async def initialize(self):
        """Initialize Redis connection if available"""
        if REDIS_AVAILABLE:
            try:
                self.redis_client = redis.from_url(
                    db_settings.redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_timeout=5
                )
                # Test connection
                await self.redis_client.ping()
                logger.info("Redis cache service initialized successfully")
                return True
            except Exception as e:
                logger.warning(f"Redis connection failed: {e}. Using local cache only.")
                self.redis_client = None
                return False
        else:
            logger.info("Redis not available, using local memory cache")
            return False
    
    def _generate_cache_key(self, namespace: str, identifier: str, **kwargs) -> str:
        """Generate a consistent cache key"""
        # Include kwargs in key for parameter-specific caching
        if kwargs:
            param_str = "_".join(f"{k}={v}" for k, v in sorted(kwargs.items()))
            key_string = f"{namespace}:{identifier}:{param_str}"
        else:
            key_string = f"{namespace}:{identifier}"
        
        # Hash long keys to avoid Redis key length limits
        if len(key_string) > 200:
            key_hash = hashlib.md5(key_string.encode()).hexdigest()
            return f"{namespace}:{key_hash}"
        
        return key_string
    
    async def get(self, namespace: str, identifier: str, **kwargs) -> Optional[Any]:
        """Get cached data"""
        cache_key = self._generate_cache_key(namespace, identifier, **kwargs)
        
        try:
            # Try Redis first
            if self.redis_client:
                try:
                    cached_data = await self.redis_client.get(cache_key)
                    if cached_data:
                        self.cache_stats['hits'] += 1
                        return json.loads(cached_data)
                except Exception as e:
                    logger.warning(f"Redis get error: {e}")
            
            # Fallback to local cache
            if cache_key in self.local_cache:
                cached_item = self.local_cache[cache_key]
                if cached_item['expires_at'] > datetime.utcnow():
                    self.cache_stats['hits'] += 1
                    return cached_item['data']
                else:
                    # Expired
                    del self.local_cache[cache_key]
                    self.cache_stats['expires'] += 1
            
            self.cache_stats['misses'] += 1
            return None
            
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            self.cache_stats['errors'] += 1
            return None
    
    async def set(self, namespace: str, identifier: str, data: Any, 
                  ttl: Optional[int] = None, **kwargs) -> bool:
        """Set cached data"""
        cache_key = self._generate_cache_key(namespace, identifier, **kwargs)
        
        # Use default TTL if not specified
        if ttl is None:
            ttl = self.default_ttls.get(namespace, 3600)
        
        try:
            # Serialize data
            serialized_data = json.dumps(data, default=str)
            
            # Try Redis first
            if self.redis_client:
                try:
                    await self.redis_client.setex(cache_key, ttl, serialized_data)
                    self.cache_stats['sets'] += 1
                    return True
                except Exception as e:
                    logger.warning(f"Redis set error: {e}")
            
            # Fallback to local cache
            expires_at = datetime.utcnow() + timedelta(seconds=ttl)
            self.local_cache[cache_key] = {
                'data': data,
                'expires_at': expires_at,
                'created_at': datetime.utcnow()
            }
            
            # Clean up expired local cache entries periodically
            if len(self.local_cache) > 1000:
                await self._cleanup_local_cache()
            
            self.cache_stats['sets'] += 1
            return True
            
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            self.cache_stats['errors'] += 1
            return False
    
    async def delete(self, namespace: str, identifier: str, **kwargs) -> bool:
        """Delete cached data"""
        cache_key = self._generate_cache_key(namespace, identifier, **kwargs)
        
        try:
            # Try Redis first
            if self.redis_client:
                try:
                    await self.redis_client.delete(cache_key)
                except Exception as e:
                    logger.warning(f"Redis delete error: {e}")
            
            # Remove from local cache
            if cache_key in self.local_cache:
                del self.local_cache[cache_key]
            
            return True
            
        except Exception as e:
            logger.error(f"Cache delete error: {e}")
            return False
    
    async def exists(self, namespace: str, identifier: str, **kwargs) -> bool:
        """Check if key exists in cache"""
        cache_key = self._generate_cache_key(namespace, identifier, **kwargs)
        
        try:
            # Try Redis first
            if self.redis_client:
                try:
                    return bool(await self.redis_client.exists(cache_key))
                except Exception as e:
                    logger.warning(f"Redis exists error: {e}")
            
            # Check local cache
            if cache_key in self.local_cache:
                if self.local_cache[cache_key]['expires_at'] > datetime.utcnow():
                    return True
                else:
                    del self.local_cache[cache_key]
            
            return False
            
        except Exception as e:
            logger.error(f"Cache exists error: {e}")
            return False
    
    async def increment(self, namespace: str, identifier: str, 
                       amount: int = 1, ttl: Optional[int] = None, **kwargs) -> int:
        """Increment a counter (useful for rate limiting)"""
        cache_key = self._generate_cache_key(namespace, identifier, **kwargs)
        
        try:
            # Try Redis first
            if self.redis_client:
                try:
                    current_value = await self.redis_client.incr(cache_key, amount)
                    if ttl and current_value == amount:  # First increment
                        await self.redis_client.expire(cache_key, ttl)
                    return current_value
                except Exception as e:
                    logger.warning(f"Redis increment error: {e}")
            
            # Fallback to local cache
            if ttl is None:
                ttl = 3600
            
            expires_at = datetime.utcnow() + timedelta(seconds=ttl)
            
            if cache_key in self.local_cache and self.local_cache[cache_key]['expires_at'] > datetime.utcnow():
                self.local_cache[cache_key]['data'] += amount
            else:
                self.local_cache[cache_key] = {
                    'data': amount,
                    'expires_at': expires_at,
                    'created_at': datetime.utcnow()
                }
            
            return self.local_cache[cache_key]['data']
            
        except Exception as e:
            logger.error(f"Cache increment error: {e}")
            return 0
    
    async def check_rate_limit(self, limit_type: str, identifier: str) -> Dict[str, Any]:
        """Check if identifier is within rate limits"""
        if limit_type not in self.rate_limits:
            return {'allowed': True, 'remaining': 999, 'reset_time': None}
        
        limit_config = self.rate_limits[limit_type]
        window_key = f"rate_limit:{limit_type}:{identifier}"
        
        try:
            current_count = await self.increment(
                'rate_limit', 
                f"{limit_type}:{identifier}",
                ttl=limit_config['window']
            )
            
            remaining = max(0, limit_config['limit'] - current_count)
            allowed = current_count <= limit_config['limit']
            
            # Calculate reset time
            if self.redis_client:
                try:
                    ttl = await self.redis_client.ttl(f"rate_limit:{limit_type}:{identifier}")
                    reset_time = datetime.utcnow() + timedelta(seconds=ttl) if ttl > 0 else None
                except:
                    reset_time = datetime.utcnow() + timedelta(seconds=limit_config['window'])
            else:
                reset_time = datetime.utcnow() + timedelta(seconds=limit_config['window'])
            
            return {
                'allowed': allowed,
                'remaining': remaining,
                'current': current_count,
                'limit': limit_config['limit'],
                'reset_time': reset_time.isoformat() if reset_time else None,
                'window_seconds': limit_config['window']
            }
            
        except Exception as e:
            logger.error(f"Rate limit check error: {e}")
            # Allow by default on error
            return {'allowed': True, 'remaining': 999, 'reset_time': None}
    
    async def _cleanup_local_cache(self):
        """Clean up expired entries from local cache"""
        now = datetime.utcnow()
        expired_keys = [
            key for key, item in self.local_cache.items()
            if item['expires_at'] <= now
        ]
        
        for key in expired_keys:
            del self.local_cache[key]
            self.cache_stats['expires'] += 1
        
        logger.info(f"Cleaned up {len(expired_keys)} expired cache entries")
    
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache performance statistics"""
        hit_rate = (
            self.cache_stats['hits'] / 
            (self.cache_stats['hits'] + self.cache_stats['misses'])
            if (self.cache_stats['hits'] + self.cache_stats['misses']) > 0 else 0
        )
        
        stats = {
            'hit_rate': round(hit_rate * 100, 2),
            'total_operations': sum(self.cache_stats.values()),
            'redis_available': self.redis_client is not None,
            'local_cache_size': len(self.local_cache),
            **self.cache_stats
        }
        
        # Add Redis info if available
        if self.redis_client:
            try:
                redis_info = await self.redis_client.info('memory')
                stats['redis_memory_used'] = redis_info.get('used_memory_human', 'Unknown')
                stats['redis_memory_peak'] = redis_info.get('used_memory_peak_human', 'Unknown')
            except:
                pass
        
        return stats
    
    async def invalidate_namespace(self, namespace: str) -> int:
        """Invalidate all cache entries in a namespace"""
        count = 0
        
        try:
            # Redis pattern deletion
            if self.redis_client:
                try:
                    pattern = f"{namespace}:*"
                    keys = await self.redis_client.keys(pattern)
                    if keys:
                        await self.redis_client.delete(*keys)
                        count += len(keys)
                except Exception as e:
                    logger.warning(f"Redis namespace invalidation error: {e}")
            
            # Local cache cleanup
            namespace_prefix = f"{namespace}:"
            local_keys = [key for key in self.local_cache.keys() if key.startswith(namespace_prefix)]
            for key in local_keys:
                del self.local_cache[key]
                count += 1
            
            logger.info(f"Invalidated {count} cache entries for namespace '{namespace}'")
            return count
            
        except Exception as e:
            logger.error(f"Namespace invalidation error: {e}")
            return 0


# Global cache service instance
cache_service = CacheService()


# Decorator for automatic caching
def cached(namespace: str, ttl: Optional[int] = None, key_func=None):
    """
    Decorator for automatic function result caching
    
    Args:
        namespace: Cache namespace
        ttl: Time to live in seconds
        key_func: Function to generate cache key from arguments
    """
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                # Use function name and string representation of args
                cache_key = f"{func.__name__}_{hash(str(args) + str(sorted(kwargs.items())))}"
            
            # Try to get from cache
            cached_result = await cache_service.get(namespace, cache_key)
            if cached_result is not None:
                return cached_result
            
            # Execute function and cache result
            result = await func(*args, **kwargs)
            if result is not None:
                await cache_service.set(namespace, cache_key, result, ttl)
            
            return result
        
        return wrapper
    return decorator 