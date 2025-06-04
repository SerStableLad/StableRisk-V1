"""
Risk Scoring Engine Service
Combines price, liquidity, security, and oracle data into comprehensive risk assessments
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
import statistics
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.services.coingecko_service import CoinGeckoService
from backend.services.liquidity_service import enhanced_liquidity_service
from backend.services.github_service import GitHubCrawlerService

logger = logging.getLogger(__name__)


class RiskLevel(Enum):
    """Risk level classifications"""
    VERY_LOW = "Very Low"
    LOW = "Low"
    MODERATE = "Moderate"
    HIGH = "High"
    VERY_HIGH = "Very High"
    CRITICAL = "Critical"


@dataclass
class RiskFactor:
    """Individual risk factor assessment"""
    name: str
    score: float  # 0-10 scale (0 = highest risk, 10 = lowest risk)
    weight: float  # Importance weight (0-1)
    description: str
    data_available: bool
    confidence: float  # Confidence in the assessment (0-1)


@dataclass
class RiskAssessment:
    """Comprehensive risk assessment for a stablecoin"""
    coin_id: str
    coin_name: str
    symbol: str
    overall_score: float  # 0-10 scale
    risk_level: RiskLevel
    confidence_score: float  # Overall confidence (0-1)
    
    # Individual risk factors
    price_stability: RiskFactor
    liquidity_risk: RiskFactor
    security_risk: RiskFactor
    oracle_risk: RiskFactor
    audit_risk: RiskFactor
    centralization_risk: RiskFactor
    
    # Supporting data
    market_cap_usd: Optional[float]
    last_updated: datetime
    data_freshness: Dict[str, datetime]
    warnings: List[str]
    recommendations: List[str]


class RiskScoringService:
    """Comprehensive risk scoring engine for stablecoins"""
    
    def __init__(self):
        self.coingecko_service = CoinGeckoService()
        self.liquidity_service = enhanced_liquidity_service
        self.github_service = GitHubCrawlerService()
        
        # Risk factor weights (must sum to 1.0)
        self.risk_weights = {
            'price_stability': 0.25,    # 25% - Most important for stablecoins
            'liquidity_risk': 0.20,     # 20% - Critical for redemptions
            'security_risk': 0.15,      # 15% - Audit and code quality
            'oracle_risk': 0.15,        # 15% - Price feed reliability
            'audit_risk': 0.15,         # 15% - External security validation
            'centralization_risk': 0.10  # 10% - Governance and control
        }
        
        # Risk level thresholds
        self.risk_thresholds = {
            RiskLevel.VERY_LOW: (8.5, 10.0),
            RiskLevel.LOW: (7.0, 8.5),
            RiskLevel.MODERATE: (5.5, 7.0),
            RiskLevel.HIGH: (3.5, 5.5),
            RiskLevel.VERY_HIGH: (2.0, 3.5),
            RiskLevel.CRITICAL: (0.0, 2.0)
        }
    
    async def assess_comprehensive_risk(self, coin_id: str) -> Optional[RiskAssessment]:
        """
        Perform comprehensive risk assessment for a stablecoin
        Combines all data sources into a single risk score
        """
        try:
            logger.info(f"Starting comprehensive risk assessment for {coin_id}")
            
            # Gather all data sources
            metadata = await self.coingecko_service.get_coin_metadata(coin_id)
            if not metadata:
                logger.error(f"Could not fetch metadata for {coin_id}")
                return None
            
            price_analysis = await self.coingecko_service.get_price_history(coin_id)
            liquidity_analysis = await self.liquidity_service.get_comprehensive_liquidity_analysis(coin_id)
            
            # Get GitHub repository analysis if available
            github_analysis = None
            if metadata.github_repos:
                try:
                    github_analysis = await self.github_service.analyze_repository(metadata.github_repos[0])
                except Exception as e:
                    logger.warning(f"GitHub analysis failed for {coin_id}: {e}")
            
            # Calculate individual risk factors
            price_stability = self._assess_price_stability(price_analysis)
            liquidity_risk = self._assess_liquidity_risk(liquidity_analysis)
            security_risk = self._assess_security_risk(github_analysis, metadata)
            oracle_risk = self._assess_oracle_risk(github_analysis)
            audit_risk = self._assess_audit_risk(github_analysis)
            centralization_risk = self._assess_centralization_risk(metadata, github_analysis)
            
            # Calculate overall risk score
            risk_factors = [price_stability, liquidity_risk, security_risk, oracle_risk, audit_risk, centralization_risk]
            overall_score, confidence_score = self._calculate_overall_score(risk_factors)
            risk_level = self._determine_risk_level(overall_score)
            
            # Generate warnings and recommendations
            warnings = self._generate_warnings(risk_factors, metadata)
            recommendations = self._generate_recommendations(risk_factors, overall_score)
            
            # Create data freshness tracking
            data_freshness = {
                'price_data': datetime.utcnow() if price_analysis else None,
                'liquidity_data': datetime.utcnow() if liquidity_analysis else None,
                'security_data': datetime.utcnow() if github_analysis else None,
                'metadata': datetime.utcnow()
            }
            data_freshness = {k: v for k, v in data_freshness.items() if v is not None}
            
            return RiskAssessment(
                coin_id=coin_id,
                coin_name=metadata.name,
                symbol=metadata.symbol,
                overall_score=overall_score,
                risk_level=risk_level,
                confidence_score=confidence_score,
                price_stability=price_stability,
                liquidity_risk=liquidity_risk,
                security_risk=security_risk,
                oracle_risk=oracle_risk,
                audit_risk=audit_risk,
                centralization_risk=centralization_risk,
                market_cap_usd=metadata.market_cap_usd,
                last_updated=datetime.utcnow(),
                data_freshness=data_freshness,
                warnings=warnings,
                recommendations=recommendations
            )
            
        except Exception as e:
            logger.error(f"Risk assessment failed for {coin_id}: {e}")
            return None
    
    def _assess_price_stability(self, price_analysis) -> RiskFactor:
        """Assess price stability risk based on peg analysis"""
        if not price_analysis:
            return RiskFactor(
                name="Price Stability",
                score=5.0,  # Neutral score for missing data
                weight=self.risk_weights['price_stability'],
                description="No price data available",
                data_available=False,
                confidence=0.0
            )
        
        # Calculate score based on peg deviation metrics
        max_deviation = price_analysis.max_deviation_percent
        avg_deviation = price_analysis.average_deviation_percent
        stability_score = price_analysis.stability_score
        
        # Convert stability metrics to risk score (higher stability = lower risk)
        if max_deviation < 0.5 and avg_deviation < 0.1:
            score = 9.0 + stability_score  # Excellent stability
        elif max_deviation < 1.0 and avg_deviation < 0.2:
            score = 8.0 + stability_score * 0.8  # Very good stability
        elif max_deviation < 2.0 and avg_deviation < 0.5:
            score = 6.0 + stability_score * 0.6  # Good stability
        elif max_deviation < 5.0 and avg_deviation < 1.0:
            score = 4.0 + stability_score * 0.4  # Moderate stability
        elif max_deviation < 10.0:
            score = 2.0 + stability_score * 0.2  # Poor stability
        else:
            score = 0.5  # Very poor stability
        
        # Factor in recent depegs
        if price_analysis.recent_depegs > 0:
            score *= 0.7  # Penalty for recent depegs
        
        score = max(0.0, min(score, 10.0))
        
        description = f"Max deviation: {max_deviation:.2f}%, Avg: {avg_deviation:.2f}%, Recent depegs: {price_analysis.recent_depegs}"
        
        return RiskFactor(
            name="Price Stability",
            score=score,
            weight=self.risk_weights['price_stability'],
            description=description,
            data_available=True,
            confidence=0.9
        )
    
    def _assess_liquidity_risk(self, liquidity_analysis) -> RiskFactor:
        """Assess liquidity risk based on multi-chain analysis"""
        if not liquidity_analysis:
            return RiskFactor(
                name="Liquidity Risk",
                score=5.0,
                weight=self.risk_weights['liquidity_risk'],
                description="No liquidity data available",
                data_available=False,
                confidence=0.0
            )
        
        # Use the enhanced liquidity analysis data structure
        total_tvl = liquidity_analysis.total_liquidity_usd
        avg_risk_score = liquidity_analysis.global_risk_score
        chain_count = liquidity_analysis.chain_count
        
        # Convert liquidity metrics to risk score (higher liquidity = lower risk)
        if total_tvl > 1_000_000_000:  # > $1B
            base_score = 9.0
        elif total_tvl > 500_000_000:  # > $500M
            base_score = 8.0
        elif total_tvl > 100_000_000:  # > $100M
            base_score = 7.0
        elif total_tvl > 50_000_000:   # > $50M
            base_score = 6.0
        elif total_tvl > 10_000_000:   # > $10M
            base_score = 4.0
        else:
            base_score = 2.0
        
        # Adjust based on risk score and diversification
        score = (base_score + avg_risk_score) / 2
        
        # Bonus for multi-chain diversification
        if chain_count >= 3:
            score += 0.5
        elif chain_count >= 2:
            score += 0.3
        
        # Penalty for critical warnings
        if liquidity_analysis.has_critical_warnings:
            score *= 0.8
        
        # Bonus for good diversification
        if liquidity_analysis.diversification_good:
            score += 0.3
        
        score = max(0.0, min(score, 10.0))
        
        description = f"Total TVL: ${total_tvl/1_000_000:.0f}M, Chains: {chain_count}, Global risk: {avg_risk_score:.1f}/10"
        
        return RiskFactor(
            name="Liquidity Risk",
            score=score,
            weight=self.risk_weights['liquidity_risk'],
            description=description,
            data_available=True,
            confidence=0.8
        )
    
    def _assess_security_risk(self, github_analysis, metadata) -> RiskFactor:
        """Assess security risk based on GitHub analysis and metadata"""
        if not github_analysis:
            return RiskFactor(
                name="Security Risk",
                score=5.0,
                weight=self.risk_weights['security_risk'],
                description="No repository data available",
                data_available=False,
                confidence=0.0
            )
        
        # Use GitHub security score directly (already 0-10 scale)
        security_score = github_analysis.security_score
        
        # Adjust based on repository activity
        days_since_update = (datetime.utcnow() - github_analysis.last_updated).days
        if days_since_update > 365:
            security_score *= 0.8  # Penalty for stale repos
        elif days_since_update < 30:
            security_score *= 1.1  # Bonus for active development
        
        score = max(0.0, min(security_score, 10.0))
        
        description = f"GitHub security score: {github_analysis.security_score:.1f}/10, Last update: {days_since_update} days ago"
        
        return RiskFactor(
            name="Security Risk",
            score=score,
            weight=self.risk_weights['security_risk'],
            description=description,
            data_available=True,
            confidence=0.7
        )
    
    def _assess_oracle_risk(self, github_analysis) -> RiskFactor:
        """Assess oracle infrastructure risk"""
        if not github_analysis or not github_analysis.oracle_info:
            return RiskFactor(
                name="Oracle Risk",
                score=3.0,  # Conservative score for unknown oracle setup
                weight=self.risk_weights['oracle_risk'],
                description="Oracle infrastructure unknown",
                data_available=False,
                confidence=0.3
            )
        
        # Use oracle decentralization score
        oracle_score = github_analysis.oracle_info.decentralization_score
        oracle_type = github_analysis.oracle_info.oracle_type
        
        description = f"Oracle type: {oracle_type}, Decentralization: {oracle_score:.1f}/10"
        
        return RiskFactor(
            name="Oracle Risk",
            score=oracle_score,
            weight=self.risk_weights['oracle_risk'],
            description=description,
            data_available=True,
            confidence=0.8
        )
    
    def _assess_audit_risk(self, github_analysis) -> RiskFactor:
        """Assess audit coverage and quality risk"""
        if not github_analysis:
            return RiskFactor(
                name="Audit Risk",
                score=3.0,
                weight=self.risk_weights['audit_risk'],
                description="No audit information available",
                data_available=False,
                confidence=0.0
            )
        
        audit_count = github_analysis.audit_count
        has_recent_audits = github_analysis.has_recent_audits
        
        # Score based on audit coverage
        if audit_count >= 3 and has_recent_audits:
            score = 9.0  # Excellent audit coverage
        elif audit_count >= 2 and has_recent_audits:
            score = 8.0  # Good coverage
        elif audit_count >= 1 and has_recent_audits:
            score = 7.0  # Adequate coverage
        elif audit_count >= 1:
            score = 5.0  # Some audits but outdated
        else:
            score = 2.0  # No audits found
        
        description = f"Audits found: {audit_count}, Recent audits: {has_recent_audits}"
        
        return RiskFactor(
            name="Audit Risk",
            score=score,
            weight=self.risk_weights['audit_risk'],
            description=description,
            data_available=True,
            confidence=0.7
        )
    
    def _assess_centralization_risk(self, metadata, github_analysis) -> RiskFactor:
        """Assess centralization and governance risk"""
        score = 5.0  # Base neutral score
        factors = []
        
        # Check for governance indicators in metadata
        if hasattr(metadata, 'description') and metadata.description:
            desc_lower = metadata.description.lower()
            if 'decentralized' in desc_lower or 'dao' in desc_lower:
                score += 1.0
                factors.append("decentralized governance")
            if 'collateralized' in desc_lower or 'backed' in desc_lower:
                score += 0.5
                factors.append("collateral backing")
        
        # Multi-sig indicators from GitHub
        if github_analysis and github_analysis.oracle_info:
            if github_analysis.oracle_info.oracle_type in ['chainlink', 'band']:
                score += 1.0  # Decentralized oracles
                factors.append("decentralized oracles")
        
        # Penalty for unknown governance
        if not factors:
            score = 4.0
            factors.append("governance structure unclear")
        
        score = max(0.0, min(score, 10.0))
        description = f"Factors: {', '.join(factors)}"
        
        return RiskFactor(
            name="Centralization Risk",
            score=score,
            weight=self.risk_weights['centralization_risk'],
            description=description,
            data_available=True,
            confidence=0.5
        )
    
    def _calculate_overall_score(self, risk_factors: List[RiskFactor]) -> Tuple[float, float]:
        """Calculate weighted overall risk score and confidence"""
        total_weighted_score = 0.0
        total_weight = 0.0
        confidences = []
        
        for factor in risk_factors:
            if factor.data_available:
                total_weighted_score += factor.score * factor.weight * factor.confidence
                total_weight += factor.weight * factor.confidence
                confidences.append(factor.confidence)
            else:
                # Use neutral score for missing data with reduced weight
                total_weighted_score += 5.0 * factor.weight * 0.3
                total_weight += factor.weight * 0.3
                confidences.append(0.3)
        
        overall_score = total_weighted_score / total_weight if total_weight > 0 else 5.0
        confidence_score = statistics.mean(confidences) if confidences else 0.0
        
        return round(overall_score, 2), round(confidence_score, 2)
    
    def _determine_risk_level(self, score: float) -> RiskLevel:
        """Determine risk level based on score"""
        for level, (min_score, max_score) in self.risk_thresholds.items():
            if min_score <= score < max_score:
                return level
        return RiskLevel.CRITICAL
    
    def _generate_warnings(self, risk_factors: List[RiskFactor], metadata) -> List[str]:
        """Generate warnings based on risk assessment"""
        warnings = []
        
        for factor in risk_factors:
            if factor.score < 3.0 and factor.data_available:
                warnings.append(f"HIGH RISK: {factor.name} - {factor.description}")
            elif factor.score < 5.0 and factor.data_available:
                warnings.append(f"MODERATE RISK: {factor.name} - {factor.description}")
            elif not factor.data_available:
                warnings.append(f"DATA MISSING: {factor.name} - Limited assessment possible")
        
        # Market cap warnings
        if metadata.market_cap_usd and metadata.market_cap_usd < 10_000_000:
            warnings.append("LOW MARKET CAP: Small market cap increases volatility risk")
        
        return warnings
    
    def _generate_recommendations(self, risk_factors: List[RiskFactor], overall_score: float) -> List[str]:
        """Generate recommendations based on risk assessment"""
        recommendations = []
        
        if overall_score >= 8.0:
            recommendations.append("✅ Low risk profile suitable for most use cases")
        elif overall_score >= 6.0:
            recommendations.append("⚠️ Moderate risk - suitable for experienced users")
        elif overall_score >= 4.0:
            recommendations.append("🚨 High risk - exercise caution and do additional research")
        else:
            recommendations.append("❌ Very high risk - not recommended for most users")
        
        # Specific recommendations
        price_factor = next((f for f in risk_factors if f.name == "Price Stability"), None)
        if price_factor and price_factor.score < 6.0:
            recommendations.append("Monitor price stability closely before large transactions")
        
        liquidity_factor = next((f for f in risk_factors if f.name == "Liquidity Risk"), None)
        if liquidity_factor and liquidity_factor.score < 6.0:
            recommendations.append("Check liquidity depth before large redemptions")
        
        audit_factor = next((f for f in risk_factors if f.name == "Audit Risk"), None)
        if audit_factor and audit_factor.score < 5.0:
            recommendations.append("Verify smart contract audits independently")
        
        return recommendations
    
    async def get_risk_comparison(self, coin_ids: List[str]) -> Dict[str, Any]:
        """Compare risk assessments across multiple stablecoins"""
        assessments = []
        
        for coin_id in coin_ids:
            assessment = await self.assess_comprehensive_risk(coin_id)
            if assessment:
                assessments.append(assessment)
        
        if not assessments:
            return {"error": "No valid assessments could be performed"}
        
        # Calculate comparison metrics
        scores = [a.overall_score for a in assessments]
        
        return {
            "total_assessed": len(assessments),
            "average_score": statistics.mean(scores),
            "score_range": (min(scores), max(scores)),
            "assessments": [
                {
                    "coin_id": a.coin_id,
                    "symbol": a.symbol,
                    "overall_score": a.overall_score,
                    "risk_level": a.risk_level.value,
                    "confidence": a.confidence_score
                }
                for a in sorted(assessments, key=lambda x: x.overall_score, reverse=True)
            ]
        } 