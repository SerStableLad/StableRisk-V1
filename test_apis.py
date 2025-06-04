"""
StableRisk API Connection Test
Tests all external API integrations to verify credentials and connectivity
"""

import asyncio
import aiohttp
import json
import os
from typing import Dict, Any
from datetime import datetime, timedelta


# API Configuration (hardcoded for now, will move to config later)
APIS = {
    "coingecko": {
        "base_url": "https://api.coingecko.com/api/v3",
        "headers": {
            "accept": "application/json",
            "x-cg-demo-api-key": os.getenv("COINGECKO_API_KEY", "demo-key")
        },
        "test_endpoint": "/ping"
    },
    "github": {
        "base_url": "https://api.github.com",
        "headers": {
            "Authorization": f"token {os.getenv('GITHUB_TOKEN', 'placeholder-token')}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "StableRisk-Bot/1.0"
        },
        "test_endpoint": "/user"
    },
    "defillama": {
        "base_url": "https://api.llama.fi",
        "headers": {"User-Agent": "StableRisk-Bot/1.0"},
        "test_endpoint": "/protocols"
    },
    "geckoterminal": {
        "base_url": "https://api.geckoterminal.com/api/v2",
        "headers": {"User-Agent": "StableRisk-Bot/1.0"},
        "test_endpoint": "/networks"
    }
}


async def test_api_connection(session: aiohttp.ClientSession, api_name: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """Test connection to a single API"""
    try:
        url = f"{config['base_url']}{config['test_endpoint']}"
        print(f"Testing {api_name}: {url}")
        
        async with session.get(url, headers=config['headers']) as response:
            status = response.status
            
            if status == 200:
                data = await response.json()
                return {
                    "api": api_name,
                    "status": "SUCCESS",
                    "status_code": status,
                    "response_preview": str(data)[:200] + "..." if len(str(data)) > 200 else str(data)
                }
            else:
                error_text = await response.text()
                return {
                    "api": api_name,
                    "status": "ERROR",
                    "status_code": status,
                    "error": error_text[:200] + "..." if len(error_text) > 200 else error_text
                }
                
    except Exception as e:
        return {
            "api": api_name,
            "status": "EXCEPTION",
            "error": str(e)
        }


async def test_coingecko_specific():
    """Test specific CoinGecko endpoints we'll need"""
    print("\n🦎 Testing CoinGecko Specific Endpoints:")
    
    async with aiohttp.ClientSession() as session:
        # Test coin list endpoint
        try:
            url = "https://api.coingecko.com/api/v3/coins/list"
            headers = {"accept": "application/json", "x-cg-demo-api-key": os.getenv("COINGECKO_API_KEY", "demo-key")}
            
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Coins list: Found {len(data)} coins")
                    # Show first few coins
                    for coin in data[:3]:
                        print(f"   - {coin['name']} ({coin['symbol']}) - ID: {coin['id']}")
                else:
                    print(f"❌ Coins list failed: {response.status}")
        except Exception as e:
            print(f"❌ Coins list exception: {e}")
        
        # Test specific coin data (USDT)
        try:
            url = "https://api.coingecko.com/api/v3/coins/tether"
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ USDT data: {data['name']} - Market Cap: ${data['market_data']['market_cap']['usd']:,.0f}")
                    print(f"   - Homepage: {data['links']['homepage'][0] if data['links']['homepage'] else 'N/A'}")
                    print(f"   - GitHub: {data['links']['repos_url']['github'][0] if data['links']['repos_url']['github'] else 'N/A'}")
                else:
                    print(f"❌ USDT data failed: {response.status}")
        except Exception as e:
            print(f"❌ USDT data exception: {e}")
        
        # Test market chart data
        try:
            # Get 7 days of data
            url = "https://api.coingecko.com/api/v3/coins/tether/market_chart?vs_currency=usd&days=7"
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ USDT price history: {len(data['prices'])} data points over 7 days")
                    # Show recent price for peg analysis
                    latest_price = data['prices'][-1][1]
                    print(f"   - Latest price: ${latest_price:.4f}")
                    print(f"   - Peg deviation: {abs(latest_price - 1.0):.4f} ({abs(latest_price - 1.0)*100:.2f}%)")
                else:
                    print(f"❌ Market chart failed: {response.status}")
        except Exception as e:
            print(f"❌ Market chart exception: {e}")


async def test_github_specific():
    """Test specific GitHub endpoints we'll need"""
    print("\n🐙 Testing GitHub Specific Endpoints:")
    
    async with aiohttp.ClientSession() as session:
        headers = {
            "Authorization": f"token {os.getenv('GITHUB_TOKEN', 'placeholder-token')}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "StableRisk-Bot/1.0"
        }
        
        # Test search for audit-related files
        try:
            query = "audit+filename:audit+language:markdown"
            url = f"https://api.github.com/search/code?q={query}&per_page=5"
            
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Code search: Found {data['total_count']} audit-related files")
                    for item in data['items'][:3]:
                        print(f"   - {item['repository']['full_name']}: {item['name']}")
                else:
                    print(f"❌ Code search failed: {response.status}")
        except Exception as e:
            print(f"❌ Code search exception: {e}")


async def test_defillama_specific():
    """Test specific DeFiLlama endpoints we'll need"""
    print("\n🦙 Testing DeFiLlama Specific Endpoints:")
    
    async with aiohttp.ClientSession() as session:
        headers = {"User-Agent": "StableRisk-Bot/1.0"}
        
        # Test protocols list
        try:
            url = "https://api.llama.fi/protocols"
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Protocols: Found {len(data)} protocols")
                    # Look for stablecoin protocols
                    stablecoin_protocols = [p for p in data[:50] if any(term in p.get('name', '').lower() for term in ['stable', 'dai', 'usdc', 'usdt'])]
                    print(f"   - Stablecoin-related protocols found: {len(stablecoin_protocols)}")
                    for protocol in stablecoin_protocols[:3]:
                        print(f"     • {protocol['name']}: ${protocol.get('tvl', 0):,.0f} TVL")
                else:
                    print(f"❌ Protocols failed: {response.status}")
        except Exception as e:
            print(f"❌ Protocols exception: {e}")


async def test_geckoterminal_specific():
    """Test specific GeckoTerminal endpoints we'll need"""
    print("\n🦎 Testing GeckoTerminal Specific Endpoints:")
    
    async with aiohttp.ClientSession() as session:
        headers = {"User-Agent": "StableRisk-Bot/1.0"}
        
        # Test networks list
        try:
            url = "https://api.geckoterminal.com/api/v2/networks"
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    networks = data.get('data', [])
                    print(f"✅ Networks: Found {len(networks)} networks")
                    for network in networks[:5]:
                        attrs = network.get('attributes', {})
                        print(f"   - {attrs.get('name', 'Unknown')}: {network.get('id', 'N/A')}")
                else:
                    print(f"❌ Networks failed: {response.status}")
        except Exception as e:
            print(f"❌ Networks exception: {e}")


async def main():
    """Main test function"""
    print("🚀 StableRisk API Connection Test")
    print("=" * 50)
    
    # Test basic connectivity
    print("\n📡 Testing Basic API Connectivity:")
    async with aiohttp.ClientSession() as session:
        tasks = [test_api_connection(session, name, config) for name, config in APIS.items()]
        results = await asyncio.gather(*tasks)
        
        success_count = 0
        for result in results:
            if result["status"] == "SUCCESS":
                print(f"✅ {result['api']}: Connected successfully")
                success_count += 1
            else:
                print(f"❌ {result['api']}: {result['status']} - {result.get('error', 'Unknown error')}")
        
        print(f"\n📊 Summary: {success_count}/{len(APIS)} APIs connected successfully")
    
    # Test specific endpoints
    if success_count > 0:
        print("\n🔍 Testing Specific Endpoints:")
        await test_coingecko_specific()
        await test_github_specific()
        await test_defillama_specific()
        await test_geckoterminal_specific()
    
    print("\n✨ API testing complete!")


if __name__ == "__main__":
    asyncio.run(main()) 