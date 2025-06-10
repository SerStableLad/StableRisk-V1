# StableRisk Utility Services

This directory contains several shared utility services that help optimize the StableRisk Tier 3 data processing pipeline.

## New Optimization Services

Two new utility services have been added to reduce code duplication and improve performance across Tier 3 services:

### 1. WebDiscoveryService (`web-discovery.ts`)

This service centralizes web scraping and crawling functionality used across multiple Tier 3 services, particularly in the `AuditDiscoveryService` and `TransparencyService`.

**Key Features:**
- Automated discovery of special pages (transparency dashboards, audit reports)
- HTML parsing and link extraction
- Keyword finding on pages
- Built-in caching to prevent redundant requests
- Performance logging

**Requirements:**
- Requires the `cheerio` package: `npm install cheerio`
- For TypeScript: `npm install --save-dev @types/cheerio`

**Usage Example:**
```typescript
// Find all transparency or audit-related links
const links = await webDiscoveryService.discoverSpecialPages(
  ['https://tether.to'], 
  [/audit/i, /transparency/i, /attestation/i]
);

// Parse content on a specific page
const html = await webDiscoveryService.fetchHtml('https://tether.to/transparency');
if (html) {
  const keywordResults = await webDiscoveryService.findKeywordsOnPage(
    html, 
    ['audit', 'verified', 'report']
  );
  console.log(keywordResults.matches);
}
```

### 2. EnhancedApiClient (`enhanced-api-client.ts`)

This service extends the base `ApiClient` with caching, specialized endpoint handling, and other optimizations for external API calls.

**Key Features:**
- Transparent caching for all GET requests
- Optional caching for POST requests
- Specialized clients for common services (GitHub, Etherscan, etc.)
- Consistent error handling

**Usage Example:**
```typescript
// GitHub API (for audit discovery)
const githubClient = EnhancedApiClient.createGitHubClient(process.env.GITHUB_API_KEY);
const repos = await githubClient.cachedGet('/search/repositories', { 
  q: 'org:tether',
  sort: 'stars',
  order: 'desc'
});

// Etherscan API (for blockchain analysis)
const etherscanClient = EnhancedApiClient.createEtherscanClient(process.env.ETHERSCAN_API_KEY);
const contractInfo = await etherscanClient.cachedGet('', { 
  module: 'contract',
  action: 'getabi',
  address: '0xdac17f958d2ee523a2206206994597c13d831ec7' // USDT
});
```

## Implementation Guide

To implement these services in the existing Tier 3 pipeline:

1. **Install Dependencies:**
   ```bash
   npm install cheerio
   npm install --save-dev @types/cheerio
   ```

2. **Refactor AuditDiscoveryService:**
   - Replace direct GitHub API calls with `EnhancedApiClient.createGitHubClient()`
   - Replace web scraping code with `webDiscoveryService` methods
   - Ensure all boolean parameters are converted to strings in API calls

3. **Refactor TransparencyService:**
   - Replace manual website crawling with `webDiscoveryService.discoverSpecialPages()`
   - Replace HTML parsing code with `webDiscoveryService.findKeywordsOnPage()`

4. **Refactor OracleAnalysisService:**
   - Use specialized blockchain clients for contract analysis

## Benefits

These utility services provide several key improvements:

1. **Reduced Code Duplication:** 
   - Eliminates redundant web scraping and API client code across services
   - Centralizes common patterns

2. **Improved Performance:**
   - Consistent caching across all services
   - Prevents redundant network requests
   - Uses optimized fetching strategies

3. **Better Maintainability:**
   - Isolates complex web crawling and API logic
   - Makes services more focused on business logic
   - Provides consistent error handling

4. **Enhanced Reliability:**
   - Built-in retry mechanisms
   - Proper error handling
   - Graceful fallbacks

## Example Refactoring

See `tier3-integration-example.ts` for detailed examples of how to refactor existing Tier 3 services to use these utility services.

## Future Improvements

Potential future improvements to these utility services:

1. Add rate limiting to prevent API throttling
2. Implement smart retry strategies for transient failures
3. Add streaming response handling for large responses
4. Integrate with metrics system for better performance monitoring 