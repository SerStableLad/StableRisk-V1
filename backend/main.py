"""
StableRisk Backend - Main FastAPI Application
Entry point for the StableRisk API server
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import logging
from datetime import datetime

# Import configuration
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.api_keys import api_settings

# Import API routers
from api.v1.coins import router as coins_router
from api.v1.liquidity import router as liquidity_router

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

# Include API routers
app.include_router(coins_router, prefix="/api/v1")
app.include_router(liquidity_router, prefix="/api/v1")


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
            "risk_assessment": "🔄 Coming in Phase 2.2"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "apis_configured": {
            "coingecko": bool(api_settings.coingecko_api_key),
            "github": bool(api_settings.github_token),
            "defillama": True,
            "geckoterminal": True
        },
        "features_status": {
            "coin_search": "operational",
            "metadata_retrieval": "operational",
            "price_analysis": "operational",
            "liquidity_analysis": "operational",
            "comprehensive_liquidity_analysis": "operational",
            "per_chain_scoring": "operational",
            "pool_composition_analysis": "operational",
            "dex_diversity_analysis": "operational",
            "github_crawler": "development",
            "risk_scoring": "development"
        },
        "liquidity_capabilities": {
            "scoring_framework": "PRD per-chain 0-10 scale",
            "bonus_penalty_system": "7 different risk adjustments",
            "pool_composition_analysis": "Stable/stable vs volatile/stable detection",
            "dex_diversity_metrics": "DEX count and concentration analysis",
            "risk_factor_detection": "LP centralization, drain events, flash loan risk",
            "heatmap_visualization": "Color-coded per-chain risk display"
        }
    }


@app.get("/api/v1/risk/{coin_id}")
async def get_risk_assessment(coin_id: str):
    """
    Get comprehensive risk assessment for a stablecoin
    Returns risk scores across all dimensions
    """
    # TODO: Implement full risk assessment pipeline
    return {
        "coin_id": coin_id,
        "message": "Full risk assessment not yet implemented",
        "status": "development",
        "available_in": "Phase 2.2 - Risk Scoring Engine",
        "current_features": {
            "metadata": f"/api/v1/coins/metadata/{coin_id}",
            "price_analysis": f"/api/v1/coins/price-analysis/{coin_id}"
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
                "/api/v1/risk/{coin_id} (coming soon)"
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