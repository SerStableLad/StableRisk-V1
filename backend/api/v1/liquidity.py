"""
Comprehensive Multi-Chain Liquidity Analysis API
Enhanced endpoints supporting per-chain scoring and detailed risk analysis
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Optional
import logging
import sys
import os

# Add parent directories to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
from backend.models.stablecoin import LiquidityData, EnhancedLiquidityData
from backend.services.liquidity_service import liquidity_service, enhanced_liquidity_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/liquidity", tags=["liquidity"])


@router.get("/analysis/{coin_id}", response_model=LiquidityData)
async def get_liquidity_analysis(
    coin_id: str,
    refresh_cache: bool = Query(False, description="Force refresh of cached data")
):
    """
    Get comprehensive liquidity analysis for a stablecoin across all chains
    Legacy endpoint - maintains backward compatibility
    """
    try:
        logger.info(f"Fetching liquidity analysis for: {coin_id}")
        
        # Clear cache if refresh requested
        if refresh_cache:
            # Simple cache clearing by coin_id pattern
            keys_to_remove = [
                key for key in enhanced_liquidity_service._cache.keys() 
                if coin_id in key
            ]
            for key in keys_to_remove:
                del enhanced_liquidity_service._cache[key]
            logger.info("Cache cleared for refresh request")
        
        # Get liquidity analysis using legacy format
        liquidity_data = await liquidity_service.get_stablecoin_liquidity_analysis(coin_id)
        
        if not liquidity_data:
            raise HTTPException(
                status_code=404,
                detail=f"Liquidity data not available for: {coin_id}"
            )
        
        logger.info(f"Successfully analyzed liquidity for {coin_id}: ${liquidity_data.total_liquidity_usd:,.0f} across {liquidity_data.chain_count} chains")
        return liquidity_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching liquidity analysis for {coin_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Liquidity analysis failed: {str(e)}"
        )


@router.get("/comprehensive-analysis/{coin_id}", response_model=EnhancedLiquidityData)
async def get_comprehensive_liquidity_analysis(
    coin_id: str,
    refresh_cache: bool = Query(False, description="Force refresh of cached data")
):
    """
    Get comprehensive per-chain liquidity analysis with detailed scoring
    NEW ENDPOINT - Implements full PRD framework with 0-10 scoring
    """
    try:
        logger.info(f"Fetching comprehensive liquidity analysis for: {coin_id}")
        
        # Clear cache if refresh requested
        if refresh_cache:
            keys_to_remove = [
                key for key in enhanced_liquidity_service._cache.keys() 
                if coin_id in key
            ]
            for key in keys_to_remove:
                del enhanced_liquidity_service._cache[key]
            logger.info("Cache cleared for refresh request")
        
        # Get comprehensive analysis
        enhanced_data = await enhanced_liquidity_service.get_comprehensive_liquidity_analysis(coin_id)
        
        if not enhanced_data:
            raise HTTPException(
                status_code=404,
                detail=f"Comprehensive liquidity data not available for: {coin_id}"
            )
        
        logger.info(f"Comprehensive analysis completed for {coin_id}: "
                   f"${enhanced_data.total_liquidity_usd:,.0f} total, "
                   f"global score {enhanced_data.global_risk_score:.1f}/10, "
                   f"{enhanced_data.chain_count} chains analyzed")
        
        return enhanced_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in comprehensive analysis for {coin_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Comprehensive analysis failed: {str(e)}"
        )


@router.get("/risk-score/{coin_id}")
async def get_liquidity_risk_score(coin_id: str):
    """
    Get liquidity risk score for a stablecoin (0-100, lower is better)
    Enhanced with per-chain breakdowns
    """
    try:
        logger.info(f"Calculating liquidity risk score for: {coin_id}")
        
        # Get both legacy and enhanced analysis
        liquidity_data = await liquidity_service.get_stablecoin_liquidity_analysis(coin_id)
        enhanced_data = await enhanced_liquidity_service.get_comprehensive_liquidity_analysis(coin_id)
        
        if not liquidity_data:
            raise HTTPException(
                status_code=404,
                detail=f"Cannot calculate risk score: liquidity data not available for {coin_id}"
            )
        
        # Calculate legacy risk score
        risk_score = await liquidity_service.get_liquidity_risk_score(liquidity_data)
        
        # Determine risk level
        if risk_score <= 20:
            risk_level = "low"
        elif risk_score <= 40:
            risk_level = "medium"  
        elif risk_score <= 70:
            risk_level = "high"
        else:
            risk_level = "critical"
        
        # Enhanced response with per-chain data if available
        result = {
            "coin_id": coin_id,
            "liquidity_risk_score": risk_score,
            "risk_level": risk_level,
            "total_liquidity_usd": liquidity_data.total_liquidity_usd,
            "chain_count": liquidity_data.chain_count,
            "concentration_percent": liquidity_data.liquidity_concentration_percent,
            "scoring_factors": {
                "total_liquidity": "40% weight - Higher liquidity = lower risk",
                "chain_diversification": "30% weight - More chains = lower risk", 
                "concentration": "30% weight - Lower concentration = lower risk"
            }
        }
        
        # Add enhanced data if available
        if enhanced_data:
            result["enhanced_scoring"] = {
                "global_score_0_10": enhanced_data.global_risk_score,
                "global_risk_level": enhanced_data.global_risk_level,
                "chains_with_warnings": enhanced_data.chains_with_critical_risk,
                "has_critical_warnings": enhanced_data.has_critical_warnings,
                "diversification_good": enhanced_data.diversification_good,
                "per_chain_scores": [
                    {
                        "chain": score.chain_name,
                        "score": score.final_score,
                        "risk_level": score.risk_level,
                        "tvl_usd": score.tvl_usd,
                        "critical_warning": score.critical_warning
                    }
                    for score in enhanced_data.chain_scores
                ]
            }
        
        logger.info(f"Risk score for {coin_id}: {risk_score:.1f} ({risk_level})")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating liquidity risk score for {coin_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Risk score calculation failed: {str(e)}"
        )


@router.get("/per-chain-analysis/{coin_id}")
async def get_per_chain_analysis(
    coin_id: str,
    chain: Optional[str] = Query(None, description="Filter by specific chain")
):
    """
    Get detailed per-chain liquidity analysis with scoring breakdown
    NEW ENDPOINT - Provides granular per-chain insights
    """
    try:
        logger.info(f"Fetching per-chain analysis for {coin_id}")
        
        # Get comprehensive analysis
        enhanced_data = await enhanced_liquidity_service.get_comprehensive_liquidity_analysis(coin_id)
        
        if not enhanced_data:
            raise HTTPException(
                status_code=404,
                detail=f"Per-chain data not available for: {coin_id}"
            )
        
        # Filter by chain if specified
        chain_scores = enhanced_data.chain_scores
        if chain:
            chain_scores = [
                cs for cs in chain_scores 
                if cs.chain_id.lower() == chain.lower()
            ]
            
            if not chain_scores:
                raise HTTPException(
                    status_code=404,
                    detail=f"No analysis found for {coin_id} on {chain}"
                )
        
        # Format detailed response
        result = {
            "coin_id": coin_id,
            "analysis_timestamp": enhanced_data.analysis_timestamp.isoformat(),
            "global_metrics": {
                "total_liquidity_usd": enhanced_data.total_liquidity_usd,
                "global_risk_score": enhanced_data.global_risk_score,
                "global_risk_level": enhanced_data.global_risk_level,
                "chains_analyzed": enhanced_data.chain_count,
                "avg_score_per_chain": enhanced_data.avg_score_per_chain
            },
            "risk_flags": {
                "has_critical_warnings": enhanced_data.has_critical_warnings,
                "concentration_risk": enhanced_data.concentration_risk,
                "diversification_good": enhanced_data.diversification_good
            },
            "per_chain_analysis": []
        }
        
        for chain_score in chain_scores:
            chain_data = {
                "chain_info": {
                    "chain_id": chain_score.chain_id,
                    "chain_name": chain_score.chain_name,
                    "tvl_usd": chain_score.tvl_usd,
                    "data_confidence": chain_score.data_confidence
                },
                "scoring": {
                    "base_score": chain_score.base_score,
                    "adjustments": chain_score.adjustments,
                    "final_score": chain_score.final_score,
                    "risk_level": chain_score.risk_level,
                    "risk_color": chain_score.risk_color,
                    "critical_warning": chain_score.critical_warning
                },
                "dex_analysis": {
                    "total_dex_count": chain_score.dex_analysis.total_dex_count,
                    "dexs_over_100k": chain_score.dex_analysis.dexs_over_100k,
                    "largest_dex_percent": chain_score.dex_analysis.largest_dex_percent,
                    "top_dexs": chain_score.dex_analysis.top_dexs,
                    "dex_names": chain_score.dex_analysis.dex_names
                },
                "pool_composition": {
                    "stable_stable_percent": chain_score.pool_composition.stable_stable_percent,
                    "volatile_stable_percent": chain_score.pool_composition.volatile_stable_percent,
                    "unknown_percent": chain_score.pool_composition.unknown_percent,
                    "stable_tokens": chain_score.pool_composition.stable_tokens,
                    "volatile_tokens": chain_score.pool_composition.volatile_tokens
                },
                "risk_factors": {
                    "high_lp_centralization": chain_score.risk_factors.high_lp_centralization,
                    "concentration_risk": chain_score.risk_factors.concentration_risk,
                    "flash_loan_vulnerability": chain_score.risk_factors.flash_loan_vulnerability,
                    "no_monitoring_controls": chain_score.risk_factors.no_monitoring_controls,
                    "recent_drain_events": chain_score.risk_factors.recent_drain_events
                }
            }
            result["per_chain_analysis"].append(chain_data)
        
        logger.info(f"Per-chain analysis completed for {coin_id}: {len(chain_scores)} chains")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in per-chain analysis for {coin_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Per-chain analysis failed: {str(e)}"
        )


@router.get("/pools/{coin_id}")
async def get_liquidity_pools(
    coin_id: str,
    chain: Optional[str] = Query(None, description="Filter by specific chain"),
    limit: int = Query(10, ge=1, le=50, description="Maximum number of pools per chain")
):
    """
    Get detailed liquidity pool information for a stablecoin
    Enhanced with pool composition and DEX analysis
    """
    try:
        logger.info(f"Fetching liquidity pools for {coin_id}")
        
        # Get both legacy and enhanced data
        liquidity_data = await liquidity_service.get_stablecoin_liquidity_analysis(coin_id)
        enhanced_data = await enhanced_liquidity_service.get_comprehensive_liquidity_analysis(coin_id)
        
        if not liquidity_data:
            raise HTTPException(
                status_code=404,
                detail=f"Pool data not available for: {coin_id}"
            )
        
        # Filter by chain if specified
        chain_breakdown = liquidity_data.chain_breakdown
        if chain:
            chain_breakdown = [
                cl for cl in chain_breakdown 
                if cl.chain_id.lower() == chain.lower()
            ]
            
            if not chain_breakdown:
                raise HTTPException(
                    status_code=404,
                    detail=f"No pools found for {coin_id} on {chain}"
                )
        
        # Format response with enhanced data
        result = {
            "coin_id": coin_id,
            "total_liquidity_usd": liquidity_data.total_liquidity_usd,
            "chains": []
        }
        
        for chain_data in chain_breakdown:
            chain_result = {
                "chain_name": chain_data.chain_name,
                "chain_id": chain_data.chain_id,
                "total_liquidity_usd": chain_data.total_liquidity_usd,
                "pool_count": chain_data.pool_count,
                "pools": chain_data.top_pools[:limit]
            }
            
            # Add enhanced analysis if available
            if enhanced_data:
                chain_score = next(
                    (cs for cs in enhanced_data.chain_scores if cs.chain_id == chain_data.chain_id),
                    None
                )
                if chain_score:
                    chain_result["enhanced_analysis"] = {
                        "risk_score": chain_score.final_score,
                        "risk_level": chain_score.risk_level,
                        "dex_diversity": chain_score.dex_analysis.dexs_over_100k,
                        "pool_composition": {
                            "stable_stable_percent": chain_score.pool_composition.stable_stable_percent,
                            "volatile_stable_percent": chain_score.pool_composition.volatile_stable_percent
                        },
                        "risk_warnings": {
                            "critical_warning": chain_score.critical_warning,
                            "concentration_risk": chain_score.risk_factors.concentration_risk,
                            "flash_loan_risk": chain_score.risk_factors.flash_loan_vulnerability
                        }
                    }
            
            result["chains"].append(chain_result)
        
        logger.info(f"Retrieved pool data for {coin_id} across {len(result['chains'])} chains")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching pools for {coin_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Pool data retrieval failed: {str(e)}"
        )


@router.get("/heatmap-data/{coin_id}")
async def get_liquidity_heatmap_data(coin_id: str):
    """
    Get liquidity data formatted for frontend heatmap visualization
    NEW ENDPOINT - Optimized for per-chain risk visualization
    """
    try:
        logger.info(f"Generating heatmap data for {coin_id}")
        
        # Get comprehensive analysis
        enhanced_data = await enhanced_liquidity_service.get_comprehensive_liquidity_analysis(coin_id)
        
        if not enhanced_data:
            raise HTTPException(
                status_code=404,
                detail=f"Heatmap data not available for: {coin_id}"
            )
        
        # Format for heatmap visualization
        heatmap_data = {
            "coin_id": coin_id,
            "global_score": enhanced_data.global_risk_score,
            "global_risk_level": enhanced_data.global_risk_level,
            "total_liquidity_usd": enhanced_data.total_liquidity_usd,
            "chains": []
        }
        
        for chain_score in enhanced_data.chain_scores:
            chain_heatmap = {
                "chain_id": chain_score.chain_id,
                "chain_name": chain_score.chain_name,
                "score": chain_score.final_score,
                "color": chain_score.risk_color,
                "risk_level": chain_score.risk_level,
                "tvl_usd": chain_score.tvl_usd,
                "tvl_percent": (chain_score.tvl_usd / enhanced_data.total_liquidity_usd * 100) if enhanced_data.total_liquidity_usd > 0 else 0,
                "critical_warning": chain_score.critical_warning,
                "tooltip_data": {
                    "tvl": f"${chain_score.tvl_usd:,.0f}",
                    "dex_count": chain_score.dex_analysis.total_dex_count,
                    "dexs_over_100k": chain_score.dex_analysis.dexs_over_100k,
                    "largest_dex_percent": f"{chain_score.dex_analysis.largest_dex_percent:.1f}%",
                    "stable_stable_percent": f"{chain_score.pool_composition.stable_stable_percent:.1f}%",
                    "concentration_risk": chain_score.risk_factors.concentration_risk,
                    "flash_loan_risk": chain_score.risk_factors.flash_loan_vulnerability,
                    "adjustments": chain_score.adjustments
                }
            }
            heatmap_data["chains"].append(chain_heatmap)
        
        # Sort by TVL for consistent display
        heatmap_data["chains"].sort(key=lambda x: x["tvl_usd"], reverse=True)
        
        logger.info(f"Generated heatmap data for {coin_id}: {len(heatmap_data['chains'])} chains")
        return heatmap_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating heatmap data for {coin_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Heatmap data generation failed: {str(e)}"
        )


@router.get("/summary")
async def get_liquidity_summary():
    """
    Get a summary of supported stablecoins and their liquidity analysis capabilities
    Enhanced with new endpoint information
    """
    try:
        # List of major stablecoins we can analyze
        supported_coins = [
            {
                "coin_id": "tether",
                "symbol": "USDT",
                "name": "Tether",
                "supported_chains": ["eth", "bsc", "polygon", "arbitrum"]
            },
            {
                "coin_id": "usd-coin", 
                "symbol": "USDC",
                "name": "USD Coin",
                "supported_chains": ["eth", "bsc", "polygon", "arbitrum"]
            },
            {
                "coin_id": "dai",
                "symbol": "DAI", 
                "name": "Dai",
                "supported_chains": ["eth", "bsc", "polygon"]
            }
        ]
        
        return {
            "supported_stablecoins": supported_coins,
            "total_supported": len(supported_coins),
            "data_sources": ["GeckoTerminal", "DeFiLlama"],
            "cache_duration": "1 hour",
            "analysis_features": {
                "per_chain_scoring": "0-10 scale with bonus/penalty adjustments",
                "pool_composition": "Stable/stable vs volatile/stable analysis",
                "dex_diversity": "DEX count and concentration metrics",
                "risk_factors": "LP centralization, drain events, flash loan risk",
                "heatmap_support": "Color-coded per-chain risk visualization"
            },
            "available_endpoints": {
                "legacy": [
                    "/api/v1/liquidity/analysis/{coin_id}",
                    "/api/v1/liquidity/risk-score/{coin_id}",
                    "/api/v1/liquidity/pools/{coin_id}"
                ],
                "enhanced": [
                    "/api/v1/liquidity/comprehensive-analysis/{coin_id}",
                    "/api/v1/liquidity/per-chain-analysis/{coin_id}",
                    "/api/v1/liquidity/heatmap-data/{coin_id}"
                ]
            }
        }
        
    except Exception as e:
        logger.error(f"Error generating liquidity summary: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Summary generation failed: {str(e)}"
        ) 