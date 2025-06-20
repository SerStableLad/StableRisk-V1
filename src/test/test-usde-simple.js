async function testUSDEContent() {
  console.log('🔍 Testing USDe GitBook Content...\n');
  
  const auditUrl = 'https://docs.ethena.fi/resources/audits';
  
  try {
    console.log('1. Fetching GitBook page...');
    const response = await fetch(auditUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StableRisk/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log(`✅ Fetched ${html.length} characters of HTML\n`);
    
    // Test GitBook detection patterns
    console.log('2. Testing GitBook patterns...');
    const gitbookPatterns = {
      'gitbook-x-prod.appspot.com': html.includes('gitbook-x-prod.appspot.com'),
      'static.gitbook.com': html.includes('static.gitbook.com'),
      'gitbook': html.includes('gitbook'),
      'self.__next_f.push': html.includes('self.__next_f.push'),
      'window.__NEXT_DATA__': html.includes('window.__NEXT_DATA__')
    };
    
    Object.entries(gitbookPatterns).forEach(([pattern, found]) => {
      console.log(`${pattern}: ${found ? '✅' : '❌'}`);
    });
    
    // Test audit firm detection
    console.log('\n3. Testing audit firm detection...');
    const firms = ['Zellic', 'Quantstamp', 'Spearbit', 'Pashov', 'Cyfrin', 'Chaos Labs'];
    const firmResults = {};
    
    firms.forEach(firm => {
      const found = html.includes(firm);
      firmResults[firm] = found;
      console.log(`${firm}: ${found ? '✅' : '❌'}`);
    });
    
    // Test PDF link patterns
    console.log('\n4. Testing PDF link patterns...');
    const pdfPatterns = [
      /href=["']([^"']*\.pdf[^"']*)/gi,
      /(\d+KB[^<]*\.pdf)/gi,
      /(Ethena x [^<]*\.pdf)/gi
    ];
    
    pdfPatterns.forEach((pattern, i) => {
      const matches = html.match(pattern) || [];
      console.log(`Pattern ${i + 1}: ${matches.length} matches`);
      matches.slice(0, 2).forEach(match => console.log(`  ${match}`));
    });
    
    // Test audit-related content
    console.log('\n5. Testing audit-related content...');
    const auditKeywords = ['audit', 'security', 'report', 'assessment'];
    auditKeywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'gi');
      const matches = html.match(regex) || [];
      console.log(`"${keyword}": ${matches.length} occurrences`);
    });
    
    // Test URL patterns that should match
    console.log('\n6. Testing URL pattern matching...');
    const testUrls = [
      'https://docs.ethena.fi/resources/audits',
      '/resources/audits',
      '/audit-report.pdf',
      'ethena-x-zellic-audit-report.pdf'
    ];
    
    const auditUrlKeywords = ['audit', 'security', 'report', 'pdf'];
    testUrls.forEach(url => {
      const hasKeyword = auditUrlKeywords.some(keyword => 
        url.toLowerCase().includes(keyword.toLowerCase())
      );
      console.log(`${url}: ${hasKeyword ? '✅' : '❌'}`);
    });
    
    console.log('\n✅ Test completed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testUSDEContent(); 