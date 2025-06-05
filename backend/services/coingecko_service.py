"""
CoinGecko API Service
Handles all interactions with CoinGecko API including ticker-to-coin_id mapping
"""

import aiohttp
import asyncio
import logging
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime, timedelta
import json
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from config.api_keys import api_settings, get_coingecko_headers
from backend.models.stablecoin import StablecoinMetadata, PegAnalysis, DepegEvent, PricePoint

logger = logging.getLogger(__name__)


class CoinGeckoService:
    """Service for interacting with CoinGecko API"""
    
    def __init__(self):
        self.base_url = api_settings.coingecko_base_url
        self.headers = get_coingecko_headers()
        self._coins_cache = None
        self._cache_expiry = None
        self.cache_duration = timedelta(hours=6)  # Cache coins list for 6 hours
        
    async def _make_request(self, endpoint: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Make an authenticated request to CoinGecko API"""
        url = f"{self.base_url}{endpoint}"
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(url, headers=self.headers, params=params) as response:
                    if response.status == 200:
                        return await response.json()
                    elif response.status == 429:
                        logger.warning("CoinGecko rate limit exceeded")
                        raise Exception("Rate limit exceeded. Please try again later.")
                    else:
                        error_text = await response.text()
                        logger.error(f"CoinGecko API error {response.status}: {error_text}")
                        raise Exception(f"API request failed: {response.status}")
            except aiohttp.ClientError as e:
                logger.error(f"Request error: {e}")
                raise Exception(f"Network error: {e}")
    
    async def get_coins_list(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """
        Get the list of all coins with caching
        Returns: List of coins with id, symbol, name
        """
        now = datetime.utcnow()
        
        # Check cache
        if (not force_refresh and 
            self._coins_cache is not None and 
            self._cache_expiry is not None and 
            now < self._cache_expiry):
            logger.info(f"Using cached coins list ({len(self._coins_cache)} coins)")
            return self._coins_cache
        
        # Fetch fresh data
        logger.info("Fetching fresh coins list from CoinGecko...")
        try:
            coins = await self._make_request("/coins/list")
            self._coins_cache = coins
            self._cache_expiry = now + self.cache_duration
            logger.info(f"Successfully cached {len(coins)} coins")
            return coins
        except Exception as e:
            logger.error(f"Failed to fetch coins list: {e}")
            # Return cached data if available, even if expired
            if self._coins_cache:
                logger.warning("Returning expired cached data due to API error")
                return self._coins_cache
            raise
    
    async def find_coin_by_ticker(self, ticker: str) -> List[Dict[str, Any]]:
        """
        Find coins matching a ticker symbol
        Returns: List of matching coins with metadata
        """
        ticker = ticker.upper().strip()
        logger.info(f"Searching for ticker: {ticker}")
        
        try:
            coins = await self.get_coins_list()
            
            # Find exact matches first
            exact_matches = [
                coin for coin in coins 
                if coin.get('symbol', '').upper() == ticker
            ]
            
            # Filter out bridged tokens (as per PRD requirements)
            filtered_matches = []
            for coin in exact_matches:
                name = coin.get('name', '').lower()
                coin_id = coin.get('id', '').lower()
                
                # Skip bridged tokens
                if any(term in name or term in coin_id for term in [
                    'bridged', 'bridge', 'wrapped', 'wormhole', 'portal',
                    'anyswap', 'multichain', 'nomad', 'celer', 'hop',
                    'synapse', 'across', 'stargate'
                ]):
                    continue
                
                # Skip specific chain prefixes that indicate bridged tokens
                if any(chain in name.lower() for chain in [
                    'arbitrum', 'polygon', 'avalanche', 'fantom', 'harmony',
                    'moonbeam', 'moonriver', 'optimism', 'metis', 'cronos',
                    'aurora', 'fuse', 'linea', 'scroll', 'manta', 'opbnb',
                    'beam', 'bob network', 'wax', 'areon'
                ]):
                    continue
                    
                filtered_matches.append(coin)
            
            # If no exact matches after filtering, try partial matches
            if not filtered_matches:
                partial_matches = [
                    coin for coin in coins 
                    if (ticker in coin.get('symbol', '').upper() or 
                        ticker in coin.get('name', '').upper()) and
                    not any(term in coin.get('name', '').lower() for term in [
                        'bridged', 'bridge', 'wrapped'
                    ])
                ]
                logger.info(f"Found {len(partial_matches)} partial matches for {ticker}")
                return partial_matches[:10]  # Limit to 10 results
            
            logger.info(f"Found {len(filtered_matches)} filtered exact matches for {ticker}")
            return filtered_matches
            
        except Exception as e:
            logger.error(f"Error searching for ticker {ticker}: {e}")
            return []
    
    async def get_best_stablecoin_match(self, ticker: str) -> Optional[str]:
        """
        Get the best coin_id match for a stablecoin ticker
        Prioritizes stablecoins and market cap
        Returns: coin_id of best match or None
        """
        matches = await self.find_coin_by_ticker(ticker)
        
        if not matches:
            return None
        
        # If only one match, return it
        if len(matches) == 1:
            return matches[0]['id']
        
        # For multiple matches, prioritize by name patterns and market cap
        try:
            # Get detailed data for each match to compare market caps
            detailed_matches = []
            for match in matches[:5]:  # Limit to top 5 to avoid rate limits
                try:
                    coin_data = await self.get_coin_metadata(match['id'])
                    if coin_data:
                        # Add scoring based on name patterns for stablecoins
                        score = coin_data.market_cap_usd or 0
                        
                        # Bonus points for main stablecoin names
                        name_lower = match['name'].lower()
                        if ticker.lower() in ['usdt'] and 'tether' in name_lower and len(name_lower) < 20:
                            score += 1000000000000  # Large bonus for main Tether
                        elif ticker.lower() in ['usdc'] and 'usd coin' in name_lower and len(name_lower) < 20:
                            score += 1000000000000  # Large bonus for main USDC
                        elif ticker.lower() in ['dai'] and name_lower == 'dai':
                            score += 1000000000000  # Large bonus for main DAI
                        elif ticker.lower() in ['busd'] and 'binance usd' in name_lower and len(name_lower) < 20:
                            score += 1000000000000  # Large bonus for main BUSD
                        
                        detailed_matches.append({
                            'id': match['id'],
                            'name': match['name'],
                            'market_cap': coin_data.market_cap_usd or 0,
                            'score': score
                        })
                except Exception as e:
                    logger.warning(f"Could not get details for {match['id']}: {e}")
                    detailed_matches.append({
                        'id': match['id'],
                        'name': match['name'],
                        'market_cap': 0,
                        'score': 0
                    })
            
            # Sort by score (highest first)
            detailed_matches.sort(key=lambda x: x['score'], reverse=True)
            
            best_match = detailed_matches[0]['id']
            logger.info(f"Best match for {ticker}: {best_match} (score: {detailed_matches[0]['score']:,.0f})")
            return best_match
            
        except Exception as e:
            logger.warning(f"Could not determine best match, returning first result: {e}")
            return matches[0]['id']
    
    async def get_coin_metadata(self, coin_id: str) -> Optional[StablecoinMetadata]:
        """
        Get comprehensive metadata for a coin
        Returns: StablecoinMetadata object or None
        """
        try:
            logger.info(f"Fetching metadata for coin: {coin_id}")
            
            # Get basic coin data
            coin_data = await self._make_request(f"/coins/{coin_id}")
            
            # Parse the response
            metadata = StablecoinMetadata(
                coin_id=coin_id,
                symbol=coin_data.get('symbol', '').upper(),
                name=coin_data.get('name', ''),
                homepage=coin_data.get('links', {}).get('homepage', [None])[0],
                github_url=None,  # Will be set below
                image_url=coin_data.get('image', {}).get('large'),
                genesis_date=self._parse_genesis_date(coin_data.get('genesis_date')),
                market_cap_usd=coin_data.get('market_data', {}).get('market_cap', {}).get('usd'),
                current_price=coin_data.get('market_data', {}).get('current_price', {}).get('usd'),
                price_change_1y=coin_data.get('market_data', {}).get('price_change_percentage_1y')
            )
            
            # Extract GitHub URL if available
            github_repos = coin_data.get('links', {}).get('repos_url', {}).get('github', [])
            if github_repos:
                metadata.github_url = github_repos[0]
            
            logger.info(f"Successfully retrieved metadata for {metadata.name} ({metadata.symbol})")
            return metadata
            
        except Exception as e:
            logger.error(f"Error fetching metadata for {coin_id}: {e}")
            return None
    
    async def get_price_history(self, coin_id: str, days: int = 365) -> Optional[PegAnalysis]:
        """
        Get price history and analyze peg stability
        Returns: PegAnalysis object or None
        """
        try:
            logger.info(f"Fetching {days}-day price history for {coin_id}")
            
            params = {
                'vs_currency': 'usd',
                'days': str(days)
            }
            
            data = await self._make_request(f"/coins/{coin_id}/market_chart", params)
            prices = data.get('prices', [])
            
            if not prices:
                logger.warning(f"No price data available for {coin_id}")
                return None
            
            # Analyze peg stability
            return self._analyze_peg_stability(prices)
            
        except Exception as e:
            logger.error(f"Error fetching price history for {coin_id}: {e}")
            return None
    
    def _analyze_peg_stability(self, prices: List[List]) -> PegAnalysis:
        """
        Analyze price data for peg stability
        prices: List of [timestamp, price] pairs
        """
        if not prices:
            raise ValueError("No price data provided")
        
        # Convert to more convenient format
        price_data = [(datetime.fromtimestamp(p[0]/1000), p[1]) for p in prices]
        current_price = price_data[-1][1]
        
        # Calculate deviations from $1.00 peg
        deviations = [abs(price - 1.0) for _, price in price_data]
        deviation_percentages = [dev * 100 for dev in deviations]
        
        # Create price history for charting
        price_history = []
        for (timestamp, price), deviation_pct in zip(price_data, deviation_percentages):
            price_history.append(PricePoint(
                timestamp=timestamp,
                price=price,
                deviation_percent=deviation_pct
            ))
        
        # Find depeg events (>5% deviation)
        depeg_events = []
        for i, (timestamp, price) in enumerate(price_data):
            deviation_pct = abs(price - 1.0) * 100
            if deviation_pct > 5.0:
                # Find recovery time
                recovery_hours = None
                for j in range(i + 1, len(price_data)):
                    if abs(price_data[j][1] - 1.0) * 100 <= 1.0:  # Recovered to <1% deviation
                        recovery_hours = (price_data[j][0] - timestamp).total_seconds() / 3600
                        break
                
                depeg_events.append(DepegEvent(
                    timestamp=timestamp,
                    price=price,
                    deviation_percent=deviation_pct,
                    duration_hours=recovery_hours,
                    recovered=recovery_hours is not None
                ))
        
        # Calculate time-based max deviations
        now = datetime.utcnow()
        
        # Last 7 days
        week_ago = now - timedelta(days=7)
        recent_7d = [dev for (ts, _), dev in zip(price_data, deviation_percentages) if ts >= week_ago]
        max_dev_7d = max(recent_7d) if recent_7d else 0
        
        # Last 30 days
        month_ago = now - timedelta(days=30)
        recent_30d = [dev for (ts, _), dev in zip(price_data, deviation_percentages) if ts >= month_ago]
        max_dev_30d = max(recent_30d) if recent_30d else 0
        
        # Full period
        max_dev_1y = max(deviation_percentages)
        
        # Average recovery time
        recovery_times = [event.duration_hours for event in depeg_events if event.recovered]
        avg_recovery = sum(recovery_times) / len(recovery_times) if recovery_times else None
        
        return PegAnalysis(
            current_price=current_price,
            current_deviation=abs(current_price - 1.0) * 100,
            max_deviation_7d=max_dev_7d,
            max_deviation_30d=max_dev_30d,
            max_deviation_1y=max_dev_1y,
            depeg_events=depeg_events,
            avg_recovery_time_hours=avg_recovery,
            price_history=price_history
        )
    
    def _parse_genesis_date(self, date_str: Optional[str]) -> Optional[datetime]:
        """Parse genesis date string to datetime"""
        if not date_str:
            return None
        try:
            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        except:
            return None


# Global service instance
coingecko_service = CoinGeckoService() 