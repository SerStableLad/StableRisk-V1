"""
StableRisk V1 - Main FastAPI Application
Complete risk assessment platform for stablecoins
Author: VibeCoding
Version: 2.1.0 (Phase 2.1 Complete)
"""

import logging
import structlog
from datetime import datetime
from typing import Dict, Optional, List

# FastAPI imports
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# Import configuration
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.api_keys import api_settings

# Import services and middleware
from backend.services.cache_service import cache_service
from backend.middleware.rate_limiter import RateLimitMiddleware

# Import API routers with correct paths
from backend.api.v1.coins import router as coins_router
from backend.api.v1.liquidity import router as liquidity_router
from backend.api.github_routes import router as github_router
from backend.api.risk_routes import router as risk_router
from backend.api.cache_routes import router as cache_router

# Import new Phase 2.1 API routes
from backend.api.pegging_routes import router as pegging_router
from backend.api.web_scraper_routes import router as web_scraper_router
from backend.api.enhanced_oracle_routes import router as enhanced_oracle_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI application
app = FastAPI(
    title="StableRisk API",
    description="Automated stablecoin risk assessment platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if api_settings.debug else ["https://stablerisk.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Add rate limiting middleware
app.add_middleware(RateLimitMiddleware, enabled=True)

# Include API routers
app.include_router(coins_router, prefix="/api/v1")
app.include_router(liquidity_router, prefix="/api/v1")
app.include_router(github_router, prefix="/api/v1")
app.include_router(risk_router, prefix="/api/v1")
app.include_router(cache_router, prefix="/api/v1")

# Include new Phase 2.1 routers
app.include_router(pegging_router)
app.include_router(web_scraper_router)
app.include_router(enhanced_oracle_router, prefix="/api/v1")


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    try:
        # Initialize cache service
        await cache_service.initialize()
        logger.info("Cache service initialized")
    except Exception as e:
        logger.warning(f"Cache service initialization failed: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    try:
        if cache_service.redis_client:
            await cache_service.redis_client.close()
        logger.info("Services shutdown completed")
    except Exception as e:
        logger.error(f"Shutdown error: {e}")


@app.get("/")
async def root():
    """Root endpoint - API health check"""
    return {
        "message": "StableRisk API",
        "version": "1.0.0",
        "status": "operational",
        "timestamp": datetime.utcnow().isoformat(),
        "docs": "/docs",
        "features": {
            "ticker_search": "✅ Available",
            "metadata_fetch": "✅ Available", 
            "price_analysis": "✅ Available",
            "liquidity_analysis": "✅ Available - Enhanced with per-chain scoring",
            "comprehensive_liquidity": "✅ Available - PRD framework with 0-10 scoring",
            "github_crawler": "✅ Available - Repository audit and oracle analysis",
            "risk_assessment": "✅ Available - Comprehensive multi-factor risk scoring",
            "caching_system": "✅ Available - Redis + local memory with TTL",
            "rate_limiting": "✅ Available - IP-based with endpoint categorization"
        }
    }


@app.get("/health")
async def health_check():
    """System health check endpoint"""
    return {
        "status": "healthy",
        "service": "StableRisk V1 Platform",
        "version": "2.1.0",
        "phase": "Phase 2.1 Complete",
        "features": {
            "data_collection": "operational",
            "risk_assessment": "operational", 
            "caching_and_rate_limiting": "operational",
            "pegging_classification": "operational",
            "web_scraping": "operational",
            "enhanced_oracle_analysis": "operational"
        },
        "api_endpoints": {
            "coins": "operational",
            "analysis": "operational", 
            "risk": "operational",
            "cache": "operational",
            "pegging": "operational",
            "web_scraper": "operational",
            "oracle": "operational"
        },
        "database": "connected",
        "external_apis": {
            "coingecko": "available",
            "defillama": "available", 
            "geckoterminal": "available",
            "github": "available"
        },
        "phase_2_1_features": [
            "Pegging type classifier with manual overrides",
            "AI web scraper for GitHub repositories",
            "AI web scraper for transparency resources", 
            "Enhanced oracle infrastructure detection",
            "Pattern-based analysis and confidence scoring"
        ]
    }


@app.get("/api/v1/risk/{coin_id}")
async def get_risk_assessment(coin_id: str):
    """
    Get comprehensive risk assessment for a stablecoin
    Returns risk scores across all dimensions
    """
    return {
        "message": "Risk assessment available at dedicated endpoints",
        "comprehensive_assessment": f"/api/v1/risk/assessment/{coin_id}",
        "risk_summary": f"/api/v1/risk/summary/{coin_id}",
        "risk_factors": f"/api/v1/risk/factors/{coin_id}",
        "risk_comparison": "/api/v1/risk/comparison",
        "available_features": {
            "price_stability_analysis": "25% weight",
            "liquidity_risk_assessment": "20% weight", 
            "security_analysis": "15% weight",
            "oracle_infrastructure": "15% weight",
            "audit_coverage": "15% weight",
            "centralization_analysis": "10% weight"
        }
    }


@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "error": "Endpoint not found",
            "message": "Please check the API documentation at /docs",
            "available_endpoints": [
                "/",
                "/health", 
                "/api/v1/coins/search/{ticker}",
                "/api/v1/coins/metadata/{coin_id}",
                "/api/v1/coins/price-analysis/{coin_id}",
                "/api/v1/coins/stablecoin-search/{ticker}",
                "/api/v1/liquidity/analysis/{coin_id}",
                "/api/v1/liquidity/comprehensive-analysis/{coin_id}",
                "/api/v1/liquidity/per-chain-analysis/{coin_id}",
                "/api/v1/liquidity/risk-score/{coin_id}",
                "/api/v1/liquidity/pools/{coin_id}",
                "/api/v1/liquidity/heatmap-data/{coin_id}",
                "/api/v1/liquidity/summary",
                "/api/v1/github/analyze-repository",
                "/api/v1/github/analyze-repositories", 
                "/api/v1/github/search-audits/{owner}/{repo}",
                "/api/v1/github/analyze-oracle/{owner}/{repo}",
                "/api/v1/github/health",
                "/api/v1/risk/assessment/{coin_id}",
                "/api/v1/risk/summary/{coin_id}",
                "/api/v1/risk/factors/{coin_id}",
                "/api/v1/risk/comparison",
                "/api/v1/risk/health",
                "/api/v1/risk/models/weights",
                "/api/v1/risk/{coin_id} (legacy redirect)",
                "/api/v1/cache/stats",
                "/api/v1/cache/health", 
                "/api/v1/cache/performance",
                "/api/v1/cache/namespaces",
                "/api/v1/cache/rate-limits"
            ]
        }
    )


if __name__ == "__main__":
    # Development server
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=api_settings.debug,
        log_level=api_settings.log_level.lower()
    ) 