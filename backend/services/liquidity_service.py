"""
Comprehensive Multi-Chain Liquidity Analysis Service
Implements the advanced per-chain risk scoring framework from PRD
"""

import aiohttp
import asyncio
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import sys
import os
import re
from statistics import variance

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from config.api_keys import api_settings
from backend.models.stablecoin import (
    LiquidityData, ChainLiquidity, EnhancedLiquidityData, ChainLiquidityScore,
    PoolComposition, DEXAnalysis, LiquidityRiskFactors
)

logger = logging.getLogger(__name__)


class EnhancedLiquidityService:
    """Advanced liquidity analysis service implementing PRD per-chain scoring framework"""
    
    def __init__(self):
        self.geckoterminal_base = "https://api.geckoterminal.com/api/v2"
        self.defillama_base = "https://api.llama.fi"
        self._cache = {}
        self.cache_duration = timedelta(hours=1)
        
        # Known stablecoins for pool composition analysis
        self.known_stablecoins = {
            'usdt', 'usdc', 'dai', 'busd', 'frax', 'lusd', 'usdd', 'usdp', 'tusd',
            'fei', 'mim', 'ust', 'vai', 'gusd', 'husd', 'usdx', 'sai', 'cusd',
            'dusd', 'ousd', 'musd', 'susd', 'yusd', 'alusd', 'usd+', 'dola'
        }
        
        # Token address mappings for major stablecoins
        self.default_addresses = {
            "tether": {
                "eth": "0xdac17f958d2ee523a2206206994597c13d831ec7",
                "bsc": "0x55d398326f99059ff775485246999027b3197955",
                "polygon": "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
                "arbitrum": "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9"
            },
            "usd-coin": {
                "eth": "0xa0b86a33e6417c82c0c3e6b325bb30b9e8b3c8e8",
                "bsc": "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
                "polygon": "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
                "arbitrum": "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8"
            },
            "dai": {
                "eth": "0x6b175474e89094c44da98b954eedeac495271d0f",
                "bsc": "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3",
                "polygon": "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"
            }
        }
    
    async def _make_request(self, url: str, headers: Dict[str, str] = None) -> Optional[Dict[str, Any]]:
        """Make HTTP request with enhanced error handling"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers or {}) as response:
                    if response.status == 200:
                        return await response.json()
                    elif response.status == 429:
                        logger.warning(f"Rate limit exceeded for {url}")
                        await asyncio.sleep(2)
                        return None
                    else:
                        logger.error(f"API error {response.status} for {url}")
                        return None
        except Exception as e:
            logger.error(f"Request error for {url}: {e}")
            return None
    
    def _classify_token(self, token_symbol: str) -> str:
        """Classify token as stable or volatile"""
        if not token_symbol:
            return "unknown"
        
        token_lower = token_symbol.lower().strip()
        
        # Remove common prefixes/suffixes
        clean_token = re.sub(r'^(w|a|c|r)', '', token_lower)
        clean_token = re.sub(r'(\.e|_e|\-e)$', '', clean_token)
        
        if clean_token in self.known_stablecoins:
            return "stable"
        elif token_lower in ['eth', 'weth', 'btc', 'wbtc', 'bnb', 'matic', 'avax', 'sol']:
            return "volatile"
        else:
            return "unknown"
    
    def _analyze_pool_composition(self, pools: List[Dict[str, Any]]) -> PoolComposition:
        """Analyze pool composition for stable vs volatile pairings"""
        total_liquidity = 0.0
        stable_stable_liquidity = 0.0
        volatile_stable_liquidity = 0.0
        unknown_liquidity = 0.0
        
        stable_tokens = set()
        volatile_tokens = set()
        
        for pool in pools:
            attributes = pool.get('attributes', {})
            pool_liquidity = float(attributes.get('reserve_in_usd', 0))
            total_liquidity += pool_liquidity
            
            # Get token symbols from pool name or attributes
            pool_name = attributes.get('name', '').lower()
            
            # Extract token symbols - basic pattern matching
            tokens = []
            if '/' in pool_name:
                tokens = [t.strip() for t in pool_name.split('/')]
            elif '-' in pool_name:
                tokens = [t.strip() for t in pool_name.split('-')]
            
            if len(tokens) >= 2:
                token1_type = self._classify_token(tokens[0])
                token2_type = self._classify_token(tokens[1])
                
                if token1_type == "stable":
                    stable_tokens.add(tokens[0])
                elif token1_type == "volatile":
                    volatile_tokens.add(tokens[0])
                    
                if token2_type == "stable":
                    stable_tokens.add(tokens[1])
                elif token2_type == "volatile":
                    volatile_tokens.add(tokens[1])
                
                # Classify pool type
                if token1_type == "stable" and token2_type == "stable":
                    stable_stable_liquidity += pool_liquidity
                elif (token1_type == "stable" and token2_type == "volatile") or \
                     (token1_type == "volatile" and token2_type == "stable"):
                    volatile_stable_liquidity += pool_liquidity
                else:
                    unknown_liquidity += pool_liquidity
            else:
                unknown_liquidity += pool_liquidity
        
        if total_liquidity == 0:
            return PoolComposition(
                stable_stable_percent=0.0,
                volatile_stable_percent=0.0,
                unknown_percent=100.0,
                stable_tokens=[],
                volatile_tokens=[]
            )
        
        return PoolComposition(
            stable_stable_percent=(stable_stable_liquidity / total_liquidity) * 100,
            volatile_stable_percent=(volatile_stable_liquidity / total_liquidity) * 100,
            unknown_percent=(unknown_liquidity / total_liquidity) * 100,
            stable_tokens=list(stable_tokens),
            volatile_tokens=list(volatile_tokens)
        )
    
    def _analyze_dex_diversity(self, pools: List[Dict[str, Any]]) -> DEXAnalysis:
        """Analyze DEX diversity and concentration"""
        dex_liquidity = {}
        total_liquidity = 0.0
        pools_over_100k = 0
        
        for pool in pools:
            attributes = pool.get('attributes', {})
            pool_liquidity = float(attributes.get('reserve_in_usd', 0))
            total_liquidity += pool_liquidity
            
            # Extract DEX name from pool name or address
            pool_name = attributes.get('name', '')
            dex_name = "Unknown"
            
            # Common DEX pattern matching
            if 'uniswap' in pool_name.lower():
                dex_name = "Uniswap"
            elif 'sushiswap' in pool_name.lower() or 'sushi' in pool_name.lower():
                dex_name = "SushiSwap"
            elif 'curve' in pool_name.lower():
                dex_name = "Curve"
            elif 'balancer' in pool_name.lower():
                dex_name = "Balancer"
            elif 'pancakeswap' in pool_name.lower() or 'pancake' in pool_name.lower():
                dex_name = "PancakeSwap"
            elif 'quickswap' in pool_name.lower():
                dex_name = "QuickSwap"
            else:
                # Use first part of pool name as DEX identifier
                parts = pool_name.split(':')
                if len(parts) > 1:
                    dex_name = parts[0].title()
            
            if dex_name not in dex_liquidity:
                dex_liquidity[dex_name] = 0.0
            dex_liquidity[dex_name] += pool_liquidity
            
            if pool_liquidity >= 100_000:
                pools_over_100k += 1
        
        # Count DEXs with >$100k liquidity
        dexs_over_100k = len([dex for dex, liquidity in dex_liquidity.items() if liquidity >= 100_000])
        
        # Find largest DEX percentage
        largest_dex_liquidity = max(dex_liquidity.values()) if dex_liquidity else 0
        largest_dex_percent = (largest_dex_liquidity / total_liquidity * 100) if total_liquidity > 0 else 0
        
        # Prepare top DEXs list
        top_dexs = [
            {"name": dex, "liquidity_usd": liquidity, "percent": (liquidity / total_liquidity * 100) if total_liquidity > 0 else 0}
            for dex, liquidity in sorted(dex_liquidity.items(), key=lambda x: x[1], reverse=True)[:5]
        ]
        
        return DEXAnalysis(
            total_dex_count=len(dex_liquidity),
            dexs_over_100k=dexs_over_100k,
            largest_dex_percent=largest_dex_percent,
            top_dexs=top_dexs,
            dex_names=list(dex_liquidity.keys())
        )
    
    def _assess_risk_factors(self, tvl_usd: float, dex_analysis: DEXAnalysis, pool_composition: PoolComposition) -> LiquidityRiskFactors:
        """Assess various liquidity risk factors"""
        
        # LP Centralization: High if largest DEX has >90% of liquidity
        high_lp_centralization = dex_analysis.largest_dex_percent >= 90
        
        # Concentration risk: High if few DEXs control most liquidity
        concentration_risk = dex_analysis.largest_dex_percent >= 80 or dex_analysis.dexs_over_100k <= 1
        
        # Flash loan vulnerability: High if low liquidity + high concentration
        flash_loan_vulnerability = tvl_usd < 1_000_000 and concentration_risk
        
        # No monitoring controls: Assume true for chains with very low liquidity
        no_monitoring_controls = tvl_usd < 100_000
        
        # Basic drain event detection: Very low liquidity might indicate past drain
        recent_drain_events = []
        if tvl_usd < 50_000:
            recent_drain_events.append({
                "type": "potential_drain",
                "description": "Very low liquidity detected",
                "liquidity_usd": tvl_usd
            })
        
        return LiquidityRiskFactors(
            high_lp_centralization=high_lp_centralization,
            recent_drain_events=recent_drain_events,
            flash_loan_vulnerability=flash_loan_vulnerability,
            no_monitoring_controls=no_monitoring_controls,
            concentration_risk=concentration_risk
        )
    
    def _calculate_base_score(self, tvl_usd: float) -> float:
        """Calculate base score (0-10) based on TVL tiers per PRD"""
        if tvl_usd >= 100_000_000:  # ≥ $100M
            return 9.5  # Excellent liquidity
        elif tvl_usd >= 30_000_000:  # $30M-$99.9M
            return 7.5  # Strong support
        elif tvl_usd >= 10_000_000:  # $10M-$29.9M
            return 5.5  # Moderate risk
        elif tvl_usd >= 1_000_000:   # $1M-$9.9M
            return 3.5  # High risk
        elif tvl_usd > 0:           # <$1M or 1 DEX only
            return 1.5  # Very high risk
        else:                       # No DEX presence
            return 0.0  # Critical - Unusable
    
    def _calculate_adjustments(self, dex_analysis: DEXAnalysis, pool_composition: PoolComposition, risk_factors: LiquidityRiskFactors) -> Dict[str, float]:
        """Calculate bonus/penalty adjustments per PRD"""
        adjustments = {}
        
        # Bonus: ≥ 3 DEXs with >$100k liquidity (+1)
        if dex_analysis.dexs_over_100k >= 3:
            adjustments["dex_diversity_bonus"] = 1.0
        
        # Penalty: ≥ 90% of liquidity in 1-2 DEXs (-2)
        if dex_analysis.largest_dex_percent >= 90:
            adjustments["liquidity_centralization"] = -2.0
        
        # Penalty: >50% of liquidity paired with volatile tokens (-1)
        if pool_composition.volatile_stable_percent > 50:
            adjustments["volatile_pairing_risk"] = -1.0
        
        # Penalty: Liquidity managed mostly by 1-2 wallets (-2)
        if risk_factors.high_lp_centralization:
            adjustments["lp_centralization"] = -2.0
        
        # Penalty: Recent history of drain events (-3)
        if risk_factors.recent_drain_events:
            adjustments["drain_event_history"] = -3.0
        
        # Penalty: Flash loan exploit pattern detected (-2)
        if risk_factors.flash_loan_vulnerability:
            adjustments["flash_loan_risk"] = -2.0
        
        # Penalty: No active liquidity monitoring (-1)
        if risk_factors.no_monitoring_controls:
            adjustments["no_monitoring"] = -1.0
        
        return adjustments
    
    def _determine_risk_level_and_color(self, final_score: float) -> Tuple[str, str]:
        """Determine risk level and color based on final score"""
        if final_score >= 7:
            return "excellent", "green"
        elif final_score >= 5:
            return "strong", "green"
        elif final_score >= 4:
            return "moderate", "orange"
        elif final_score >= 2:
            return "high", "orange"
        else:
            return "critical", "red"
    
    async def get_geckoterminal_pools(self, token_address: str, network: str = "eth") -> List[Dict[str, Any]]:
        """Get liquidity pools from GeckoTerminal for a specific token"""
        cache_key = f"gt_pools_{network}_{token_address}"
        
        # Check cache
        if cache_key in self._cache:
            cached_data, timestamp = self._cache[cache_key]
            if datetime.utcnow() - timestamp < self.cache_duration:
                logger.info(f"Using cached GeckoTerminal pools for {token_address}")
                return cached_data
        
        try:
            logger.info(f"Fetching GeckoTerminal pools for {token_address} on {network}")
            
            url = f"{self.geckoterminal_base}/networks/{network}/tokens/{token_address}/pools"
            data = await self._make_request(url)
            
            if not data or 'data' not in data:
                logger.warning(f"No pool data found for {token_address}")
                return []
            
            pools = data['data']
            
            # Cache the result
            self._cache[cache_key] = (pools, datetime.utcnow())
            
            logger.info(f"Found {len(pools)} pools for {token_address}")
            return pools
            
        except Exception as e:
            logger.error(f"Error fetching GeckoTerminal pools: {e}")
            return []
    
    async def analyze_chain_liquidity(self, coin_id: str, network: str, token_address: str) -> Optional[ChainLiquidityScore]:
        """Perform comprehensive per-chain liquidity analysis"""
        try:
            logger.info(f"Analyzing {network} liquidity for {coin_id}")
            
            # Get pools data
            pools = await self.get_geckoterminal_pools(token_address, network)
            
            if not pools:
                logger.warning(f"No pools found for {coin_id} on {network}")
                return None
            
            # Calculate total liquidity
            tvl_usd = sum(float(pool.get('attributes', {}).get('reserve_in_usd', 0)) for pool in pools)
            
            if tvl_usd == 0:
                logger.warning(f"Zero liquidity found for {coin_id} on {network}")
                return None
            
            # Perform detailed analysis
            pool_composition = self._analyze_pool_composition(pools)
            dex_analysis = self._analyze_dex_diversity(pools)
            risk_factors = self._assess_risk_factors(tvl_usd, dex_analysis, pool_composition)
            
            # Calculate scoring
            base_score = self._calculate_base_score(tvl_usd)
            adjustments = self._calculate_adjustments(dex_analysis, pool_composition, risk_factors)
            
            # Calculate final score with bounds checking
            adjustment_total = sum(adjustments.values())
            final_score = max(0.0, min(10.0, base_score + adjustment_total))
            
            # Determine risk level and color
            risk_level, risk_color = self._determine_risk_level_and_color(final_score)
            
            # Critical warning for very low liquidity
            critical_warning = tvl_usd < 100_000
            
            # Data confidence based on pool count and liquidity
            data_confidence = min(1.0, (len(pools) / 10) * (tvl_usd / 1_000_000))
            
            return ChainLiquidityScore(
                chain_id=network,
                chain_name=network.title(),
                tvl_usd=tvl_usd,
                base_score=base_score,
                adjustments=adjustments,
                final_score=final_score,
                risk_level=risk_level,
                risk_color=risk_color,
                critical_warning=critical_warning,
                dex_analysis=dex_analysis,
                pool_composition=pool_composition,
                risk_factors=risk_factors,
                data_confidence=data_confidence,
                last_updated=datetime.utcnow()
            )
            
        except Exception as e:
            logger.error(f"Error analyzing {network} liquidity for {coin_id}: {e}")
            return None
    
    async def get_comprehensive_liquidity_analysis(self, coin_id: str, token_addresses: Dict[str, str] = None) -> Optional[EnhancedLiquidityData]:
        """Get comprehensive multi-chain liquidity analysis with per-chain scoring"""
        try:
            logger.info(f"Starting comprehensive liquidity analysis for {coin_id}")
            
            # Use provided addresses or defaults
            addresses = token_addresses or self.default_addresses.get(coin_id, {})
            
            if not addresses:
                logger.warning(f"No token addresses configured for {coin_id}")
                return None
            
            # Analyze each chain
            chain_scores = []
            total_liquidity = 0.0
            
            for network, address in addresses.items():
                chain_score = await self.analyze_chain_liquidity(coin_id, network, address)
                if chain_score:
                    chain_scores.append(chain_score)
                    total_liquidity += chain_score.tvl_usd
            
            if not chain_scores:
                logger.warning(f"No chain analysis data available for {coin_id}")
                return None
            
            # Calculate global metrics
            # Weighted average score by TVL
            if total_liquidity > 0:
                global_risk_score = sum(
                    score.final_score * (score.tvl_usd / total_liquidity) 
                    for score in chain_scores
                )
            else:
                global_risk_score = 0.0
            
            # Determine global risk level
            global_risk_level, _ = self._determine_risk_level_and_color(global_risk_score)
            
            # Calculate summary metrics
            chain_count = len(chain_scores)
            chains_with_critical_risk = sum(1 for score in chain_scores if score.critical_warning)
            avg_score_per_chain = sum(score.final_score for score in chain_scores) / chain_count
            score_variance = variance([score.final_score for score in chain_scores]) if chain_count > 1 else 0.0
            
            # Risk flags
            has_critical_warnings = any(score.critical_warning for score in chain_scores)
            concentration_risk = any(score.risk_factors.concentration_risk for score in chain_scores)
            diversification_good = chain_count >= 3 and avg_score_per_chain >= 5.0
            
            return EnhancedLiquidityData(
                total_liquidity_usd=total_liquidity,
                global_risk_score=global_risk_score,
                global_risk_level=global_risk_level,
                chain_scores=chain_scores,
                chain_count=chain_count,
                chains_with_critical_risk=chains_with_critical_risk,
                avg_score_per_chain=avg_score_per_chain,
                score_variance=score_variance,
                has_critical_warnings=has_critical_warnings,
                concentration_risk=concentration_risk,
                diversification_good=diversification_good,
                analysis_timestamp=datetime.utcnow(),
                data_sources=["GeckoTerminal", "DeFiLlama"],
                cache_status="computed"
            )
            
        except Exception as e:
            logger.error(f"Error in comprehensive liquidity analysis for {coin_id}: {e}")
            return None


# Global service instance
enhanced_liquidity_service = EnhancedLiquidityService()

# Backward compatibility - keep the old simple service for existing endpoints
class LiquidityService:
    """Legacy liquidity service for backward compatibility"""
    
    def __init__(self):
        self.enhanced_service = enhanced_liquidity_service
    
    async def get_stablecoin_liquidity_analysis(self, coin_id: str, token_addresses: Dict[str, str] = None) -> Optional[LiquidityData]:
        """Legacy method - converts enhanced analysis to simple format"""
        enhanced_data = await self.enhanced_service.get_comprehensive_liquidity_analysis(coin_id, token_addresses)
        
        if not enhanced_data:
            return None
        
        # Convert to legacy format
        chain_breakdown = []
        for chain_score in enhanced_data.chain_scores:
            chain_breakdown.append(ChainLiquidity(
                chain_name=chain_score.chain_name,
                chain_id=chain_score.chain_id,
                total_liquidity_usd=chain_score.tvl_usd,
                pool_count=len(chain_score.dex_analysis.top_dexs),
                top_pools=chain_score.dex_analysis.top_dexs[:3]
            ))
        
        # Calculate legacy concentration metric
        if enhanced_data.total_liquidity_usd > 0:
            max_chain_liquidity = max(cs.tvl_usd for cs in enhanced_data.chain_scores)
            concentration_percent = (max_chain_liquidity / enhanced_data.total_liquidity_usd) * 100
        else:
            concentration_percent = 0.0
        
        return LiquidityData(
            total_liquidity_usd=enhanced_data.total_liquidity_usd,
            chain_breakdown=chain_breakdown,
            chain_count=enhanced_data.chain_count,
            avg_liquidity_per_chain=enhanced_data.total_liquidity_usd / enhanced_data.chain_count,
            liquidity_concentration_percent=concentration_percent,
            last_updated=enhanced_data.analysis_timestamp
        )
    
    async def get_liquidity_risk_score(self, liquidity_data: LiquidityData) -> float:
        """Legacy risk scoring - converts 0-10 score to 0-100 scale"""
        # This is a simplified conversion for backward compatibility
        if not liquidity_data:
            return 100.0
        
        # Use basic scoring logic for legacy compatibility
        score = 0.0
        
        # Factor 1: Total liquidity (40% weight)
        if liquidity_data.total_liquidity_usd >= 1_000_000_000:
            score += 0
        elif liquidity_data.total_liquidity_usd >= 100_000_000:
            score += 10
        elif liquidity_data.total_liquidity_usd >= 10_000_000:
            score += 30
        else:
            score += 60
        
        # Factor 2: Chain diversification (30% weight)
        if liquidity_data.chain_count >= 5:
            score += 0
        elif liquidity_data.chain_count >= 3:
            score += 10
        elif liquidity_data.chain_count >= 2:
            score += 20
        else:
            score += 40
        
        # Factor 3: Liquidity concentration (30% weight)
        if liquidity_data.liquidity_concentration_percent <= 40:
            score += 0
        elif liquidity_data.liquidity_concentration_percent <= 60:
            score += 10
        elif liquidity_data.liquidity_concentration_percent <= 80:
            score += 20
        else:
            score += 30
        
        return min(100.0, score)


# Global service instances
liquidity_service = LiquidityService()  # For backward compatibility 