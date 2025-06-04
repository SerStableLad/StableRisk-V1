#!/usr/bin/env python3
"""
Phase 2.1 Functionality Test Script
Tests ticker-to-coin_id mapping and data retrieval
"""

import asyncio
import aiohttp
import json
from datetime import datetime

BASE_URL = "http://localhost:8000"

async def test_endpoint(session, endpoint, description):
    """Test a single endpoint"""
    try:
        async with session.get(f"{BASE_URL}{endpoint}") as response:
            if response.status == 200:
                data = await response.json()
                print(f"✅ {description}")
                return data
            else:
                print(f"❌ {description} - Status: {response.status}")
                return None
    except Exception as e:
        print(f"❌ {description} - Error: {e}")
        return None

async def main():
    """Run all tests"""
    print("🚀 Testing StableRisk Phase 2.1 Functionality")
    print("=" * 50)
    
    async with aiohttp.ClientSession() as session:
        # Test 1: Health check
        await test_endpoint(session, "/health", "Health Check")
        
        # Test 2: Ticker search for major stablecoins
        stablecoins = ["USDO", "USDA", "USDS", "USDD"]
        
        for ticker in stablecoins:
            print(f"\n📊 Testing {ticker}:")
            
            # Search endpoint
            search_data = await test_endpoint(
                session, 
                f"/api/v1/coins/search/{ticker}?limit=3",
                f"  Search {ticker}"
            )
            
            # Comprehensive search
            comp_data = await test_endpoint(
                session,
                f"/api/v1/coins/stablecoin-search/{ticker}",
                f"  Comprehensive {ticker} search"
            )
            
            if comp_data:
                metadata = comp_data.get('metadata', {})
                peg_analysis = comp_data.get('peg_analysis', {})
                
                print(f"    → Coin ID: {comp_data.get('coin_id')}")
                print(f"    → Name: {metadata.get('name')}")
                print(f"    → Market Cap: ${metadata.get('market_cap_usd', 0):,.0f}")
                print(f"    → Current Price: ${metadata.get('current_price', 0):.4f}")
                print(f"    → Deviation: {peg_analysis.get('current_deviation', 0):.3f}%")
        
        # Test 3: Direct metadata and price analysis
        print(f"\n🔍 Testing Direct API Calls:")
        
        # Test Tether metadata
        await test_endpoint(
            session,
            "/api/v1/coins/metadata/tether",
            "  Tether metadata"
        )
        
        # Test Tether price analysis
        await test_endpoint(
            session,
            "/api/v1/coins/price-analysis/tether?days=30",
            "  Tether price analysis (30 days)"
        )
        
        print(f"\n✅ Phase 2.1 Testing Complete!")
        print(f"📅 Timestamp: {datetime.utcnow().isoformat()}")

if __name__ == "__main__":
    asyncio.run(main()) 