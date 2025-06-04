"""
Enhanced Oracle Infrastructure Detection Service
Advanced analysis of oracle mechanisms beyond basic GitHub scanning
"""

import asyncio
import logging
import re
from typing import Dict, List, Optional, Any, Set, Tuple
from datetime import datetime
from dataclasses import dataclass
from enum import Enum
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.services.coingecko_service import CoinGeckoService
from backend.services.web_scraper_service import web_scraper

logger = logging.getLogger(__name__)


class OracleType(Enum):
    """Types of oracle mechanisms"""
    CHAINLINK = "Chainlink"
    BAND_PROTOCOL = "Band Protocol"
    UMA = "UMA"
    TELLOR = "Tellor"
    CUSTOM = "Custom Oracle"
    MULTIPLE = "Multiple Oracles"
    NONE = "No Oracle Detected"
    UNKNOWN = "Unknown"


class OracleRiskLevel(Enum):
    """Oracle risk assessment levels"""
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    CRITICAL = "Critical"


@dataclass
class OracleEndpoint:
    """Oracle data endpoint information"""
    oracle_type: OracleType
    endpoint_url: Optional[str]
    description: str
    confidence: float
    data_feeds: List[str]  # Types of data provided
    update_frequency: Optional[str]
    reliability_score: Optional[float]


@dataclass
class OracleAnalysis:
    """Complete oracle infrastructure analysis"""
    coin_id: str
    coin_name: str
    symbol: str
    
    # Detected oracles
    oracle_endpoints: List[OracleEndpoint]
    primary_oracle: Optional[OracleEndpoint]
    oracle_types_used: List[OracleType]
    
    # Risk assessment
    oracle_risk_level: OracleRiskLevel
    centralization_score: float  # 0-1 (1 = most centralized)
    reliability_score: float     # 0-1 (1 = most reliable)
    
    # Analysis details
    price_feed_sources: List[str]
    fallback_mechanisms: List[str]
    oracle_dependencies: List[str]
    security_features: List[str]
    
    # Metadata
    analysis_date: datetime
    confidence_score: float
    warnings: List[str]
    data_sources: List[str]


class EnhancedOracleService:
    """Enhanced oracle infrastructure detection and analysis service"""
    
    def __init__(self):
        self.coingecko_service = CoinGeckoService()
        
        # Oracle detection patterns for different types
        self.oracle_patterns = {
            OracleType.CHAINLINK: [
                r'chainlink', r'link token', r'decentralized oracle',
                r'chainlink network', r'node operator', r'price feed',
                r'chainlink data feed', r'link marines', r'sergey nazarov'
            ],
            OracleType.BAND_PROTOCOL: [
                r'band protocol', r'bandchain', r'band oracle',
                r'cosmos oracle', r'band token', r'decentralized oracle'
            ],
            OracleType.UMA: [
                r'uma protocol', r'optimistic oracle', r'uma oracle',
                r'universal market access', r'dispute resolution'
            ],
            OracleType.TELLOR: [
                r'tellor', r'tributes', r'tellor oracle',
                r'miner network', r'proof of work oracle'
            ],
            OracleType.CUSTOM: [
                r'custom oracle', r'proprietary oracle', r'internal oracle',
                r'native oracle', r'built-in oracle'
            ]
        }
        
        # Contract address patterns for oracle services
        self.oracle_contract_patterns = {
            OracleType.CHAINLINK: [
                r'0x[a-fA-F0-9]{40}.*chainlink',
                r'chainlink.*0x[a-fA-F0-9]{40}',
                r'price.*feed.*0x[a-fA-F0-9]{40}'
            ],
            OracleType.UMA: [
                r'0x[a-fA-F0-9]{40}.*uma',
                r'uma.*0x[a-fA-F0-9]{40}'
            ]
        }
        
        # Price feed indicators
        self.price_feed_patterns = [
            r'price feed', r'data feed', r'oracle feed',
            r'price oracle', r'external price', r'price source',
            r'market price', r'reference price', r'spot price'
        ]
        
        # Risk indicators
        self.centralization_indicators = [
            r'single oracle', r'centralized oracle', r'admin control',
            r'owner control', r'single point of failure'
        ]
        
        self.reliability_indicators = [
            r'redundant oracle', r'multiple oracle', r'fallback oracle',
            r'backup feed', r'oracle network', r'decentralized oracle',
            r'consensus mechanism', r'aggregation'
        ]
    
    async def analyze_oracle_infrastructure(self, coin_id: str) -> Optional[OracleAnalysis]:
        """
        Comprehensive analysis of oracle infrastructure for a stablecoin/DeFi project
        """
        try:
            logger.info(f"Analyzing oracle infrastructure for {coin_id}")
            
            # Get basic metadata
            metadata = await self.coingecko_service.get_coin_metadata(coin_id)
            if not metadata:
                return None
            
            # Scrape project website for oracle information
            web_scraping_result = await web_scraper.scrape_project_resources(coin_id)
            
            # Analyze different data sources
            oracle_endpoints = []
            data_sources = []
            
            # 1. Analyze project description and website
            if metadata.description:
                description_oracles = self._analyze_text_for_oracles(metadata.description)
                oracle_endpoints.extend(description_oracles)
                data_sources.append("project_description")
            
            # 2. Analyze scraped website content
            if web_scraping_result:
                website_oracles = await self._analyze_website_for_oracles(web_scraping_result)
                oracle_endpoints.extend(website_oracles)
                data_sources.append("website_scraping")
            
            # 3. Analyze GitHub repositories for oracle implementation
            if web_scraping_result and web_scraping_result.github_repositories:
                github_oracles = await self._analyze_github_for_oracles(web_scraping_result.github_repositories)
                oracle_endpoints.extend(github_oracles)
                data_sources.append("github_analysis")
            
            # 4. Perform pattern-based oracle detection
            pattern_oracles = self._detect_oracle_patterns(coin_id, metadata)
            oracle_endpoints.extend(pattern_oracles)
            data_sources.append("pattern_analysis")
            
            # Remove duplicates and sort by confidence
            unique_oracles = self._deduplicate_oracles(oracle_endpoints)
            
            # Identify primary oracle
            primary_oracle = unique_oracles[0] if unique_oracles else None
            
            # Determine oracle types used
            oracle_types_used = list(set(oracle.oracle_type for oracle in unique_oracles))
            
            # Assess oracle risks
            oracle_risk_level, centralization_score, reliability_score = self._assess_oracle_risks(unique_oracles, metadata)
            
            # Extract additional information
            price_feed_sources = self._extract_price_feed_sources(unique_oracles, metadata)
            fallback_mechanisms = self._identify_fallback_mechanisms(unique_oracles, metadata)
            oracle_dependencies = self._analyze_oracle_dependencies(unique_oracles)
            security_features = self._identify_security_features(unique_oracles, metadata)
            
            # Calculate overall confidence
            confidence_score = self._calculate_overall_confidence(unique_oracles, data_sources)
            
            # Generate warnings
            warnings = self._generate_oracle_warnings(unique_oracles, oracle_risk_level, centralization_score)
            
            return OracleAnalysis(
                coin_id=coin_id,
                coin_name=metadata.name,
                symbol=metadata.symbol,
                oracle_endpoints=unique_oracles,
                primary_oracle=primary_oracle,
                oracle_types_used=oracle_types_used,
                oracle_risk_level=oracle_risk_level,
                centralization_score=centralization_score,
                reliability_score=reliability_score,
                price_feed_sources=price_feed_sources,
                fallback_mechanisms=fallback_mechanisms,
                oracle_dependencies=oracle_dependencies,
                security_features=security_features,
                analysis_date=datetime.utcnow(),
                confidence_score=confidence_score,
                warnings=warnings,
                data_sources=data_sources
            )
            
        except Exception as e:
            logger.error(f"Oracle analysis failed for {coin_id}: {e}")
            return None
    
    def _analyze_text_for_oracles(self, text: str) -> List[OracleEndpoint]:
        """Analyze text content for oracle mentions"""
        oracles = []
        text_lower = text.lower()
        
        for oracle_type, patterns in self.oracle_patterns.items():
            confidence = 0.0
            found_patterns = []
            
            for pattern in patterns:
                if re.search(pattern, text_lower):
                    found_patterns.append(pattern)
                    confidence += 0.15
            
            if found_patterns:
                confidence = min(0.8, confidence)  # Cap confidence
                
                oracles.append(OracleEndpoint(
                    oracle_type=oracle_type,
                    endpoint_url=None,
                    description=f"Detected via patterns: {', '.join(found_patterns[:3])}",
                    confidence=confidence,
                    data_feeds=["price_data"],
                    update_frequency=None,
                    reliability_score=None
                ))
        
        return oracles
    
    async def _analyze_website_for_oracles(self, scraping_result) -> List[OracleEndpoint]:
        """Analyze scraped website content for oracle information"""
        oracles = []
        
        # Analyze all scraped content
        all_content = ""
        for page_url, content in scraping_result.__dict__.items():
            if isinstance(content, str):
                all_content += content + " "
        
        # Look for oracle-specific content
        content_oracles = self._analyze_text_for_oracles(all_content)
        
        # Look for contract addresses and technical documentation
        contract_oracles = self._extract_oracle_contracts(all_content)
        
        oracles.extend(content_oracles)
        oracles.extend(contract_oracles)
        
        return oracles
    
    async def _analyze_github_for_oracles(self, github_repos) -> List[OracleEndpoint]:
        """Analyze GitHub repositories for oracle implementation details"""
        oracles = []
        
        # For now, we'll do pattern-based analysis
        # In a full implementation, this would fetch and analyze actual code
        
        for repo in github_repos:
            repo_name_lower = repo.repo_name.lower()
            
            # Check repository name for oracle indicators
            for oracle_type, patterns in self.oracle_patterns.items():
                for pattern in patterns:
                    if pattern in repo_name_lower or pattern in repo.context.lower():
                        oracles.append(OracleEndpoint(
                            oracle_type=oracle_type,
                            endpoint_url=repo.url,
                            description=f"Detected in GitHub repo: {repo.repo_name}",
                            confidence=0.6,
                            data_feeds=["smart_contract_data"],
                            update_frequency=None,
                            reliability_score=None
                        ))
                        break
        
        return oracles
    
    def _extract_oracle_contracts(self, content: str) -> List[OracleEndpoint]:
        """Extract oracle contract addresses from content"""
        oracles = []
        
        for oracle_type, patterns in self.oracle_contract_patterns.items():
            for pattern in patterns:
                matches = re.finditer(pattern, content, re.IGNORECASE)
                
                for match in matches:
                    # Extract contract address
                    contract_match = re.search(r'0x[a-fA-F0-9]{40}', match.group())
                    if contract_match:
                        contract_address = contract_match.group()
                        
                        oracles.append(OracleEndpoint(
                            oracle_type=oracle_type,
                            endpoint_url=f"https://etherscan.io/address/{contract_address}",
                            description=f"Contract address: {contract_address}",
                            confidence=0.7,
                            data_feeds=["on_chain_data"],
                            update_frequency=None,
                            reliability_score=None
                        ))
        
        return oracles
    
    def _detect_oracle_patterns(self, coin_id: str, metadata) -> List[OracleEndpoint]:
        """Detect oracle patterns based on project characteristics"""
        oracles = []
        
        # Check for common DeFi oracle patterns
        project_name = metadata.name.lower() if metadata.name else ""
        
        # Major DeFi projects often use Chainlink
        major_defi_indicators = [
            'lending', 'borrowing', 'compound', 'aave', 'makerdao',
            'synthetic', 'derivatives', 'perpetual', 'futures'
        ]
        
        if any(indicator in project_name for indicator in major_defi_indicators):
            oracles.append(OracleEndpoint(
                oracle_type=OracleType.CHAINLINK,
                endpoint_url=None,
                description="Major DeFi project likely uses Chainlink",
                confidence=0.4,
                data_feeds=["price_feeds"],
                update_frequency="Variable",
                reliability_score=0.8
            ))
        
        # Cosmos ecosystem projects often use Band Protocol
        cosmos_indicators = ['cosmos', 'band', 'kava', 'secret', 'terra']
        if any(indicator in project_name for indicator in cosmos_indicators):
            oracles.append(OracleEndpoint(
                oracle_type=OracleType.BAND_PROTOCOL,
                endpoint_url=None,
                description="Cosmos ecosystem project likely uses Band Protocol",
                confidence=0.5,
                data_feeds=["cross_chain_data"],
                update_frequency="Block-based",
                reliability_score=0.7
            ))
        
        return oracles
    
    def _deduplicate_oracles(self, oracles: List[OracleEndpoint]) -> List[OracleEndpoint]:
        """Remove duplicate oracle endpoints and merge similar ones"""
        unique_oracles = {}
        
        for oracle in oracles:
            key = oracle.oracle_type
            
            if key not in unique_oracles or oracle.confidence > unique_oracles[key].confidence:
                unique_oracles[key] = oracle
        
        return sorted(unique_oracles.values(), key=lambda x: x.confidence, reverse=True)
    
    def _assess_oracle_risks(self, oracles: List[OracleEndpoint], metadata) -> Tuple[OracleRiskLevel, float, float]:
        """Assess oracle-related risks"""
        
        if not oracles:
            return OracleRiskLevel.CRITICAL, 1.0, 0.0
        
        # Calculate centralization score
        centralization_score = 0.5  # Base score
        
        if len(oracles) == 1:
            centralization_score += 0.3  # Single oracle increases centralization
        elif len(oracles) > 3:
            centralization_score -= 0.2  # Multiple oracles reduce centralization
        
        # Check for reliable oracle types
        reliable_oracles = [OracleType.CHAINLINK, OracleType.BAND_PROTOCOL]
        has_reliable_oracle = any(oracle.oracle_type in reliable_oracles for oracle in oracles)
        
        if has_reliable_oracle:
            centralization_score -= 0.2
        
        centralization_score = max(0.0, min(1.0, centralization_score))
        
        # Calculate reliability score
        reliability_score = 0.3  # Base score
        
        for oracle in oracles:
            if oracle.oracle_type in reliable_oracles:
                reliability_score += 0.3
            if oracle.confidence > 0.7:
                reliability_score += 0.2
        
        reliability_score = max(0.0, min(1.0, reliability_score))
        
        # Determine risk level
        if centralization_score > 0.8 or reliability_score < 0.3:
            risk_level = OracleRiskLevel.CRITICAL
        elif centralization_score > 0.6 or reliability_score < 0.5:
            risk_level = OracleRiskLevel.HIGH
        elif centralization_score > 0.4 or reliability_score < 0.7:
            risk_level = OracleRiskLevel.MEDIUM
        else:
            risk_level = OracleRiskLevel.LOW
        
        return risk_level, centralization_score, reliability_score
    
    def _extract_price_feed_sources(self, oracles: List[OracleEndpoint], metadata) -> List[str]:
        """Extract price feed sources from oracle analysis"""
        sources = []
        
        for oracle in oracles:
            if oracle.oracle_type == OracleType.CHAINLINK:
                sources.extend(["Coinbase Pro", "Binance", "Kraken", "Gemini"])
            elif oracle.oracle_type == OracleType.BAND_PROTOCOL:
                sources.extend(["CoinGecko", "CoinMarketCap", "Alpha Vantage"])
            elif oracle.oracle_type == OracleType.UMA:
                sources.append("Optimistic Oracle with dispute resolution")
        
        return list(set(sources))
    
    def _identify_fallback_mechanisms(self, oracles: List[OracleEndpoint], metadata) -> List[str]:
        """Identify fallback mechanisms for oracle failures"""
        mechanisms = []
        
        if len(oracles) > 1:
            mechanisms.append("Multiple oracle redundancy")
        
        for oracle in oracles:
            if oracle.oracle_type == OracleType.CHAINLINK:
                mechanisms.append("Chainlink decentralized network")
            elif oracle.oracle_type == OracleType.UMA:
                mechanisms.append("Dispute resolution mechanism")
        
        return mechanisms
    
    def _analyze_oracle_dependencies(self, oracles: List[OracleEndpoint]) -> List[str]:
        """Analyze dependencies on external oracle services"""
        dependencies = []
        
        oracle_deps = {
            OracleType.CHAINLINK: ["LINK token", "Chainlink node operators", "Ethereum network"],
            OracleType.BAND_PROTOCOL: ["BAND token", "Cosmos validators", "BandChain"],
            OracleType.UMA: ["UMA token", "Ethereum network", "DVM voters"],
            OracleType.TELLOR: ["TRB token", "Miners", "Ethereum network"]
        }
        
        for oracle in oracles:
            if oracle.oracle_type in oracle_deps:
                dependencies.extend(oracle_deps[oracle.oracle_type])
        
        return list(set(dependencies))
    
    def _identify_security_features(self, oracles: List[OracleEndpoint], metadata) -> List[str]:
        """Identify oracle security features"""
        features = []
        
        for oracle in oracles:
            if oracle.oracle_type == OracleType.CHAINLINK:
                features.extend([
                    "Decentralized oracle network",
                    "Multiple data sources",
                    "Cryptographic proofs",
                    "Reputation system"
                ])
            elif oracle.oracle_type == OracleType.UMA:
                features.extend([
                    "Optimistic verification",
                    "Economic dispute resolution",
                    "Skin in the game mechanism"
                ])
            elif oracle.oracle_type == OracleType.BAND_PROTOCOL:
                features.extend([
                    "Validator consensus",
                    "Cross-chain oracle",
                    "Slashing conditions"
                ])
        
        return list(set(features))
    
    def _calculate_overall_confidence(self, oracles: List[OracleEndpoint], data_sources: List[str]) -> float:
        """Calculate overall confidence in oracle analysis"""
        if not oracles:
            return 0.1
        
        # Base confidence from oracle detection
        avg_oracle_confidence = sum(oracle.confidence for oracle in oracles) / len(oracles)
        
        # Boost confidence based on data sources
        source_boost = len(data_sources) * 0.1
        
        # Boost confidence for reliable oracle types
        reliable_boost = 0.2 if any(
            oracle.oracle_type in [OracleType.CHAINLINK, OracleType.BAND_PROTOCOL] 
            for oracle in oracles
        ) else 0
        
        overall_confidence = avg_oracle_confidence + source_boost + reliable_boost
        
        return max(0.1, min(0.95, overall_confidence))
    
    def _generate_oracle_warnings(self, oracles: List[OracleEndpoint], 
                                 risk_level: OracleRiskLevel, 
                                 centralization_score: float) -> List[str]:
        """Generate warnings based on oracle analysis"""
        warnings = []
        
        if not oracles:
            warnings.append("No oracle infrastructure detected - critical risk for price-dependent protocols")
        
        if len(oracles) == 1:
            warnings.append("Single oracle dependency - potential single point of failure")
        
        if centralization_score > 0.7:
            warnings.append("High oracle centralization risk detected")
        
        if risk_level in [OracleRiskLevel.HIGH, OracleRiskLevel.CRITICAL]:
            warnings.append(f"Oracle risk level assessed as {risk_level.value}")
        
        # Check for unknown oracle types
        unknown_oracles = [o for o in oracles if o.oracle_type in [OracleType.CUSTOM, OracleType.UNKNOWN]]
        if unknown_oracles:
            warnings.append("Custom or unknown oracle implementation - requires additional verification")
        
        return warnings
    
    async def get_oracle_summary(self, coin_ids: List[str]) -> Dict[str, Any]:
        """Get oracle analysis summary for multiple projects"""
        try:
            results = []
            
            for coin_id in coin_ids:
                analysis = await self.analyze_oracle_infrastructure(coin_id)
                if analysis:
                    results.append({
                        'coin_id': analysis.coin_id,
                        'symbol': analysis.symbol,
                        'oracle_types': [ot.value for ot in analysis.oracle_types_used],
                        'primary_oracle': analysis.primary_oracle.oracle_type.value if analysis.primary_oracle else None,
                        'risk_level': analysis.oracle_risk_level.value,
                        'centralization_score': analysis.centralization_score,
                        'reliability_score': analysis.reliability_score,
                        'confidence': analysis.confidence_score,
                        'warnings_count': len(analysis.warnings)
                    })
            
            # Calculate statistics
            if results:
                avg_centralization = sum(r['centralization_score'] for r in results) / len(results)
                avg_reliability = sum(r['reliability_score'] for r in results) / len(results)
                avg_confidence = sum(r['confidence'] for r in results) / len(results)
            else:
                avg_centralization = avg_reliability = avg_confidence = 0
            
            return {
                'total_projects_analyzed': len(results),
                'results': results,
                'summary_statistics': {
                    'average_centralization_score': round(avg_centralization, 2),
                    'average_reliability_score': round(avg_reliability, 2),
                    'average_confidence': round(avg_confidence, 2),
                    'projects_with_oracles': len([r for r in results if r['primary_oracle']]),
                    'high_risk_projects': len([r for r in results if r['risk_level'] in ['High', 'Critical']])
                }
            }
            
        except Exception as e:
            logger.error(f"Oracle summary failed: {e}")
            return {'error': str(e)}


# Global enhanced oracle service instance
enhanced_oracle_service = EnhancedOracleService() 