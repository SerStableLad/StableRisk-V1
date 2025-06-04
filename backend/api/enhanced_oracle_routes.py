"""
Enhanced Oracle Infrastructure API Routes
Endpoints for advanced oracle mechanism analysis
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.services.enhanced_oracle_service import enhanced_oracle_service, OracleType, OracleRiskLevel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oracle", tags=["Enhanced Oracle Analysis"])


class OracleAnalysisRequest(BaseModel):
    """Request model for batch oracle analysis"""
    coin_ids: List[str]


class OracleEndpointResponse(BaseModel):
    """Response model for oracle endpoint"""
    oracle_type: str
    endpoint_url: Optional[str]
    description: str
    confidence: float
    data_feeds: List[str]
    update_frequency: Optional[str]
    reliability_score: Optional[float]


class OracleAnalysisResponse(BaseModel):
    """Response model for complete oracle analysis"""
    coin_id: str
    coin_name: str
    symbol: str
    oracle_endpoints: List[OracleEndpointResponse]
    primary_oracle: Optional[OracleEndpointResponse]
    oracle_types_used: List[str]
    oracle_risk_level: str
    centralization_score: float
    reliability_score: float
    price_feed_sources: List[str]
    fallback_mechanisms: List[str]
    oracle_dependencies: List[str]
    security_features: List[str]
    analysis_date: str
    confidence_score: float
    warnings: List[str]
    data_sources: List[str]


@router.get("/analyze/{coin_id}", response_model=OracleAnalysisResponse)
async def analyze_oracle_infrastructure(coin_id: str):
    """
    Comprehensive oracle infrastructure analysis
    
    **Analyzes:**
    - Oracle types used (Chainlink, Band Protocol, UMA, custom)
    - Price feed sources and reliability
    - Centralization and risk assessment
    - Fallback mechanisms and redundancy
    - Security features and dependencies
    
    **Features:**
    - Multi-source analysis (website, GitHub, patterns)
    - Advanced risk assessment algorithms
    - Confidence scoring for all findings
    - Detailed warnings and recommendations
    
    **Parameters:**
    - coin_id: CoinGecko coin identifier
    
    **Returns:**
    - Complete oracle infrastructure analysis with risk assessment
    """
    try:
        logger.info(f"Analyzing oracle infrastructure for {coin_id}")
        
        analysis = await enhanced_oracle_service.analyze_oracle_infrastructure(coin_id)
        
        if not analysis:
            raise HTTPException(
                status_code=404,
                detail=f"Could not analyze oracle infrastructure for {coin_id}. Check if the coin exists."
            )
        
        # Convert oracle endpoints to response format
        oracle_endpoints = [
            OracleEndpointResponse(
                oracle_type=endpoint.oracle_type.value,
                endpoint_url=endpoint.endpoint_url,
                description=endpoint.description,
                confidence=endpoint.confidence,
                data_feeds=endpoint.data_feeds,
                update_frequency=endpoint.update_frequency,
                reliability_score=endpoint.reliability_score
            ) for endpoint in analysis.oracle_endpoints
        ]
        
        primary_oracle = None
        if analysis.primary_oracle:
            primary_oracle = OracleEndpointResponse(
                oracle_type=analysis.primary_oracle.oracle_type.value,
                endpoint_url=analysis.primary_oracle.endpoint_url,
                description=analysis.primary_oracle.description,
                confidence=analysis.primary_oracle.confidence,
                data_feeds=analysis.primary_oracle.data_feeds,
                update_frequency=analysis.primary_oracle.update_frequency,
                reliability_score=analysis.primary_oracle.reliability_score
            )
        
        return OracleAnalysisResponse(
            coin_id=analysis.coin_id,
            coin_name=analysis.coin_name,
            symbol=analysis.symbol,
            oracle_endpoints=oracle_endpoints,
            primary_oracle=primary_oracle,
            oracle_types_used=[ot.value for ot in analysis.oracle_types_used],
            oracle_risk_level=analysis.oracle_risk_level.value,
            centralization_score=analysis.centralization_score,
            reliability_score=analysis.reliability_score,
            price_feed_sources=analysis.price_feed_sources,
            fallback_mechanisms=analysis.fallback_mechanisms,
            oracle_dependencies=analysis.oracle_dependencies,
            security_features=analysis.security_features,
            analysis_date=analysis.analysis_date.isoformat(),
            confidence_score=analysis.confidence_score,
            warnings=analysis.warnings,
            data_sources=analysis.data_sources
        )
        
    except Exception as e:
        logger.error(f"Oracle analysis failed for {coin_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Oracle analysis failed: {str(e)}")


@router.get("/risk-assessment/{coin_id}")
async def get_oracle_risk_assessment(coin_id: str):
    """
    Get focused oracle risk assessment
    
    **Features:**
    - Centralization risk scoring
    - Reliability assessment
    - Single point of failure detection
    - Risk level classification
    
    **Parameters:**
    - coin_id: CoinGecko coin identifier
    
    **Returns:**
    - Oracle risk metrics and recommendations
    """
    try:
        analysis = await enhanced_oracle_service.analyze_oracle_infrastructure(coin_id)
        
        if not analysis:
            raise HTTPException(
                status_code=404,
                detail=f"Could not assess oracle risks for {coin_id}"
            )
        
        # Calculate additional risk metrics
        oracle_count = len(analysis.oracle_endpoints)
        has_fallback = len(analysis.fallback_mechanisms) > 0
        uses_reliable_oracle = any(
            ot in [OracleType.CHAINLINK, OracleType.BAND_PROTOCOL] 
            for ot in analysis.oracle_types_used
        )
        
        # Risk scoring
        risk_factors = []
        if oracle_count == 0:
            risk_factors.append("No oracle infrastructure detected")
        elif oracle_count == 1:
            risk_factors.append("Single oracle dependency")
        
        if analysis.centralization_score > 0.7:
            risk_factors.append("High centralization risk")
        
        if analysis.reliability_score < 0.5:
            risk_factors.append("Low reliability score")
        
        if not has_fallback:
            risk_factors.append("No fallback mechanisms detected")
        
        return {
            'coin_id': analysis.coin_id,
            'symbol': analysis.symbol,
            'risk_assessment': {
                'oracle_risk_level': analysis.oracle_risk_level.value,
                'centralization_score': analysis.centralization_score,
                'reliability_score': analysis.reliability_score,
                'confidence_score': analysis.confidence_score
            },
            'oracle_metrics': {
                'total_oracles_detected': oracle_count,
                'primary_oracle': analysis.primary_oracle.oracle_type.value if analysis.primary_oracle else None,
                'uses_reliable_oracle': uses_reliable_oracle,
                'has_fallback_mechanisms': has_fallback,
                'price_feed_sources': len(analysis.price_feed_sources)
            },
            'risk_factors': risk_factors,
            'recommendations': self._generate_recommendations(analysis),
            'last_updated': analysis.analysis_date.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Oracle risk assessment failed for {coin_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Oracle risk assessment failed: {str(e)}")


def _generate_recommendations(analysis) -> List[str]:
    """Generate recommendations based on oracle analysis"""
    recommendations = []
    
    if not analysis.oracle_endpoints:
        recommendations.append("Implement oracle infrastructure for price feeds")
        recommendations.append("Consider using established oracle networks like Chainlink")
    
    elif len(analysis.oracle_endpoints) == 1:
        recommendations.append("Add redundant oracle sources to reduce single point of failure")
        recommendations.append("Implement fallback mechanisms for oracle failures")
    
    if analysis.centralization_score > 0.6:
        recommendations.append("Reduce centralization risk by using multiple oracle types")
        recommendations.append("Consider decentralized oracle networks")
    
    if analysis.reliability_score < 0.6:
        recommendations.append("Improve oracle reliability through redundancy")
        recommendations.append("Implement oracle health monitoring")
    
    if not analysis.fallback_mechanisms:
        recommendations.append("Add fallback oracle mechanisms")
        recommendations.append("Implement emergency oracle procedures")
    
    return recommendations


@router.post("/batch-analyze")
async def batch_analyze_oracles(request: OracleAnalysisRequest):
    """
    Analyze oracle infrastructure for multiple projects
    
    **Features:**
    - Batch processing for up to 15 projects
    - Comparative oracle analysis
    - Risk distribution statistics
    
    **Parameters:**
    - coin_ids: List of CoinGecko coin identifiers (max 15)
    
    **Returns:**
    - Summary analysis across all analyzed projects
    """
    try:
        if len(request.coin_ids) > 15:
            raise HTTPException(
                status_code=400,
                detail="Maximum 15 coins allowed for batch oracle analysis"
            )
        
        logger.info(f"Batch analyzing oracles for {len(request.coin_ids)} projects")
        
        summary = await enhanced_oracle_service.get_oracle_summary(request.coin_ids)
        
        if "error" in summary:
            raise HTTPException(
                status_code=400,
                detail=summary["error"]
            )
        
        return summary
        
    except Exception as e:
        logger.error(f"Batch oracle analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Batch oracle analysis failed: {str(e)}")


@router.get("/summary/{coin_id}")
async def get_oracle_summary(coin_id: str):
    """
    Get simplified oracle infrastructure summary
    
    **Features:**
    - Quick oracle overview
    - Key risk indicators
    - Primary findings suitable for dashboards
    
    **Parameters:**
    - coin_id: CoinGecko coin identifier
    
    **Returns:**
    - Simplified oracle summary for quick analysis
    """
    try:
        analysis = await enhanced_oracle_service.analyze_oracle_infrastructure(coin_id)
        
        if not analysis:
            raise HTTPException(
                status_code=404,
                detail=f"Could not generate oracle summary for {coin_id}"
            )
        
        # Determine oracle health
        oracle_health = "Poor"
        if analysis.oracle_risk_level == OracleRiskLevel.LOW:
            oracle_health = "Excellent"
        elif analysis.oracle_risk_level == OracleRiskLevel.MEDIUM:
            oracle_health = "Good"
        elif analysis.oracle_risk_level == OracleRiskLevel.HIGH:
            oracle_health = "Fair"
        
        return {
            'coin_id': analysis.coin_id,
            'symbol': analysis.symbol,
            'oracle_summary': {
                'primary_oracle': analysis.primary_oracle.oracle_type.value if analysis.primary_oracle else "None",
                'total_oracles': len(analysis.oracle_endpoints),
                'oracle_health': oracle_health,
                'risk_level': analysis.oracle_risk_level.value,
                'reliability_score': round(analysis.reliability_score, 2),
                'centralization_score': round(analysis.centralization_score, 2)
            },
            'key_insights': [
                f"Primary oracle: {analysis.primary_oracle.oracle_type.value if analysis.primary_oracle else 'None detected'}",
                f"Risk level: {analysis.oracle_risk_level.value}",
                f"Reliability: {analysis.reliability_score:.1%}",
                f"Centralization: {analysis.centralization_score:.1%}"
            ],
            'top_warnings': analysis.warnings[:3],
            'confidence': analysis.confidence_score,
            'last_updated': analysis.analysis_date.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Oracle summary failed for {coin_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Oracle summary failed: {str(e)}")


@router.get("/types")
async def get_oracle_types():
    """
    Get available oracle types and their characteristics
    
    **Returns:**
    - All supported oracle types
    - Risk characteristics
    - Typical use cases
    """
    return {
        "oracle_types": {
            "Chainlink": {
                "description": "Decentralized oracle network with multiple data sources",
                "reliability": "High",
                "centralization": "Low",
                "typical_use": "DeFi price feeds, large protocols",
                "security_features": ["Multiple nodes", "Reputation system", "Cryptographic proofs"]
            },
            "Band Protocol": {
                "description": "Cross-chain oracle on Cosmos ecosystem",
                "reliability": "High", 
                "centralization": "Low",
                "typical_use": "Cross-chain applications, Cosmos DeFi",
                "security_features": ["Validator consensus", "Slashing conditions", "Multi-chain"]
            },
            "UMA": {
                "description": "Optimistic oracle with dispute resolution",
                "reliability": "Medium",
                "centralization": "Medium",
                "typical_use": "Synthetic assets, exotic derivatives",
                "security_features": ["Optimistic verification", "Economic disputes", "DVM"]
            },
            "Tellor": {
                "description": "Proof-of-work oracle network",
                "reliability": "Medium",
                "centralization": "Medium",
                "typical_use": "Alternative to Chainlink, specific data feeds",
                "security_features": ["Mining incentives", "Dispute mechanism", "Staking"]
            },
            "Custom Oracle": {
                "description": "Project-specific oracle implementation",
                "reliability": "Variable",
                "centralization": "High",
                "typical_use": "Specialized applications",
                "security_features": ["Varies by implementation"]
            }
        },
        "risk_levels": {
            "Low": "Minimal oracle-related risks, multiple reliable sources",
            "Medium": "Some oracle risks present, adequate redundancy",
            "High": "Significant oracle risks, limited redundancy",
            "Critical": "Severe oracle risks, potential single points of failure"
        }
    }


@router.get("/health")
async def oracle_service_health():
    """
    Check enhanced oracle service health
    
    **Returns:**
    - Service health status
    - Analysis capabilities
    - Configuration information
    """
    try:
        return {
            "status": "healthy",
            "service": "Enhanced Oracle Analysis",
            "capabilities": {
                "oracle_types_supported": len([ot for ot in OracleType]),
                "risk_assessment": True,
                "multi_source_analysis": True,
                "confidence_scoring": True,
                "batch_processing": True
            },
            "analysis_features": [
                "Pattern-based oracle detection",
                "Website and GitHub analysis",
                "Contract address extraction",
                "Risk level classification",
                "Centralization scoring",
                "Reliability assessment"
            ],
            "supported_oracle_types": [ot.value for ot in OracleType],
            "risk_levels": [rl.value for rl in OracleRiskLevel]
        }
    except Exception as e:
        logger.error(f"Oracle service health check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}") 