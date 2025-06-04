"""
Rate Limiting Middleware
FastAPI middleware for IP-based rate limiting with different limits per endpoint type
"""

import asyncio
import logging
from typing import Dict, Any, Optional
from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.services.cache_service import cache_service

logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware for FastAPI
    Applies different limits based on endpoint patterns
    """
    
    def __init__(self, app, enabled: bool = True):
        super().__init__(app)
        self.enabled = enabled
        
        # Endpoint categorization patterns
        self.endpoint_categories = {
            'heavy_operations': [
                '/api/v1/risk/assessment',
                '/api/v1/risk/comparison',
                '/api/v1/github/analyze-repository',
                '/api/v1/github/analyze-repositories',
                '/api/v1/liquidity/comprehensive-analysis'
            ],
            'risk_assessments': [
                '/api/v1/risk/assessment',
                '/api/v1/risk/summary',
                '/api/v1/risk/factors',
                '/api/v1/risk/comparison'
            ],
            'api_calls': [
                # All API calls that aren't specifically categorized
            ]
        }
        
        # Whitelist patterns (no rate limiting)
        self.whitelist_patterns = [
            '/docs',
            '/redoc',
            '/openapi.json',
            '/health',
            '/api/v1/risk/health',
            '/api/v1/github/health',
            '/api/v1/liquidity/health',
            '/api/v1/risk/models/weights'
        ]
    
    async def dispatch(self, request: Request, call_next):
        """Process request with rate limiting"""
        if not self.enabled:
            return await call_next(request)
        
        # Skip rate limiting for whitelisted endpoints
        if self._is_whitelisted(request.url.path):
            return await call_next(request)
        
        # Get client IP
        client_ip = self._get_client_ip(request)
        
        # Determine rate limit category
        limit_type = self._categorize_endpoint(request.url.path)
        
        # Check rate limit
        try:
            rate_limit_result = await cache_service.check_rate_limit(limit_type, client_ip)
            
            if not rate_limit_result['allowed']:
                # Rate limit exceeded
                logger.warning(
                    f"Rate limit exceeded for IP {client_ip} on {request.url.path}. "
                    f"Type: {limit_type}, Current: {rate_limit_result['current']}, "
                    f"Limit: {rate_limit_result['limit']}"
                )
                
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "Rate limit exceeded",
                        "message": f"Too many requests. Limit: {rate_limit_result['limit']} per hour",
                        "details": {
                            "limit_type": limit_type,
                            "current_requests": rate_limit_result['current'],
                            "limit": rate_limit_result['limit'],
                            "remaining": rate_limit_result['remaining'],
                            "reset_time": rate_limit_result['reset_time'],
                            "retry_after_seconds": rate_limit_result.get('window_seconds', 3600)
                        }
                    },
                    headers={
                        "X-RateLimit-Limit": str(rate_limit_result['limit']),
                        "X-RateLimit-Remaining": str(rate_limit_result['remaining']),
                        "X-RateLimit-Reset": rate_limit_result['reset_time'] or "",
                        "Retry-After": str(rate_limit_result.get('window_seconds', 3600))
                    }
                )
            
            # Request allowed, proceed
            response = await call_next(request)
            
            # Add rate limit headers to response
            response.headers["X-RateLimit-Limit"] = str(rate_limit_result['limit'])
            response.headers["X-RateLimit-Remaining"] = str(rate_limit_result['remaining'])
            response.headers["X-RateLimit-Type"] = limit_type
            if rate_limit_result['reset_time']:
                response.headers["X-RateLimit-Reset"] = rate_limit_result['reset_time']
            
            return response
            
        except Exception as e:
            logger.error(f"Rate limiting error: {e}")
            # Continue without rate limiting on error
            return await call_next(request)
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address from request"""
        # Check for forwarded headers (behind proxy/load balancer)
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            # Take the first IP in the chain
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # Fallback to direct connection
        return request.client.host if request.client else "unknown"
    
    def _is_whitelisted(self, path: str) -> bool:
        """Check if endpoint is whitelisted from rate limiting"""
        for pattern in self.whitelist_patterns:
            if path.startswith(pattern):
                return True
        return False
    
    def _categorize_endpoint(self, path: str) -> str:
        """Categorize endpoint for appropriate rate limiting"""
        # Check heavy operations first (most restrictive)
        for pattern in self.endpoint_categories['heavy_operations']:
            if path.startswith(pattern):
                return 'heavy_operations_per_ip'
        
        # Check risk assessments
        for pattern in self.endpoint_categories['risk_assessments']:
            if path.startswith(pattern):
                return 'risk_assessments_per_ip'
        
        # Default to general API calls
        return 'api_calls_per_ip'


class RateLimitStatus:
    """Helper class to track rate limiting status and statistics"""
    
    def __init__(self):
        self.blocked_requests = 0
        self.total_requests = 0
        self.blocked_ips = set()
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get rate limiting statistics"""
        cache_stats = await cache_service.get_cache_stats()
        
        block_rate = (
            self.blocked_requests / self.total_requests * 100 
            if self.total_requests > 0 else 0
        )
        
        return {
            "rate_limiting": {
                "enabled": True,
                "total_requests": self.total_requests,
                "blocked_requests": self.blocked_requests,
                "block_rate_percent": round(block_rate, 2),
                "unique_blocked_ips": len(self.blocked_ips)
            },
            "cache_performance": cache_stats,
            "rate_limits": cache_service.rate_limits
        }


# Global rate limit status tracker
rate_limit_status = RateLimitStatus()


async def check_specific_rate_limit(limit_type: str, identifier: str) -> Dict[str, Any]:
    """
    Check rate limit for a specific type and identifier
    Useful for API endpoints that want to check limits without incrementing
    """
    try:
        # Get current count without incrementing
        current_key = f"rate_limit:{limit_type}:{identifier}"
        
        if cache_service.redis_client:
            try:
                current_count = await cache_service.redis_client.get(current_key)
                current_count = int(current_count) if current_count else 0
            except:
                current_count = 0
        else:
            # Check local cache
            cache_key = cache_service._generate_cache_key('rate_limit', f"{limit_type}:{identifier}")
            if cache_key in cache_service.local_cache:
                cached_item = cache_service.local_cache[cache_key]
                if cached_item['expires_at'] > cache_service.datetime.utcnow():
                    current_count = cached_item['data']
                else:
                    current_count = 0
            else:
                current_count = 0
        
        limit_config = cache_service.rate_limits.get(limit_type, {'limit': 100, 'window': 3600})
        remaining = max(0, limit_config['limit'] - current_count)
        
        return {
            'current': current_count,
            'limit': limit_config['limit'],
            'remaining': remaining,
            'allowed': current_count < limit_config['limit'],
            'window_seconds': limit_config['window']
        }
        
    except Exception as e:
        logger.error(f"Rate limit check error: {e}")
        return {
            'current': 0,
            'limit': 999,
            'remaining': 999,
            'allowed': True,
            'window_seconds': 3600
        } 