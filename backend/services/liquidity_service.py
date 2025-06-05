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
        
        # Token address mappings for major stablecoins (fallback if discovery fails)
        self.default_addresses = {
            "tether": {
                "eth": "0xdac17f958d2ee523a2206206994597c13d831ec7",
                "bsc": "0x55d398326f99059ff775485246999027b3197955",
                "polygon": "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
                "arbitrum": "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
                "avalanche": "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7",
                "optimism": "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
                "fantom": "0x049d68029688eabf473097a2fc38ef61633a3c7a",
                "base": "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2"
            },
            "usd-coin": {
                "eth": "0xa0b86a33e6417c82c0c3e6b325bb30b9e8b3c8e8",
                "bsc": "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
                "polygon": "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
                "arbitrum": "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
                "avalanche": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
                "optimism": "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
                "base": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
            },
            "dai": {
                "eth": "0x6b175474e89094c44da98b954eedeac495271d0f",
                "bsc": "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3",
                "polygon": "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
                "arbitrum": "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
                "avalanche": "0xd586e7f844cea2f87f50152665bcbc2c279d8d70",
                "optimism": "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1"
            }
        }
        
        # Expanded network coverage
        self.supported_networks = [
            "eth", "bsc", "polygon", "arbitrum", "avalanche", "optimism", "fantom", 
            "base", "celo", "cronos", "moonbeam", "moonriver", "kava", "metis", 
            "aurora", "harmony", "fuse", "gnosis", "milkomeda", "evmos"
        ]

    async def get_available_networks(self) -> List[Dict[str, Any]]:
        """Get all available networks from GeckoTerminal"""
        cache_key = "gt_networks"
        
        # Check cache
        if cache_key in self._cache:
            cached_data, timestamp = self._cache[cache_key]
            if datetime.utcnow() - timestamp < timedelta(hours=24):  # Cache networks for 24h
                return cached_data
        
        try:
            url = f"{self.geckoterminal_base}/networks"
            data = await self._make_request(url)
            
            if data and 'data' in data:
                networks = data['data']
                self._cache[cache_key] = (networks, datetime.utcnow())
                logger.info(f"Retrieved {len(networks)} available networks")
                return networks
            
        except Exception as e:
            logger.error(f"Error fetching networks: {e}")
        
        return []

    async def search_token_on_network(self, network_id: str, query: str) -> Optional[str]:
        """Search for a token on a specific network and return the token address"""
        try:
            # Use GeckoTerminal search endpoint for the network
            url = f"{self.geckoterminal_base}/networks/{network_id}/tokens/multi/{query}"
            data = await self._make_request(url)
            
            if data and 'data' in data and len(data['data']) > 0:
                # Return the first matching token address
                token_data = data['data'][0]
                token_address = token_data.get('attributes', {}).get('address')
                if token_address:
                    logger.info(f"Found {query} on {network_id}: {token_address}")
                    return token_address
            
            # Alternative: try searching by symbol in pools
            pools_url = f"{self.geckoterminal_base}/networks/{network_id}/pools?page=1"
            pools_data = await self._make_request(pools_url)
            
            if pools_data and 'data' in pools_data:
                for pool in pools_data['data'][:20]:  # Check first 20 pools
                    pool_name = pool.get('attributes', {}).get('name', '').lower()
                    if query.lower() in pool_name:
                        # Try to extract token address from pool tokens
                        relationships = pool.get('relationships', {})
                        if 'base_token' in relationships:
                            base_token = relationships['base_token']['data']
                            if base_token.get('id'):
                                token_addr = base_token['id'].split('_')[-1]
                                if len(token_addr) == 42 and token_addr.startswith('0x'):
                                    logger.info(f"Found {query} on {network_id} via pool: {token_addr}")
                                    return token_addr
                        
                        if 'quote_token' in relationships:
                            quote_token = relationships['quote_token']['data']
                            if quote_token.get('id'):
                                token_addr = quote_token['id'].split('_')[-1]
                                if len(token_addr) == 42 and token_addr.startswith('0x'):
                                    logger.info(f"Found {query} on {network_id} via pool: {token_addr}")
                                    return token_addr
            
        except Exception as e:
            logger.debug(f"Token search failed for {query} on {network_id}: {e}")
        
        return None

    async def discover_token_addresses(self, coin_id: str) -> Dict[str, str]:
        """Dynamically discover token addresses across all supported networks"""
        cache_key = f"token_discovery_{coin_id}"
        
        # Check cache
        if cache_key in self._cache:
            cached_data, timestamp = self._cache[cache_key]
            if datetime.utcnow() - timestamp < timedelta(hours=6):  # Cache for 6 hours
                logger.info(f"Using cached token addresses for {coin_id}")
                return cached_data
        
        logger.info(f"Discovering token addresses for {coin_id} across networks...")
        discovered_addresses = {}
        
        # Get search terms based on coin_id
        search_terms = []
        if coin_id == "tether":
            search_terms = ["usdt", "tether"]
        elif coin_id == "usd-coin":
            search_terms = ["usdc", "usd-coin"]
        elif coin_id == "dai":
            search_terms = ["dai"]
        else:
            search_terms = [coin_id.replace("-", "")]
        
        # Search across supported networks
        search_tasks = []
        for network in self.supported_networks:
            for term in search_terms:
                search_tasks.append(self._search_token_on_network_with_fallback(network, term, coin_id))
        
        # Execute searches in parallel with limited concurrency
        semaphore = asyncio.Semaphore(2)  # Reduced from 5 to 2 concurrent requests
        
        async def bounded_search(task):
            async with semaphore:
                return await task
        
        results = await asyncio.gather(*[bounded_search(task) for task in search_tasks], return_exceptions=True)
        
        # Process results
        for result in results:
            if isinstance(result, tuple) and len(result) == 2:
                network, address = result
                if address and network not in discovered_addresses:
                    discovered_addresses[network] = address
        
        # Add fallback addresses for any missing networks
        fallback_addresses = self.default_addresses.get(coin_id, {})
        for network, address in fallback_addresses.items():
            if network not in discovered_addresses:
                discovered_addresses[network] = address
                logger.info(f"Using fallback address for {coin_id} on {network}")
        
        # Cache the results
        self._cache[cache_key] = (discovered_addresses, datetime.utcnow())
        
        logger.info(f"Discovered {coin_id} on {len(discovered_addresses)} networks: {list(discovered_addresses.keys())}")
        return discovered_addresses

    async def _search_token_on_network_with_fallback(self, network: str, search_term: str, coin_id: str) -> Optional[Tuple[str, str]]:
        """Search for token on network with fallback logic"""
        try:
            address = await self.search_token_on_network(network, search_term)
            if address:
                return (network, address)
        except Exception as e:
            logger.debug(f"Search failed for {search_term} on {network}: {e}")
        
        return None
    
    async def _make_request(self, url: str, headers: Dict[str, str] = None) -> Optional[Dict[str, Any]]:
        """Make HTTP request with enhanced error handling"""
        try:
            # Add small delay to respect rate limits
            await asyncio.sleep(0.1)
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers or {}) as response:
                    if response.status == 200:
                        return await response.json()
                    elif response.status == 429:
                        logger.warning(f"Rate limit exceeded for {url}")
                        await asyncio.sleep(5)  # Increased delay for rate limiting
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
            
            # Include DEX data to get proper DEX names
            url = f"{self.geckoterminal_base}/networks/{network}/tokens/{token_address}/pools?include=dex"
            data = await self._make_request(url)
            
            if not data or 'data' not in data:
                logger.warning(f"No pool data found for {token_address}")
                return []
            
            pools = data['data']
            
            # Create DEX mapping from included data
            dex_mapping = {}
            if 'included' in data:
                for item in data['included']:
                    if item.get('type') == 'dex':
                        dex_id = item.get('id')
                        dex_name = item.get('attributes', {}).get('name', dex_id.title())
                        dex_mapping[dex_id] = dex_name
            
            # Add DEX information to pools
            for pool in pools:
                dex_rel = pool.get('relationships', {}).get('dex', {}).get('data', {})
                dex_id = dex_rel.get('id', 'unknown')
                pool['dex_name'] = dex_mapping.get(dex_id, dex_id.title() if dex_id != 'unknown' else 'Unknown')
                pool['dex_id'] = dex_id
            
            # Cache the result
            self._cache[cache_key] = (pools, datetime.utcnow())
            
            logger.info(f"Found {len(pools)} pools for {token_address} with DEX mapping")
            return pools
            
        except Exception as e:
            logger.error(f"Error fetching GeckoTerminal pools: {e}")
            return []
    
    def _analyze_dex_diversity(self, pools: List[Dict[str, Any]]) -> DEXAnalysis:
        """Analyze DEX diversity and concentration using proper DEX identification"""
        dex_liquidity = {}
        total_liquidity = 0.0
        pools_over_100k = 0
        
        for pool in pools:
            attributes = pool.get('attributes', {})
            pool_liquidity = float(attributes.get('reserve_in_usd', 0))
            total_liquidity += pool_liquidity
            
            # Use the properly extracted DEX name
            dex_name = pool.get('dex_name', 'Unknown')
            
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
    
    async def get_comprehensive_liquidity_analysis(self, coin_id: str, token_addresses: Dict[str, str] = None, enable_dynamic_discovery: bool = False) -> Optional[EnhancedLiquidityData]:
        """Get comprehensive multi-chain liquidity analysis with per-chain scoring"""
        try:
            logger.info(f"Starting comprehensive liquidity analysis for {coin_id}")
            
            # Use provided addresses, fallback addresses, or discover dynamically
            if token_addresses:
                addresses = token_addresses
                logger.info(f"Using provided token addresses for {coin_id}")
            elif enable_dynamic_discovery:
                addresses = await self.discover_token_addresses(coin_id)
                if not addresses:
                    logger.warning(f"No token addresses found for {coin_id}")
                    return None
            else:
                # Use expanded fallback addresses (now includes 8 chains for USDT)
                addresses = self.default_addresses.get(coin_id, {})
                if not addresses:
                    logger.warning(f"No fallback addresses configured for {coin_id}")
                    return None
                logger.info(f"Using expanded fallback addresses for {coin_id}")
            
            logger.info(f"Analyzing {coin_id} across {len(addresses)} networks: {list(addresses.keys())}")
            
            # Analyze each chain in parallel with limited concurrency
            semaphore = asyncio.Semaphore(2)  # Reduced from 3 to 2 concurrent chain analysis
            
            async def analyze_chain_bounded(network, address):
                async with semaphore:
                    return await self.analyze_chain_liquidity(coin_id, network, address)
            
            analysis_tasks = [
                analyze_chain_bounded(network, address) 
                for network, address in addresses.items()
            ]
            
            chain_results = await asyncio.gather(*analysis_tasks, return_exceptions=True)
            
            # Process results
            chain_scores = []
            total_liquidity = 0.0
            
            for i, result in enumerate(chain_results):
                if isinstance(result, ChainLiquidityScore):
                    chain_scores.append(result)
                    total_liquidity += result.tvl_usd
                elif isinstance(result, Exception):
                    network = list(addresses.keys())[i]
                    logger.warning(f"Analysis failed for {network}: {result}")
            
            if not chain_scores:
                logger.warning(f"No successful chain analysis for {coin_id}")
                return None

            # Sort chains by liquidity (highest first)
            chain_scores.sort(key=lambda x: x.tvl_usd, reverse=True)
            
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
            
            result = EnhancedLiquidityData(
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
            
            logger.info(f"Comprehensive analysis complete for {coin_id}: "
                       f"${total_liquidity:,.0f} across {chain_count} chains, "
                       f"global score {global_risk_score:.1f}/10")
            
            return result
            
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