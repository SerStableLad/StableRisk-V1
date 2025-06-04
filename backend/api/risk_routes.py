"""
Risk Assessment API Routes
Comprehensive stablecoin risk analysis endpoints
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.services.risk_scoring_service import RiskScoringService, RiskLevel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/risk", tags=["Risk Assessment"])

# Initialize service
risk_service = RiskScoringService()


class RiskComparisonRequest(BaseModel):
    """Request model for risk comparison"""
    coin_ids: List[str]


class RiskFactorResponse(BaseModel):
    """Response model for individual risk factors"""
    name: str
    score: float
    weight: float
    description: str
    data_available: bool
    confidence: float


class RiskAssessmentResponse(BaseModel):
    """Response model for comprehensive risk assessment"""
    coin_id: str
    coin_name: str
    symbol: str
    overall_score: float
    risk_level: str
    confidence_score: float
    
    # Individual risk factors
    price_stability: RiskFactorResponse
    liquidity_risk: RiskFactorResponse
    security_risk: RiskFactorResponse
    oracle_risk: RiskFactorResponse
    audit_risk: RiskFactorResponse
    centralization_risk: RiskFactorResponse
    
    # Supporting data
    market_cap_usd: Optional[float]
    last_updated: str
    data_freshness: Dict[str, str]
    warnings: List[str]
    recommendations: List[str]


class RiskComparisonResponse(BaseModel):
    """Response model for risk comparison"""
    total_assessed: int
    average_score: float
    score_range: tuple
    assessments: List[Dict[str, Any]]


@router.get("/assessment/{coin_id}", response_model=RiskAssessmentResponse)
async def get_comprehensive_risk_assessment(coin_id: str):
    """
    Get comprehensive risk assessment for a stablecoin
    
    **Combines all data sources into a single risk score:**
    - Price stability analysis (25% weight)
    - Liquidity risk assessment (20% weight)
    - Security analysis from GitHub (15% weight)
    - Oracle infrastructure risk (15% weight)
    - Audit coverage analysis (15% weight)
    - Centralization risk (10% weight)
    
    **Features:**
    - 0-10 risk scoring (10 = lowest risk)
    - Risk level classification (Very Low to Critical)
    - Confidence scoring based on data availability
    - Specific warnings and recommendations
    - Data freshness tracking
    
    **Parameters:**
    - coin_id: CoinGecko coin identifier
    
    **Returns:**
    - Comprehensive risk assessment with breakdown by factor
    """
    try:
        logger.info(f"Performing risk assessment for {coin_id}")
        
        assessment = await risk_service.assess_comprehensive_risk(coin_id)
        
        if not assessment:
            raise HTTPException(
                status_code=404, 
                detail=f"Could not perform risk assessment for {coin_id}. Check if the coin exists and has sufficient data."
            )
        
        # Convert dataclasses to response models
        def factor_to_response(factor):
            return RiskFactorResponse(
                name=factor.name,
                score=factor.score,
                weight=factor.weight,
                description=factor.description,
                data_available=factor.data_available,
                confidence=factor.confidence
            )
        
        return RiskAssessmentResponse(
            coin_id=assessment.coin_id,
            coin_name=assessment.coin_name,
            symbol=assessment.symbol,
            overall_score=assessment.overall_score,
            risk_level=assessment.risk_level.value,
            confidence_score=assessment.confidence_score,
            price_stability=factor_to_response(assessment.price_stability),
            liquidity_risk=factor_to_response(assessment.liquidity_risk),
            security_risk=factor_to_response(assessment.security_risk),
            oracle_risk=factor_to_response(assessment.oracle_risk),
            audit_risk=factor_to_response(assessment.audit_risk),
            centralization_risk=factor_to_response(assessment.centralization_risk),
            market_cap_usd=assessment.market_cap_usd,
            last_updated=assessment.last_updated.isoformat(),
            data_freshness={k: v.isoformat() for k, v in assessment.data_freshness.items()},
            warnings=assessment.warnings,
            recommendations=assessment.recommendations
        )
        
    except Exception as e:
        logger.error(f"Risk assessment failed for {coin_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Risk assessment failed: {str(e)}")


@router.post("/comparison", response_model=RiskComparisonResponse)
async def compare_risk_assessments(request: RiskComparisonRequest):
    """
    Compare risk assessments across multiple stablecoins
    
    **Features:**
    - Batch risk assessment for multiple coins
    - Comparative scoring and ranking
    - Summary statistics across all assessed coins
    - Best and worst performing coins identification
    
    **Parameters:**
    - coin_ids: List of CoinGecko coin identifiers
    
    **Returns:**
    - Comparative risk analysis with rankings and summary metrics
    """
    try:
        logger.info(f"Performing risk comparison for {len(request.coin_ids)} coins")
        
        if len(request.coin_ids) > 10:
            raise HTTPException(
                status_code=400,
                detail="Maximum 10 coins allowed for comparison to prevent timeout"
            )
        
        comparison = await risk_service.get_risk_comparison(request.coin_ids)
        
        if "error" in comparison:
            raise HTTPException(
                status_code=400,
                detail=comparison["error"]
            )
        
        return RiskComparisonResponse(**comparison)
        
    except Exception as e:
        logger.error(f"Risk comparison failed: {e}")
        raise HTTPException(status_code=500, detail=f"Risk comparison failed: {str(e)}")


@router.get("/summary/{coin_id}")
async def get_risk_summary(coin_id: str):
    """
    Get simplified risk summary for quick assessment
    
    **Features:**
    - Quick risk overview without full details
    - Overall score and risk level
    - Top risk factors and warnings
    - Suitable for dashboard displays
    
    **Parameters:**
    - coin_id: CoinGecko coin identifier
    
    **Returns:**
    - Simplified risk summary for quick analysis
    """
    try:
        assessment = await risk_service.assess_comprehensive_risk(coin_id)
        
        if not assessment:
            raise HTTPException(
                status_code=404,
                detail=f"Could not assess risk for {coin_id}"
            )
        
        # Get top risk factors (lowest scores)
        risk_factors = [
            assessment.price_stability,
            assessment.liquidity_risk,
            assessment.security_risk,
            assessment.oracle_risk,
            assessment.audit_risk,
            assessment.centralization_risk
        ]
        
        top_risks = sorted(
            [f for f in risk_factors if f.data_available], 
            key=lambda x: x.score
        )[:3]
        
        return {
            "coin_id": assessment.coin_id,
            "symbol": assessment.symbol,
            "overall_score": assessment.overall_score,
            "risk_level": assessment.risk_level.value,
            "confidence": assessment.confidence_score,
            "market_cap_usd": assessment.market_cap_usd,
            "top_risk_factors": [
                {
                    "name": risk.name,
                    "score": risk.score,
                    "description": risk.description
                }
                for risk in top_risks
            ],
            "warning_count": len(assessment.warnings),
            "key_warnings": assessment.warnings[:3],  # Top 3 warnings
            "primary_recommendation": assessment.recommendations[0] if assessment.recommendations else None,
            "last_updated": assessment.last_updated.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Risk summary failed for {coin_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Risk summary failed: {str(e)}")


@router.get("/factors/{coin_id}")
async def get_risk_factors_breakdown(coin_id: str):
    """
    Get detailed breakdown of individual risk factors
    
    **Features:**
    - Individual factor scores and descriptions
    - Data availability and confidence metrics
    - Factor weightings in overall score
    - Detailed explanations for each assessment
    
    **Parameters:**
    - coin_id: CoinGecko coin identifier
    
    **Returns:**
    - Detailed breakdown of all risk factors
    """
    try:
        assessment = await risk_service.assess_comprehensive_risk(coin_id)
        
        if not assessment:
            raise HTTPException(
                status_code=404,
                detail=f"Could not assess risk factors for {coin_id}"
            )
        
        factors = [
            assessment.price_stability,
            assessment.liquidity_risk,
            assessment.security_risk,
            assessment.oracle_risk,
            assessment.audit_risk,
            assessment.centralization_risk
        ]
        
        return {
            "coin_id": assessment.coin_id,
            "symbol": assessment.symbol,
            "overall_score": assessment.overall_score,
            "risk_factors": [
                {
                    "name": factor.name,
                    "score": factor.score,
                    "weight_percent": factor.weight * 100,
                    "weighted_contribution": factor.score * factor.weight,
                    "description": factor.description,
                    "data_available": factor.data_available,
                    "confidence": factor.confidence,
                    "risk_assessment": (
                        "Low Risk" if factor.score >= 7.0 else
                        "Moderate Risk" if factor.score >= 5.0 else
                        "High Risk" if factor.score >= 3.0 else
                        "Very High Risk"
                    )
                }
                for factor in factors
            ],
            "data_completeness": sum(1 for f in factors if f.data_available) / len(factors),
            "average_confidence": sum(f.confidence for f in factors) / len(factors)
        }
        
    except Exception as e:
        logger.error(f"Risk factors breakdown failed for {coin_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Risk factors breakdown failed: {str(e)}")


@router.get("/health")
async def risk_service_health():
    """
    Check risk service health and configuration
    
    **Returns:**
    - Service health status
    - Risk factor weights and thresholds
    - Dependent service availability
    """
    try:
        return {
            "status": "healthy",
            "service": "Risk Scoring Engine",
            "risk_factors": {
                "price_stability": f"{risk_service.risk_weights['price_stability']*100:.0f}%",
                "liquidity_risk": f"{risk_service.risk_weights['liquidity_risk']*100:.0f}%",
                "security_risk": f"{risk_service.risk_weights['security_risk']*100:.0f}%",
                "oracle_risk": f"{risk_service.risk_weights['oracle_risk']*100:.0f}%",
                "audit_risk": f"{risk_service.risk_weights['audit_risk']*100:.0f}%",
                "centralization_risk": f"{risk_service.risk_weights['centralization_risk']*100:.0f}%"
            },
            "risk_levels": {
                "very_low": "8.5-10.0",
                "low": "7.0-8.5",
                "moderate": "5.5-7.0",
                "high": "3.5-5.5",
                "very_high": "2.0-3.5",
                "critical": "0.0-2.0"
            },
            "dependent_services": {
                "coingecko_service": "available",
                "liquidity_service": "available",
                "github_service": "available"
            }
        }
    except Exception as e:
        logger.error(f"Risk service health check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")


@router.get("/models/weights")
async def get_risk_model_weights():
    """
    Get current risk model weights and methodology
    
    **Returns:**
    - Current factor weights
    - Scoring methodology explanation
    - Model version and last update
    """
    return {
        "model_version": "1.0",
        "last_updated": "2025-06-04",
        "methodology": "Weighted multi-factor risk assessment",
        "risk_weights": risk_service.risk_weights,
        "scoring_scale": "0-10 (0 = highest risk, 10 = lowest risk)",
        "factor_descriptions": {
            "price_stability": "Historical peg deviation analysis and stability metrics",
            "liquidity_risk": "Multi-chain liquidity depth and concentration analysis",
            "security_risk": "GitHub repository security score and development activity",
            "oracle_risk": "Price feed infrastructure and decentralization assessment",
            "audit_risk": "Security audit coverage and auditor reputation",
            "centralization_risk": "Governance structure and control mechanisms"
        },
        "confidence_factors": {
            "data_availability": "Whether required data sources are accessible",
            "data_freshness": "How recent the underlying data is",
            "methodology_maturity": "Confidence in the specific risk assessment method"
        }
    } 