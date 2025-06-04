"""
Coins API Router
Endpoints for coin search and metadata retrieval
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
import logging
import sys
import os

# Add parent directories to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
from backend.models.stablecoin import (
    CoinSearchResponse, 
    StablecoinMetadata,
    PegAnalysis
)
from backend.services.coingecko_service import coingecko_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/coins", tags=["coins"])


@router.get("/search/{ticker}", response_model=CoinSearchResponse)
async def search_coin_by_ticker(
    ticker: str,
    limit: int = Query(10, ge=1, le=50, description="Maximum number of results")
):
    """
    Search for coins by ticker symbol
    Returns list of matching coins with metadata
    """
    try:
        logger.info(f"Searching for ticker: {ticker}")
        
        # Find matching coins
        matches = await coingecko_service.find_coin_by_ticker(ticker)
        
        if not matches:
            logger.info(f"No matches found for ticker: {ticker}")
            return CoinSearchResponse(
                ticker=ticker.upper(),
                matches=[],
                suggested_coin_id=None
            )
        
        # Limit results
        limited_matches = matches[:limit]
        
        # Convert to StablecoinMetadata objects (basic info only)
        metadata_list = []
        for match in limited_matches:
            try:
                # Create basic metadata from search results
                metadata = StablecoinMetadata(
                    coin_id=match['id'],
                    symbol=match.get('symbol', '').upper(),
                    name=match.get('name', ''),
                    homepage=None,  # Will be filled by detailed fetch
                    github_url=None,
                    image_url=None,
                    genesis_date=None,
                    market_cap_usd=None,
                    current_price=None,
                    price_change_1y=None
                )
                metadata_list.append(metadata)
            except Exception as e:
                logger.warning(f"Could not create metadata for {match}: {e}")
        
        # Get best match suggestion
        suggested_coin_id = await coingecko_service.get_best_stablecoin_match(ticker)
        
        logger.info(f"Found {len(metadata_list)} matches for {ticker}, suggested: {suggested_coin_id}")
        
        return CoinSearchResponse(
            ticker=ticker.upper(),
            matches=metadata_list,
            suggested_coin_id=suggested_coin_id
        )
        
    except Exception as e:
        logger.error(f"Error searching for ticker {ticker}: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"Search failed: {str(e)}"
        )


@router.get("/metadata/{coin_id}", response_model=StablecoinMetadata)
async def get_coin_metadata(coin_id: str):
    """
    Get comprehensive metadata for a specific coin
    """
    try:
        logger.info(f"Fetching metadata for coin: {coin_id}")
        
        metadata = await coingecko_service.get_coin_metadata(coin_id)
        
        if not metadata:
            raise HTTPException(
                status_code=404,
                detail=f"Coin not found: {coin_id}"
            )
        
        logger.info(f"Successfully retrieved metadata for {metadata.name}")
        return metadata
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching metadata for {coin_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch metadata: {str(e)}"
        )


@router.get("/price-analysis/{coin_id}", response_model=PegAnalysis)
async def get_price_analysis(
    coin_id: str,
    days: int = Query(365, ge=1, le=365, description="Number of days of price history")
):
    """
    Get price history and peg stability analysis for a coin
    """
    try:
        logger.info(f"Fetching price analysis for coin: {coin_id}")
        
        peg_analysis = await coingecko_service.get_price_history(coin_id, days)
        
        if not peg_analysis:
            raise HTTPException(
                status_code=404,
                detail=f"Price data not available for: {coin_id}"
            )
        
        logger.info(f"Successfully analyzed {days} days of price data for {coin_id}")
        return peg_analysis
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing prices for {coin_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Price analysis failed: {str(e)}"
        )


@router.get("/stablecoin-search/{ticker}")
async def search_stablecoin_comprehensive(ticker: str):
    """
    Comprehensive stablecoin search with metadata and basic price analysis
    This is the main endpoint for the frontend
    """
    try:
        logger.info(f"Comprehensive stablecoin search for: {ticker}")
        
        # Step 1: Find best match
        coin_id = await coingecko_service.get_best_stablecoin_match(ticker)
        
        if not coin_id:
            raise HTTPException(
                status_code=404,
                detail=f"No stablecoin found for ticker: {ticker}"
            )
        
        # Step 2: Get comprehensive metadata
        metadata = await coingecko_service.get_coin_metadata(coin_id)
        
        if not metadata:
            raise HTTPException(
                status_code=404,
                detail=f"Could not fetch metadata for: {coin_id}"
            )
        
        # Step 3: Get basic price analysis (30 days for quick response)
        try:
            peg_analysis = await coingecko_service.get_price_history(coin_id, 30)
        except Exception as e:
            logger.warning(f"Could not fetch price analysis: {e}")
            peg_analysis = None
        
        result = {
            "ticker": ticker.upper(),
            "coin_id": coin_id,
            "metadata": metadata,
            "peg_analysis": peg_analysis,
            "status": "success"
        }
        
        logger.info(f"Comprehensive search completed for {ticker} -> {metadata.name}")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Comprehensive search failed for {ticker}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {str(e)}"
        ) 