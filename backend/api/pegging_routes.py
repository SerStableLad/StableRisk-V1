"""
Pegging Type Classification API Routes
Endpoints for analyzing stablecoin pegging mechanisms
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.services.pegging_classifier import pegging_classifier, PeggingType, CollateralType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pegging", tags=["Pegging Classification"])


class PeggingClassificationRequest(BaseModel):
    """Request model for batch pegging classification"""
    coin_ids: List[str]


class PeggingAnalysisResponse(BaseModel):
    """Response model for pegging analysis"""
    coin_id: str
    coin_name: str
    symbol: str
    pegging_type: str
    collateral_type: Optional[str]
    confidence_score: float
    algorithmic_indicators: List[str]
    collateral_indicators: List[str]
    backing_description: str
    reserve_transparency: Optional[str]
    stability_risk: str
    complexity_risk: str
    analysis_date: str
    manual_override: Optional[str]
    sources_analyzed: List[str]


@router.get("/classify/{coin_id}", response_model=PeggingAnalysisResponse)
async def classify_pegging_mechanism(coin_id: str):
    """
    Classify the pegging mechanism of a stablecoin
    
    **Analyzes pegging type:**
    - Collateral-Backed (Fiat, Crypto, Commodity)
    - Algorithmic (Supply adjustment mechanisms)
    - Hybrid (Combined approaches)
    - Unknown (Insufficient data)
    
    **Features:**
    - Manual overrides for known stablecoins
    - Automated text analysis of descriptions
    - Risk assessment based on mechanism type
    - Confidence scoring for classifications
    
    **Parameters:**
    - coin_id: CoinGecko coin identifier
    
    **Returns:**
    - Complete pegging mechanism analysis with risk implications
    """
    try:
        logger.info(f"Classifying pegging mechanism for {coin_id}")
        
        analysis = await pegging_classifier.classify_pegging_mechanism(coin_id)
        
        if not analysis:
            raise HTTPException(
                status_code=404,
                detail=f"Could not classify pegging mechanism for {coin_id}. Check if the coin exists."
            )
        
        return PeggingAnalysisResponse(
            coin_id=analysis.coin_id,
            coin_name=analysis.coin_name,
            symbol=analysis.symbol,
            pegging_type=analysis.pegging_type.value,
            collateral_type=analysis.collateral_type.value if analysis.collateral_type else None,
            confidence_score=analysis.confidence_score,
            algorithmic_indicators=analysis.algorithmic_indicators,
            collateral_indicators=analysis.collateral_indicators,
            backing_description=analysis.backing_description,
            reserve_transparency=analysis.reserve_transparency,
            stability_risk=analysis.stability_risk,
            complexity_risk=analysis.complexity_risk,
            analysis_date=analysis.analysis_date.isoformat(),
            manual_override=analysis.manual_override,
            sources_analyzed=analysis.sources_analyzed
        )
        
    except Exception as e:
        logger.error(f"Pegging classification failed for {coin_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")


@router.post("/batch-classify")
async def batch_classify_pegging_mechanisms(request: PeggingClassificationRequest):
    """
    Classify pegging mechanisms for multiple stablecoins
    
    **Features:**
    - Batch analysis for up to 20 coins
    - Summary statistics across all analyzed coins
    - Type distribution and risk analysis
    
    **Parameters:**
    - coin_ids: List of CoinGecko coin identifiers (max 20)
    
    **Returns:**
    - Summary analysis with type distribution and risk statistics
    """
    try:
        if len(request.coin_ids) > 20:
            raise HTTPException(
                status_code=400,
                detail="Maximum 20 coins allowed for batch classification"
            )
        
        logger.info(f"Batch classifying {len(request.coin_ids)} coins")
        
        summary = await pegging_classifier.get_classification_summary(request.coin_ids)
        
        if "error" in summary:
            raise HTTPException(
                status_code=400,
                detail=summary["error"]
            )
        
        return summary
        
    except Exception as e:
        logger.error(f"Batch classification failed: {e}")
        raise HTTPException(status_code=500, detail=f"Batch classification failed: {str(e)}")


@router.get("/summary/{coin_id}")
async def get_pegging_summary(coin_id: str):
    """
    Get simplified pegging mechanism summary
    
    **Features:**
    - Quick pegging type and risk overview
    - Key stability and complexity indicators
    - Suitable for dashboard displays
    
    **Parameters:**
    - coin_id: CoinGecko coin identifier
    
    **Returns:**
    - Simplified pegging summary for quick analysis
    """
    try:
        analysis = await pegging_classifier.classify_pegging_mechanism(coin_id)
        
        if not analysis:
            raise HTTPException(
                status_code=404,
                detail=f"Could not analyze pegging for {coin_id}"
            )
        
        # Determine risk level
        stability_risk_score = {
            "Low": 1,
            "Medium": 2, 
            "High": 3
        }.get(analysis.stability_risk, 3)
        
        complexity_risk_score = {
            "Low": 1,
            "Medium": 2,
            "High": 3
        }.get(analysis.complexity_risk, 3)
        
        overall_risk_level = "Low" if max(stability_risk_score, complexity_risk_score) == 1 else \
                           "Medium" if max(stability_risk_score, complexity_risk_score) == 2 else "High"
        
        return {
            "coin_id": analysis.coin_id,
            "symbol": analysis.symbol,
            "pegging_type": analysis.pegging_type.value,
            "collateral_type": analysis.collateral_type.value if analysis.collateral_type else None,
            "confidence": analysis.confidence_score,
            "backing_description": analysis.backing_description,
            "risk_assessment": {
                "stability_risk": analysis.stability_risk,
                "complexity_risk": analysis.complexity_risk,
                "overall_risk_level": overall_risk_level
            },
            "key_insights": [
                f"Pegging type: {analysis.pegging_type.value}",
                f"Stability risk: {analysis.stability_risk}",
                f"Complexity: {analysis.complexity_risk}",
                f"Confidence: {analysis.confidence_score:.1%}"
            ],
            "manual_classification": analysis.manual_override is not None,
            "last_updated": analysis.analysis_date.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Pegging summary failed for {coin_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Pegging summary failed: {str(e)}")


@router.get("/types")
async def get_pegging_types():
    """
    Get available pegging types and their descriptions
    
    **Returns:**
    - All pegging mechanism types
    - Collateral types and descriptions
    - Risk implications for each type
    """
    return {
        "pegging_types": {
            "Collateral-Backed": {
                "description": "Backed by reserves of assets (fiat, crypto, commodities)",
                "stability_risk": "Low to Medium (depends on collateral type)",
                "complexity": "Low",
                "examples": ["USDT", "USDC", "DAI"]
            },
            "Algorithmic": {
                "description": "Uses algorithmic supply adjustments to maintain peg",
                "stability_risk": "High",
                "complexity": "High", 
                "examples": ["AMPL", "UST (defunct)"]
            },
            "Hybrid": {
                "description": "Combines collateral backing with algorithmic mechanisms",
                "stability_risk": "Medium",
                "complexity": "High",
                "examples": ["FRAX"]
            },
            "Unknown": {
                "description": "Insufficient data to determine mechanism",
                "stability_risk": "High (precautionary)",
                "complexity": "Unknown",
                "examples": []
            }
        },
        "collateral_types": {
            "Fiat-Backed": {
                "description": "Backed by traditional currency reserves",
                "stability": "High",
                "transparency": "Varies (audit dependent)"
            },
            "Crypto-Backed": {
                "description": "Backed by cryptocurrency collateral",
                "stability": "Medium (volatile collateral)",
                "transparency": "High (on-chain verification)"
            },
            "Commodity-Backed": {
                "description": "Backed by physical commodities",
                "stability": "Medium (commodity price exposure)",
                "transparency": "Low (requires physical audits)"
            },
            "Mixed-Collateral": {
                "description": "Multiple types of backing assets",
                "stability": "Varies",
                "transparency": "Complex"
            }
        }
    }


@router.get("/health")
async def pegging_service_health():
    """
    Check pegging classification service health
    
    **Returns:**
    - Service health status
    - Number of known classifications
    - Available analysis capabilities
    """
    try:
        return {
            "status": "healthy",
            "service": "Pegging Type Classifier",
            "capabilities": {
                "manual_classifications": len(pegging_classifier.manual_classifications),
                "algorithmic_keywords": len(pegging_classifier.algorithmic_keywords),
                "collateral_categories": len(pegging_classifier.collateral_keywords),
                "hybrid_keywords": len(pegging_classifier.hybrid_keywords)
            },
            "supported_types": [ptype.value for ptype in PeggingType],
            "collateral_types": [ctype.value for ctype in CollateralType],
            "analysis_features": [
                "Manual override database",
                "Automated text analysis", 
                "Risk assessment",
                "Confidence scoring",
                "Batch processing"
            ]
        }
    except Exception as e:
        logger.error(f"Pegging service health check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")


@router.get("/known-classifications")
async def get_known_classifications():
    """
    Get all known manual classifications
    
    **Returns:**
    - All manually classified stablecoins
    - Their pegging types and confidence scores
    - Coverage statistics
    """
    try:
        known_coins = []
        
        for coin_id, data in pegging_classifier.manual_classifications.items():
            known_coins.append({
                "coin_id": coin_id,
                "pegging_type": data['type'].value,
                "collateral_type": data.get('collateral').value if data.get('collateral') else None,
                "description": data['description'],
                "confidence": data['confidence']
            })
        
        # Calculate statistics
        type_counts = {}
        for coin in known_coins:
            ptype = coin['pegging_type']
            type_counts[ptype] = type_counts.get(ptype, 0) + 1
        
        return {
            "total_known_classifications": len(known_coins),
            "classifications": sorted(known_coins, key=lambda x: x['coin_id']),
            "type_distribution": type_counts,
            "coverage": {
                "major_stablecoins": "Extensive coverage of top 20 stablecoins",
                "algorithmic_coins": "Known algorithmic and hybrid mechanisms",
                "specialized_coins": "Commodity-backed and niche stablecoins"
            }
        }
        
    except Exception as e:
        logger.error(f"Known classifications retrieval failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get known classifications: {str(e)}") 