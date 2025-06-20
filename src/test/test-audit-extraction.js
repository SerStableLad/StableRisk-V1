async function testAuditExtraction() {
  console.log('🔍 Testing Audit Firm Extraction...\n');
  
  const auditUrl = 'https://docs.ethena.fi/resources/audits';
  
  try {
    // Fetch the HTML
    const response = await fetch(auditUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StableRisk/1.0)' }
    });
    const html = await response.text();
    
    console.log(`✅ Fetched ${html.length} characters of HTML\n`);
    
    // Test firm detection
    console.log('1. Testing firm detection...');
    const knownFirms = [
      'Guardian', 'ChainSecurity', 'Paladin', 'Chaos Labs',
      'Trail of Bits', 'ConsenSys', 'OpenZeppelin', 'Quantstamp',
      'Certik', 'PeckShield', 'SlowMist', 'BlockSec', 'Hacken',
      'Cyfrin', 'Spearbit', 'Zellic', 'Pashov', 'Sigma Prime'
    ];
    
    const foundFirms = [];
    const foundFirmsSet = new Set();
    
    for (const firm of knownFirms) {
      // Regular firm name pattern
      const firmPattern = new RegExp(`\\b${firm}\\b`, 'gi');
      // GitBook-specific patterns like "Ethena x Zellic" or "Project x Firm"
      const gitbookPattern = new RegExp(`\\w+\\s+x\\s+${firm}`, 'gi');
      
      const regularMatches = html.match(firmPattern) || [];
      const gitbookMatches = html.match(gitbookPattern) || [];
      
      if ((regularMatches.length > 0 || gitbookMatches.length > 0) && !foundFirmsSet.has(firm.toLowerCase())) {
        foundFirmsSet.add(firm.toLowerCase());
        foundFirms.push({
          firm,
          regularMatches: regularMatches.length,
          gitbookMatches: gitbookMatches.length
        });
        console.log(`  ✅ ${firm}: ${regularMatches.length} regular + ${gitbookMatches.length} GitBook matches`);
      } else {
        console.log(`  ❌ ${firm}: not found`);
      }
    }
    
    console.log(`\n  Found ${foundFirms.length} firms total\n`);
    
    // Test PDF link extraction
    console.log('2. Testing PDF link extraction...');
    const allPdfLinks = [];
    const pdfLinkPattern = /href=["']([^"']*\.pdf[^"']*)/gi;
    let pdfMatch;
    while ((pdfMatch = pdfLinkPattern.exec(html)) !== null) {
      allPdfLinks.push(pdfMatch[1]);
    }
    console.log(`  Found ${allPdfLinks.length} PDF links`);
    allPdfLinks.slice(0, 3).forEach((link, i) => {
      console.log(`  ${i + 1}. ${link.substring(0, 100)}...`);
    });
    
    // Test proximity matching for found firms
    console.log('\n3. Testing proximity matching...');
    const auditFirms = [];
    
    for (const {firm} of foundFirms) {
      console.log(`\n  Testing ${firm}...`);
      let firmUrl = undefined;
      let matchCount = 0;
      
      // For each PDF link, check if it's near this firm name in the HTML
      for (const pdfLink of allPdfLinks) {
        // Find all occurrences of this PDF link in the HTML
        const linkPattern = new RegExp(`href=["']${pdfLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'gi');
        let linkMatch;
        while ((linkMatch = linkPattern.exec(html)) !== null) {
          const linkPosition = linkMatch.index;
          
          // Check for firm name within 1000 characters before or after the link
          const searchStart = Math.max(0, linkPosition - 1000);
          const searchEnd = Math.min(html.length, linkPosition + 1000);
          const surrounding = html.slice(searchStart, searchEnd);
          
          // Look for firm name patterns in the surrounding text
          const firmPatterns = [
            { name: 'exact', pattern: new RegExp(`\\b${firm}\\b`, 'i') },
            { name: 'x-pattern', pattern: new RegExp(`\\w+\\s+x\\s+${firm}`, 'i') },
            { name: 'reverse-x', pattern: new RegExp(`${firm}\\s+x\\s+\\w+`, 'i') },
            { name: 'audit-report', pattern: new RegExp(`${firm}[\\s\\S]*?audit[\\s\\S]*?report`, 'i') },
            { name: 'report-audit', pattern: new RegExp(`audit[\\s\\S]*?report[\\s\\S]*?${firm}`, 'i') }
          ];
          
          for (const {name, pattern} of firmPatterns) {
            if (pattern.test(surrounding)) {
              matchCount++;
              if (!firmUrl) {
                firmUrl = pdfLink;
                console.log(`    ✅ Found match with ${name} pattern`);
                console.log(`    📄 PDF: ${pdfLink.substring(0, 80)}...`);
              }
              break;
            }
          }
        }
        if (firmUrl) break;
      }
      
      if (firmUrl) {
        auditFirms.push({ firm, url: firmUrl });
        console.log(`    ✅ Total matches: ${matchCount}`);
      } else {
        console.log(`    ❌ No proximity matches found`);
      }
    }
    
    console.log(`\n4. Final results:`);
    console.log(`  Firms detected: ${foundFirms.length}`);
    console.log(`  PDF links found: ${allPdfLinks.length}`);
    console.log(`  Firms with URLs: ${auditFirms.length}`);
    
    auditFirms.forEach((firmInfo, i) => {
      console.log(`  ${i + 1}. ${firmInfo.firm} → ${firmInfo.url ? 'HAS URL' : 'NO URL'}`);
    });
    
    if (auditFirms.length === 0) {
      console.log('\n❌ No audit firms extracted! This explains the empty audits array.');
    } else {
      console.log('\n✅ Audit extraction should be working!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAuditExtraction(); 