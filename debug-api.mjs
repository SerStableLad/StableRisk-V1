// Simple test to debug the API service
// Using built-in fetch (Node.js 18+)

async function testCoinGeckoAPI() {
  console.log('Testing CoinGecko API directly...');
  
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/search?query=USDT');
    const data = await response.json();
    
    console.log('API Response Status:', response.status);
    console.log('API Response OK:', response.ok);
    console.log('Found coins:', data.coins?.length || 0);
    
    if (data.coins && data.coins.length > 0) {
      const coin = data.coins.find(c => c.symbol?.toLowerCase() === 'usdt');
      console.log('USDT coin found:', coin ? coin.id : 'Not found');
      
      if (coin) {
        // Test getting coin info
        console.log('\nTesting coin info API...');
        const infoResponse = await fetch(`https://api.coingecko.com/api/v3/coins/${coin.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);
        const infoData = await infoResponse.json();
        
        console.log('Info API Status:', infoResponse.status);
        console.log('Info API OK:', infoResponse.ok);
        console.log('Coin name:', infoData.name);
        console.log('Current price:', infoData.market_data?.current_price?.usd);
      }
    }
  } catch (error) {
    console.error('Error testing API:', error);
  }
}

testCoinGeckoAPI(); 