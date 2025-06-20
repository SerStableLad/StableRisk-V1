const { AuditDiscoveryService } = require('./src/lib/services/audit-discovery.ts');

async function testUSDEAuditDiscovery() {
  console.log('🔍 Testing USDe Audit Discovery...\n');
  
  const auditService = new AuditDiscoveryService();
  const auditUrl = 'https://docs.ethena.fi/resources/audits';
  
  try {
    console.log('1. Testing audit discovery for USDe...');
    const audits = await auditService.discoverAudits('USDe', 'Ethena', [], [auditUrl]);
    
    console.log('\n📊 Results:');
    console.log(`Found ${audits.length} audits`);
    audits.forEach((audit, i) => {
      console.log(`${i + 1}. ${audit.firm} (${audit.date}) - ${audit.report_url}`);
    });
    
    if (audits.length === 0) {
      console.log('\n❌ No audits found! Let me debug step by step...\n');
      
      // Test JavaScript detection
      console.log('2. Testing JavaScript detection...');
      const response = await fetch(auditUrl);
      const html = await response.text();
      
      // Access private method for testing
      const jsDetected = auditService.detectJavaScriptRenderedSite?.(auditUrl, html);
      console.log(`JavaScript rendering detected: ${jsDetected}`);
      
      // Test if GitBook patterns are found
      const hasGitBookAssets = html.includes('gitbook-x-prod.appspot.com');
      const hasGitBookStatic = html.includes('static.gitbook.com');
      const hasGitBookGeneric = html.includes('gitbook');
      
      console.log(`GitBook assets found: ${hasGitBookAssets}`);
      console.log(`GitBook static found: ${hasGitBookStatic}`);
      console.log(`GitBook generic found: ${hasGitBookGeneric}`);
      
      // Test firm detection
      console.log('\n3. Testing firm detection in HTML...');
      const firms = ['Zellic', 'Quantstamp', 'Spearbit', 'Pashov', 'Cyfrin', 'Chaos Labs'];
      firms.forEach(firm => {
        const found = html.includes(firm);
        console.log(`${firm}: ${found ? '✅' : '❌'}`);
      });
      
      // Test link extraction
      console.log('\n4. Testing link extraction...');
      const pdfLinks = html.match(/href=["']([^"']*\.pdf[^"']*)/gi) || [];
      console.log(`PDF links found: ${pdfLinks.length}`);
      pdfLinks.slice(0, 3).forEach(link => console.log(`  ${link}`));
      
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testUSDEAuditDiscovery(); 