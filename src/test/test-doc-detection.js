async function testDocumentationDetection() {
  console.log('🔍 Testing Documentation Page Detection...\n');
  
  const auditUrl = 'https://docs.ethena.fi/resources/audits';
  
  try {
    // Fetch the HTML
    const response = await fetch(auditUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StableRisk/1.0)' }
    });
    const html = await response.text();
    
    console.log(`✅ Fetched ${html.length} characters of HTML\n`);
    
    // Test URL patterns
    console.log('1. Testing URL patterns...');
    const docUrlPatterns = [
      { name: 'docs.[domain].[TLD]', pattern: /docs\.[^\/]+\.[^\/]+/i },
      { name: '/docs/', pattern: /\/docs\//i },
      { name: '/documentation/', pattern: /\/documentation\//i },
      { name: '/security/', pattern: /\/security\//i },
      { name: '.gitbook.io', pattern: /\.gitbook\.io/i },
      { name: 'gitbook.com', pattern: /gitbook\.com/i }
    ];
    
    let isDocUrl = false;
    docUrlPatterns.forEach(({name, pattern}) => {
      const matches = pattern.test(auditUrl);
      console.log(`  ${name}: ${matches ? '✅' : '❌'}`);
      if (matches) isDocUrl = true;
    });
    
    console.log(`\n  Overall URL match: ${isDocUrl ? '✅' : '❌'}\n`);
    
    // Test content patterns
    console.log('2. Testing content patterns...');
    const docContentPatterns = [
      { name: 'audit report', pattern: /audit\s+report/gi },
      { name: 'security audit', pattern: /security\s+audit/gi },
      { name: 'third party audit', pattern: /third.?party\s+audit/gi },
      { name: 'audit firm', pattern: /audit\s+firm/gi },
      { name: 'security assessment', pattern: /security\s+assessment/gi },
      { name: 'penetration test', pattern: /penetration\s+test/gi }
    ];
    
    let auditMentions = 0;
    docContentPatterns.forEach(({name, pattern}) => {
      const matches = html.match(pattern);
      const count = matches ? matches.length : 0;
      auditMentions += count;
      console.log(`  ${name}: ${count} mentions`);
    });
    
    console.log(`\n  Total audit mentions: ${auditMentions}`);
    console.log(`  Meets threshold (>=2): ${auditMentions >= 2 ? '✅' : '❌'}\n`);
    
    // Final result
    const isDocPage = isDocUrl && auditMentions >= 2;
    console.log(`3. Final result:`);
    console.log(`  Is documentation page: ${isDocPage ? '✅' : '❌'}`);
    console.log(`  URL matches doc pattern: ${isDocUrl ? '✅' : '❌'}`);
    console.log(`  Content has enough audit mentions: ${auditMentions >= 2 ? '✅' : '❌'}`);
    
    if (!isDocPage) {
      console.log('\n❌ This explains why audit discovery is failing!');
      if (!isDocUrl) {
        console.log('   - URL pattern detection needs improvement');
      }
      if (auditMentions < 2) {
        console.log('   - Content pattern detection needs improvement');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testDocumentationDetection(); 