async function testProximityMatching() {
  console.log('🔍 Testing Proximity Matching Logic...\n');
  
  const auditUrl = 'https://docs.ethena.fi/resources/audits';
  
  try {
    // Fetch the HTML
    const response = await fetch(auditUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StableRisk/1.0)' }
    });
    const html = await response.text();
    
    console.log('1. Extracting all PDF links...');
    const allPdfLinks = []
    const pdfLinkPattern = /href=["']([^"']*\.pdf[^"']*)/gi
    let pdfMatch
    while ((pdfMatch = pdfLinkPattern.exec(html)) !== null) {
      allPdfLinks.push(pdfMatch[1])
    }
    console.log(`Found ${allPdfLinks.length} PDF links\n`);
    
    // Test proximity matching for each firm
    const firms = ['Zellic', 'Quantstamp', 'Spearbit'];
    
    for (const firm of firms) {
      console.log(`\n2. Testing proximity matching for ${firm}...`);
      
      let firmUrl = undefined
      const matchDetails = []
      
      // For each PDF link, check if it's near this firm name
      for (const pdfLink of allPdfLinks) {
        // Find all occurrences of this PDF link in the HTML
        const linkPattern = new RegExp(`href=["']${pdfLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'gi')
        let linkMatch
        while ((linkMatch = linkPattern.exec(html)) !== null) {
          const linkPosition = linkMatch.index
          
          // Check for firm name within 1000 characters before or after the link
          const searchStart = Math.max(0, linkPosition - 1000)
          const searchEnd = Math.min(html.length, linkPosition + 1000)
          const surrounding = html.slice(searchStart, searchEnd)
          
          // Look for firm name patterns in the surrounding text
          const firmPatterns = [
            { name: 'exact', pattern: new RegExp(`\\b${firm}\\b`, 'i') },
            { name: 'x-pattern', pattern: new RegExp(`\\w+\\s+x\\s+${firm}`, 'i') },
            { name: 'reverse-x', pattern: new RegExp(`${firm}\\s+x\\s+\\w+`, 'i') },
            { name: 'audit-report', pattern: new RegExp(`${firm}[\\s\\S]*?audit[\\s\\S]*?report`, 'i') },
            { name: 'report-audit', pattern: new RegExp(`audit[\\s\\S]*?report[\\s\\S]*?${firm}`, 'i') }
          ]
          
          for (const {name, pattern} of firmPatterns) {
            if (pattern.test(surrounding)) {
              matchDetails.push({
                pattern: name,
                pdfLink: pdfLink.substring(0, 100) + '...',
                position: linkPosition,
                surroundingText: surrounding.substring(0, 200) + '...'
              })
              
              if (!firmUrl) {
                firmUrl = pdfLink
              }
            }
          }
        }
      }
      
      console.log(`  Found URL: ${firmUrl ? 'YES' : 'NO'}`);
      console.log(`  Matches: ${matchDetails.length}`);
      
      if (matchDetails.length > 0) {
        console.log(`  Best match: ${matchDetails[0].pattern} pattern`);
        console.log(`  PDF: ${matchDetails[0].pdfLink}`);
        console.log(`  Context: ${matchDetails[0].surroundingText.replace(/\s+/g, ' ')}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testProximityMatching(); 