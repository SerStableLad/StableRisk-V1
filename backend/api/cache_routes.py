"""
Cache Management API Routes
Endpoints for monitoring and managing cache performance
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.services.cache_service import cache_service
from backend.middleware.rate_limiter import rate_limit_status, check_specific_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cache", tags=["Cache Management"])


class CacheInvalidationRequest(BaseModel):
    """Request model for cache invalidation"""
    namespaces: List[str]


class RateLimitCheckRequest(BaseModel):
    """Request model for rate limit checking"""
    limit_type: str
    identifier: str


@router.get("/stats")
async def get_cache_statistics():
    """
    Get comprehensive cache performance statistics
    
    **Returns:**
    - Cache hit/miss rates
    - Memory usage information
    - Rate limiting statistics
    - Performance metrics
    """
    try:
        cache_stats = await cache_service.get_cache_stats()
        rate_limit_stats = await rate_limit_status.get_stats()
        
        return {
            "cache_performance": cache_stats,
            "rate_limiting": rate_limit_stats["rate_limiting"],
            "system_health": {
                "cache_service_status": "operational" if cache_service else "unavailable",
                "redis_status": "connected" if cache_service.redis_client else "disconnected",
                "local_cache_status": "available"
            }
        }
        
    except Exception as e:
        logger.error(f"Cache statistics error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get cache statistics: {str(e)}")


@router.get("/health")
async def cache_service_health():
    """
    Check cache service health and configuration
    
    **Returns:**
    - Service health status
    - Configuration details
    - Available cache namespaces
    """
    try:
        await cache_service.initialize()  # Ensure initialized
        
        return {
            "status": "healthy",
            "service": "Cache & Rate Limiting Service",
            "components": {
                "redis_cache": cache_service.redis_client is not None,
                "local_cache": True,
                "rate_limiting": True
            },
            "configuration": {
                "default_ttls": cache_service.default_ttls,
                "rate_limits": cache_service.rate_limits,
                "cache_backends": ["redis", "local_memory"]
            },
            "performance": await cache_service.get_cache_stats()
        }
        
    except Exception as e:
        logger.error(f"Cache health check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Cache health check failed: {str(e)}")


@router.post("/invalidate")
async def invalidate_cache_namespaces(request: CacheInvalidationRequest):
    """
    Invalidate cache entries for specified namespaces
    
    **Parameters:**
    - namespaces: List of cache namespaces to invalidate
    
    **Returns:**
    - Number of cache entries invalidated per namespace
    """
    try:
        results = {}
        total_invalidated = 0
        
        for namespace in request.namespaces:
            count = await cache_service.invalidate_namespace(namespace)
            results[namespace] = count
            total_invalidated += count
        
        logger.info(f"Cache invalidation completed: {total_invalidated} entries across {len(request.namespaces)} namespaces")
        
        return {
            "message": "Cache invalidation completed",
            "invalidated_by_namespace": results,
            "total_invalidated": total_invalidated,
            "namespaces_processed": len(request.namespaces)
        }
        
    except Exception as e:
        logger.error(f"Cache invalidation error: {e}")
        raise HTTPException(status_code=500, detail=f"Cache invalidation failed: {str(e)}")


@router.get("/namespaces")
async def get_cache_namespaces():
    """
    Get information about available cache namespaces
    
    **Returns:**
    - List of cache namespaces with their TTL settings
    - Usage statistics per namespace
    """
    try:
        return {
            "available_namespaces": {
                namespace: {
                    "default_ttl_seconds": ttl,
                    "default_ttl_hours": round(ttl / 3600, 2),
                    "description": _get_namespace_description(namespace)
                }
                for namespace, ttl in cache_service.default_ttls.items()
            },
            "total_namespaces": len(cache_service.default_ttls),
            "cache_backends": {
                "redis": cache_service.redis_client is not None,
                "local_memory": True
            }
        }
        
    except Exception as e:
        logger.error(f"Namespace listing error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get namespaces: {str(e)}")


@router.post("/rate-limit/check")
async def check_rate_limit_status(request: RateLimitCheckRequest):
    """
    Check rate limit status for a specific identifier
    
    **Parameters:**
    - limit_type: Type of rate limit to check
    - identifier: Identifier (usually IP address) to check
    
    **Returns:**
    - Current usage against limits
    - Remaining requests allowed
    - Reset time
    """
    try:
        result = await check_specific_rate_limit(request.limit_type, request.identifier)
        
        return {
            "identifier": request.identifier,
            "limit_type": request.limit_type,
            "status": result,
            "is_rate_limited": not result['allowed']
        }
        
    except Exception as e:
        logger.error(f"Rate limit check error: {e}")
        raise HTTPException(status_code=500, detail=f"Rate limit check failed: {str(e)}")


@router.get("/rate-limits")
async def get_rate_limit_configuration():
    """
    Get current rate limiting configuration
    
    **Returns:**
    - Rate limit settings for all endpoint types
    - Current statistics
    """
    try:
        stats = await rate_limit_status.get_stats()
        
        return {
            "rate_limit_configuration": cache_service.rate_limits,
            "current_statistics": stats["rate_limiting"],
            "endpoint_categorization": {
                "heavy_operations": "5 requests per hour - Resource intensive operations",
                "risk_assessments": "20 requests per hour - Risk analysis endpoints", 
                "api_calls": "100 requests per hour - General API usage"
            }
        }
        
    except Exception as e:
        logger.error(f"Rate limit configuration error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get rate limit config: {str(e)}")


@router.post("/clear-all")
async def clear_all_cache():
    """
    Clear all cache entries (Redis and local)
    **WARNING: This will clear all cached data**
    
    **Returns:**
    - Confirmation of cache clearing
    """
    try:
        cleared_count = 0
        
        # Clear Redis if available
        if cache_service.redis_client:
            try:
                await cache_service.redis_client.flushdb()
                logger.info("Redis cache cleared")
            except Exception as e:
                logger.warning(f"Redis clear failed: {e}")
        
        # Clear local cache
        local_count = len(cache_service.local_cache)
        cache_service.local_cache.clear()
        cleared_count += local_count
        
        # Reset stats
        cache_service.cache_stats = {
            'hits': 0,
            'misses': 0,
            'sets': 0,
            'expires': 0,
            'errors': 0
        }
        
        logger.warning("All cache cleared - this may impact performance temporarily")
        
        return {
            "message": "All cache cleared successfully",
            "warning": "Performance may be temporarily impacted",
            "local_entries_cleared": local_count,
            "redis_cleared": cache_service.redis_client is not None
        }
        
    except Exception as e:
        logger.error(f"Cache clear error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")


@router.get("/performance")
async def get_cache_performance_report():
    """
    Get detailed cache performance report
    
    **Returns:**
    - Hit/miss ratios
    - Response time improvements
    - Memory usage efficiency
    """
    try:
        stats = await cache_service.get_cache_stats()
        
        # Calculate performance metrics
        total_requests = stats['hits'] + stats['misses']
        cache_efficiency = stats['hit_rate']
        
        performance_grade = (
            "Excellent" if cache_efficiency >= 80 else
            "Good" if cache_efficiency >= 60 else
            "Fair" if cache_efficiency >= 40 else
            "Poor"
        )
        
        return {
            "performance_summary": {
                "cache_hit_rate": f"{cache_efficiency}%",
                "total_cache_operations": total_requests,
                "performance_grade": performance_grade,
                "cache_efficiency": cache_efficiency
            },
            "detailed_metrics": stats,
            "recommendations": _generate_performance_recommendations(stats, cache_efficiency)
        }
        
    except Exception as e:
        logger.error(f"Performance report error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate performance report: {str(e)}")


def _get_namespace_description(namespace: str) -> str:
    """Get human-readable description for cache namespace"""
    descriptions = {
        'coin_metadata': 'Basic coin information and market data',
        'price_analysis': 'Historical price analysis and stability metrics',
        'liquidity_analysis': 'Multi-chain liquidity data and risk scores',
        'github_analysis': 'Repository security audits and oracle analysis',
        'risk_assessment': 'Comprehensive risk assessment results',
        'rate_limit': 'Rate limiting counters and windows',
        'api_response': 'Cached API responses from external services',
        'user_session': 'User session data and preferences'
    }
    return descriptions.get(namespace, 'Application data cache')


def _generate_performance_recommendations(stats: Dict[str, Any], hit_rate: float) -> List[str]:
    """Generate performance improvement recommendations"""
    recommendations = []
    
    if hit_rate < 50:
        recommendations.append("Consider increasing TTL values for frequently accessed data")
        recommendations.append("Review caching strategy for better efficiency")
    
    if stats.get('errors', 0) > stats.get('hits', 1) * 0.1:
        recommendations.append("High error rate detected - check Redis connectivity")
    
    if stats.get('local_cache_size', 0) > 5000:
        recommendations.append("Local cache size is large - consider Redis deployment")
    
    if not stats.get('redis_available', False):
        recommendations.append("Deploy Redis for better cache performance and persistence")
    
    if not recommendations:
        recommendations.append("Cache performance is optimal - no changes needed")
    
    return recommendations 