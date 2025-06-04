"""
Pegging Type Classifier Service
Analyzes stablecoins to determine their pegging mechanism: algorithmic, collateral-backed, or hybrid
"""

import asyncio
import logging
import re
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from dataclasses import dataclass
from enum import Enum
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.services.coingecko_service import CoinGeckoService

logger = logging.getLogger(__name__)


class PeggingType(Enum):
    """Types of stablecoin pegging mechanisms"""
    COLLATERAL_BACKED = "Collateral-Backed"
    ALGORITHMIC = "Algorithmic"
    HYBRID = "Hybrid"
    UNKNOWN = "Unknown"


class CollateralType(Enum):
    """Types of collateral backing"""
    FIAT_BACKED = "Fiat-Backed"           # USD reserves, bank deposits
    CRYPTO_BACKED = "Crypto-Backed"       # ETH, BTC, other crypto
    COMMODITY_BACKED = "Commodity-Backed" # Gold, silver, oil
    MIXED_COLLATERAL = "Mixed-Collateral" # Multiple types
    UNKNOWN_COLLATERAL = "Unknown"


@dataclass
class PeggingAnalysis:
    """Complete pegging mechanism analysis"""
    coin_id: str
    coin_name: str
    symbol: str
    pegging_type: PeggingType
    collateral_type: Optional[CollateralType]
    confidence_score: float  # 0-1 confidence in classification
    
    # Analysis details
    algorithmic_indicators: List[str]
    collateral_indicators: List[str]
    backing_description: str
    reserve_transparency: Optional[str]
    
    # Risk implications
    stability_risk: str  # Low, Medium, High
    complexity_risk: str # Low, Medium, High
    
    # Data sources and freshness
    analysis_date: datetime
    manual_override: Optional[str]
    sources_analyzed: List[str]


class PeggingClassifierService:
    """Service for classifying stablecoin pegging mechanisms"""
    
    def __init__(self):
        self.coingecko_service = CoinGeckoService()
        
        # Known classifications for major stablecoins (manual overrides)
        self.manual_classifications = {
            # Fiat-backed
            'tether': {
                'type': PeggingType.COLLATERAL_BACKED,
                'collateral': CollateralType.FIAT_BACKED,
                'description': 'Backed by USD reserves and short-term deposits',
                'confidence': 0.95
            },
            'usd-coin': {
                'type': PeggingType.COLLATERAL_BACKED,
                'collateral': CollateralType.FIAT_BACKED,
                'description': 'Fully backed by USD cash and short-term US treasuries',
                'confidence': 0.95
            },
            'binance-usd': {
                'type': PeggingType.COLLATERAL_BACKED,
                'collateral': CollateralType.FIAT_BACKED,
                'description': 'Backed by USD cash and cash equivalents',
                'confidence': 0.90
            },
            'true-usd': {
                'type': PeggingType.COLLATERAL_BACKED,
                'collateral': CollateralType.FIAT_BACKED,
                'description': 'Backed by USD held in escrow accounts',
                'confidence': 0.90
            },
            'paxos-standard': {
                'type': PeggingType.COLLATERAL_BACKED,
                'collateral': CollateralType.FIAT_BACKED,
                'description': 'Backed by USD deposits held in regulated banks',
                'confidence': 0.90
            },
            
            # Crypto-backed
            'dai': {
                'type': PeggingType.COLLATERAL_BACKED,
                'collateral': CollateralType.CRYPTO_BACKED,
                'description': 'Over-collateralized by crypto assets (ETH, WBTC, etc.)',
                'confidence': 0.95
            },
            'liquity-usd': {
                'type': PeggingType.COLLATERAL_BACKED,
                'collateral': CollateralType.CRYPTO_BACKED,
                'description': 'Backed by ETH collateral, decentralized',
                'confidence': 0.90
            },
            'synthetix-usd': {
                'type': PeggingType.COLLATERAL_BACKED,
                'collateral': CollateralType.CRYPTO_BACKED,
                'description': 'Backed by SNX token collateral',
                'confidence': 0.85
            },
            
            # Algorithmic
            'terrausd': {
                'type': PeggingType.ALGORITHMIC,
                'collateral': None,
                'description': 'Algorithmic supply adjustment via LUNA burning/minting (defunct)',
                'confidence': 0.95
            },
            'ampleforth': {
                'type': PeggingType.ALGORITHMIC,
                'collateral': None,
                'description': 'Algorithmic supply adjustment (rebasing)',
                'confidence': 0.90
            },
            'frax': {
                'type': PeggingType.HYBRID,
                'collateral': CollateralType.MIXED_COLLATERAL,
                'description': 'Fractional algorithmic (partial collateral + algorithmic)',
                'confidence': 0.90
            },
            
            # Commodity-backed
            'tether-gold': {
                'type': PeggingType.COLLATERAL_BACKED,
                'collateral': CollateralType.COMMODITY_BACKED,
                'description': 'Backed by physical gold reserves',
                'confidence': 0.90
            },
            'paxos-gold': {
                'type': PeggingType.COLLATERAL_BACKED,
                'collateral': CollateralType.COMMODITY_BACKED,
                'description': 'Backed by physical gold stored in vaults',
                'confidence': 0.90
            }
        }
        
        # Pattern matching for automatic classification
        self.algorithmic_keywords = [
            'algorithmic', 'algorithm', 'rebasing', 'supply adjustment',
            'elastic supply', 'burning', 'minting', 'seigniorage',
            'protocol controlled', 'autonomous', 'bond mechanism'
        ]
        
        self.collateral_keywords = {
            CollateralType.FIAT_BACKED: [
                'usd backed', 'fiat backed', 'dollar reserves', 'bank deposits',
                'cash reserves', 'treasury', 'regulated bank', 'audited reserves'
            ],
            CollateralType.CRYPTO_BACKED: [
                'crypto backed', 'crypto collateral', 'eth backed', 'btc backed',
                'over-collateralized', 'decentralized', 'vault', 'cdp'
            ],
            CollateralType.COMMODITY_BACKED: [
                'gold backed', 'silver backed', 'commodity', 'precious metals',
                'physical reserves', 'vault storage'
            ]
        }
        
        self.hybrid_keywords = [
            'fractional', 'partial', 'hybrid', 'mixed mechanism',
            'algorithmic + collateral', 'partly backed'
        ]
    
    async def classify_pegging_mechanism(self, coin_id: str) -> Optional[PeggingAnalysis]:
        """
        Classify the pegging mechanism of a stablecoin
        Combines manual classifications with automated analysis
        """
        try:
            logger.info(f"Classifying pegging mechanism for {coin_id}")
            
            # Check manual classifications first
            if coin_id in self.manual_classifications:
                manual_data = self.manual_classifications[coin_id]
                
                # Get basic metadata
                metadata = await self.coingecko_service.get_coin_metadata(coin_id)
                if not metadata:
                    return None
                
                return PeggingAnalysis(
                    coin_id=coin_id,
                    coin_name=metadata.name,
                    symbol=metadata.symbol,
                    pegging_type=manual_data['type'],
                    collateral_type=manual_data.get('collateral'),
                    confidence_score=manual_data['confidence'],
                    algorithmic_indicators=[],
                    collateral_indicators=[],
                    backing_description=manual_data['description'],
                    reserve_transparency=None,
                    stability_risk=self._assess_stability_risk(manual_data['type'], manual_data.get('collateral')),
                    complexity_risk=self._assess_complexity_risk(manual_data['type']),
                    analysis_date=datetime.utcnow(),
                    manual_override="Known classification",
                    sources_analyzed=["manual_database"]
                )
            
            # Perform automated analysis
            return await self._automated_classification(coin_id)
            
        except Exception as e:
            logger.error(f"Pegging classification failed for {coin_id}: {e}")
            return None
    
    async def _automated_classification(self, coin_id: str) -> Optional[PeggingAnalysis]:
        """Perform automated pegging mechanism classification"""
        try:
            # Get metadata for analysis
            metadata = await self.coingecko_service.get_coin_metadata(coin_id)
            if not metadata:
                return None
            
            # Analyze description and name
            text_to_analyze = []
            if metadata.description:
                text_to_analyze.append(metadata.description.lower())
            if metadata.name:
                text_to_analyze.append(metadata.name.lower())
            
            analysis_text = " ".join(text_to_analyze)
            
            # Find indicators
            algorithmic_indicators = []
            collateral_indicators = []
            collateral_type = None
            
            # Check for algorithmic indicators
            for keyword in self.algorithmic_keywords:
                if keyword in analysis_text:
                    algorithmic_indicators.append(f"Found '{keyword}' in description")
            
            # Check for collateral indicators
            for coll_type, keywords in self.collateral_keywords.items():
                found_keywords = []
                for keyword in keywords:
                    if keyword in analysis_text:
                        found_keywords.append(keyword)
                
                if found_keywords:
                    collateral_indicators.extend([f"Found '{kw}' indicating {coll_type.value}" for kw in found_keywords])
                    if not collateral_type:  # Use first match
                        collateral_type = coll_type
            
            # Check for hybrid indicators
            hybrid_indicators = []
            for keyword in self.hybrid_keywords:
                if keyword in analysis_text:
                    hybrid_indicators.append(f"Found '{keyword}' indicating hybrid mechanism")
            
            # Determine pegging type based on indicators
            pegging_type, confidence = self._determine_pegging_type(
                algorithmic_indicators, collateral_indicators, hybrid_indicators
            )
            
            # Generate backing description
            backing_description = self._generate_backing_description(
                pegging_type, collateral_type, algorithmic_indicators, collateral_indicators
            )
            
            return PeggingAnalysis(
                coin_id=coin_id,
                coin_name=metadata.name,
                symbol=metadata.symbol,
                pegging_type=pegging_type,
                collateral_type=collateral_type,
                confidence_score=confidence,
                algorithmic_indicators=algorithmic_indicators,
                collateral_indicators=collateral_indicators,
                backing_description=backing_description,
                reserve_transparency=None,  # Would need additional analysis
                stability_risk=self._assess_stability_risk(pegging_type, collateral_type),
                complexity_risk=self._assess_complexity_risk(pegging_type),
                analysis_date=datetime.utcnow(),
                manual_override=None,
                sources_analyzed=["coingecko_metadata", "description_analysis"]
            )
            
        except Exception as e:
            logger.error(f"Automated classification failed for {coin_id}: {e}")
            return None
    
    def _determine_pegging_type(self, algorithmic_indicators: List[str], 
                               collateral_indicators: List[str], 
                               hybrid_indicators: List[str]) -> Tuple[PeggingType, float]:
        """Determine pegging type based on indicators found"""
        
        algo_score = len(algorithmic_indicators)
        collateral_score = len(collateral_indicators)
        hybrid_score = len(hybrid_indicators)
        
        # Hybrid takes priority if explicitly mentioned
        if hybrid_score > 0:
            return PeggingType.HYBRID, min(0.8, 0.5 + hybrid_score * 0.1)
        
        # Strong algorithmic indicators
        if algo_score >= 2 and collateral_score == 0:
            return PeggingType.ALGORITHMIC, min(0.9, 0.6 + algo_score * 0.1)
        
        # Strong collateral indicators
        if collateral_score >= 2 and algo_score == 0:
            return PeggingType.COLLATERAL_BACKED, min(0.9, 0.6 + collateral_score * 0.1)
        
        # Mixed indicators suggest hybrid
        if algo_score > 0 and collateral_score > 0:
            return PeggingType.HYBRID, min(0.7, 0.4 + (algo_score + collateral_score) * 0.05)
        
        # Single indicators (lower confidence)
        if algo_score > 0:
            return PeggingType.ALGORITHMIC, min(0.6, 0.3 + algo_score * 0.1)
        
        if collateral_score > 0:
            return PeggingType.COLLATERAL_BACKED, min(0.6, 0.3 + collateral_score * 0.1)
        
        # No clear indicators
        return PeggingType.UNKNOWN, 0.1
    
    def _generate_backing_description(self, pegging_type: PeggingType, 
                                    collateral_type: Optional[CollateralType],
                                    algorithmic_indicators: List[str],
                                    collateral_indicators: List[str]) -> str:
        """Generate human-readable backing description"""
        
        if pegging_type == PeggingType.COLLATERAL_BACKED:
            if collateral_type:
                base = f"Appears to be {collateral_type.value.lower()}"
            else:
                base = "Appears to be collateral-backed"
            
            if collateral_indicators:
                evidence = f" (evidence: {', '.join(collateral_indicators[:2])})"
                return base + evidence
            return base
        
        elif pegging_type == PeggingType.ALGORITHMIC:
            base = "Appears to use algorithmic supply mechanisms"
            if algorithmic_indicators:
                evidence = f" (evidence: {', '.join(algorithmic_indicators[:2])})"
                return base + evidence
            return base
        
        elif pegging_type == PeggingType.HYBRID:
            return "Appears to use hybrid approach combining collateral and algorithmic mechanisms"
        
        else:
            return "Pegging mechanism unclear from available data"
    
    def _assess_stability_risk(self, pegging_type: PeggingType, 
                              collateral_type: Optional[CollateralType]) -> str:
        """Assess stability risk based on pegging mechanism"""
        
        if pegging_type == PeggingType.COLLATERAL_BACKED:
            if collateral_type == CollateralType.FIAT_BACKED:
                return "Low"  # Most stable
            elif collateral_type == CollateralType.CRYPTO_BACKED:
                return "Medium"  # Volatile collateral
            elif collateral_type == CollateralType.COMMODITY_BACKED:
                return "Medium"  # Commodity price fluctuations
            else:
                return "Medium"  # Unknown collateral type
        
        elif pegging_type == PeggingType.ALGORITHMIC:
            return "High"  # History of failures
        
        elif pegging_type == PeggingType.HYBRID:
            return "Medium"  # Mixed mechanisms
        
        else:
            return "High"  # Unknown mechanism
    
    def _assess_complexity_risk(self, pegging_type: PeggingType) -> str:
        """Assess complexity risk based on pegging mechanism"""
        
        if pegging_type == PeggingType.COLLATERAL_BACKED:
            return "Low"  # Simple and well-understood
        elif pegging_type == PeggingType.ALGORITHMIC:
            return "High"  # Complex mechanisms, many failure modes
        elif pegging_type == PeggingType.HYBRID:
            return "High"  # Most complex, multiple mechanisms
        else:
            return "Medium"  # Unknown complexity
    
    async def get_classification_summary(self, coin_ids: List[str]) -> Dict[str, Any]:
        """Get classification summary for multiple coins"""
        try:
            classifications = []
            
            for coin_id in coin_ids:
                analysis = await self.classify_pegging_mechanism(coin_id)
                if analysis:
                    classifications.append({
                        'coin_id': analysis.coin_id,
                        'symbol': analysis.symbol,
                        'pegging_type': analysis.pegging_type.value,
                        'collateral_type': analysis.collateral_type.value if analysis.collateral_type else None,
                        'confidence': analysis.confidence_score,
                        'stability_risk': analysis.stability_risk,
                        'complexity_risk': analysis.complexity_risk
                    })
            
            # Calculate statistics
            type_counts = {}
            risk_counts = {'Low': 0, 'Medium': 0, 'High': 0}
            
            for c in classifications:
                peg_type = c['pegging_type']
                type_counts[peg_type] = type_counts.get(peg_type, 0) + 1
                
                stability_risk = c['stability_risk']
                risk_counts[stability_risk] = risk_counts.get(stability_risk, 0) + 1
            
            return {
                'total_analyzed': len(classifications),
                'classifications': classifications,
                'type_distribution': type_counts,
                'stability_risk_distribution': risk_counts,
                'analysis_date': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Classification summary failed: {e}")
            return {'error': str(e)}


# Global classifier service instance
pegging_classifier = PeggingClassifierService() 