import { EnhancedApiClient } from './enhanced-api-client';
import { webDiscoveryService } from './web-discovery';
import { AuditDiscoveryService } from './audit-discovery';
import { TransparencyService } from './transparency';
import { OracleAnalysisService } from './oracle-analysis';

/**
 * This is a demonstration file showing how the existing Tier 3 services can be refactored
 * to use the new utility services (webDiscoveryService and EnhancedApiClient).
 * 
 * The goal is to:
 * 1. Reduce duplicate code across services
 * 2. Improve performance through better caching
 * 3. Make the code more maintainable
 * 
 * This file is not meant to be used directly, but to serve as a guide for refactoring.
 */

/**
 * Example of how to refactor the AuditDiscoveryService to use the new utility services
 */
export class ImprovedAuditDiscoveryService {
  private githubClient: EnhancedApiClient;
  
  constructor() {
    // Use the specialized GitHub client with caching
    this.githubClient = EnhancedApiClient.createGitHubClient(process.env.GITHUB_API_KEY);
  }
  
  async findAudits(stablecoinName: string, homepageUrls: string[]): Promise<any> {
    // Use the web discovery service to find audit-related links
    const auditPatterns = [
      /audit/i, 
      /security/i, 
      /assessment/i, 
      /review/i
    ];
    
    // This will automatically use caching for both the HTTP requests and the discovered links
    const discoveredLinks = await webDiscoveryService.discoverSpecialPages(
      homepageUrls,
      auditPatterns
    );
    
    // Process the discovered links
    const auditLinks = [];
    
    for (const link of discoveredLinks) {
      // Fetch the content of each potential audit page
      const html = await webDiscoveryService.fetchHtml(link.url);
      if (!html) continue;
      
      // Look for audit-related keywords on the page
      const keywordResults = await webDiscoveryService.findKeywordsOnPage(
        html,
        ['audit report', 'security assessment', 'vulnerability', 'findings']
      );
      
      if (keywordResults.found) {
        auditLinks.push({
          ...link,
          keywords: keywordResults.matches.map(m => m.keyword)
        });
      }
    }
    
    // Search GitHub repositories for audit information
    // Using correctly typed params object with only string and number values
    const params = {
      q: `${stablecoinName} audit`,
      sort: 'stars',
      order: 'desc'
    };
    
    const repos = await this.githubClient.cachedGet('/search/repositories', params);
    
    // Process GitHub results...
    
    return {
      auditLinks,
      githubRepos: repos
    };
  }
}

/**
 * Example of how to refactor the TransparencyService to use the new utility services
 */
export class ImprovedTransparencyService {
  async getBasicTransparencyData(symbol: string, projectName?: string): Promise<any> {
    // Get the homepage URLs (assuming this is determined elsewhere)
    const homepageUrls = [
      `https://${projectName?.toLowerCase()}.com`,
      `https://${symbol.toLowerCase()}.com`
    ];
    
    // Use the web discovery service to find transparency-related links
    const transparencyPatterns = [
      /transparency/i,
      /attestation/i,
      /reserve/i,
      /backing/i,
      /audit/i
    ];
    
    const discoveredLinks = await webDiscoveryService.discoverSpecialPages(
      homepageUrls,
      transparencyPatterns
    );
    
    // Process the discovered links to find transparency dashboards
    // This would replace the existing code that manually crawls websites
    
    return {
      hasTransparencyPage: discoveredLinks.length > 0,
      transparencyLinks: discoveredLinks
    };
  }
  
  async getTransparencyData(symbol: string, projectName?: string): Promise<any> {
    // Get basic transparency data first
    const basicData = await this.getBasicTransparencyData(symbol, projectName);
    
    // Now analyze each transparency link in detail
    const detailedData = [];
    
    for (const link of basicData.transparencyLinks) {
      const html = await webDiscoveryService.fetchHtml(link.url);
      if (!html) continue;
      
      // Look for attestation-related keywords
      const keywordResults = await webDiscoveryService.findKeywordsOnPage(
        html,
        ['attestation', 'reserves', 'audit', 'report', 'backing']
      );
      
      if (keywordResults.found) {
        detailedData.push({
          url: link.url,
          title: link.text,
          keywords: keywordResults.matches.map(m => m.keyword)
        });
      }
    }
    
    return {
      ...basicData,
      detailedData
    };
  }
}

/**
 * Example of how to refactor the OracleAnalysisService to use the new enhanced API client
 */
export class ImprovedOracleAnalysisService {
  private etherscanClient: EnhancedApiClient;
  private bscScanClient: EnhancedApiClient;
  
  constructor() {
    // Use the specialized blockchain explorer clients with caching
    this.etherscanClient = EnhancedApiClient.createEtherscanClient(process.env.ETHERSCAN_API_KEY);
    this.bscScanClient = EnhancedApiClient.createBscScanClient(process.env.BSCSCAN_API_KEY);
  }
  
  async analyzeOracles(contractAddress: string, blockchain: string): Promise<any> {
    // Select the appropriate blockchain explorer client
    const client = blockchain.toLowerCase() === 'ethereum' 
      ? this.etherscanClient 
      : this.bscScanClient;
    
    // Get contract ABI using the cached client
    // Using correctly typed params object with only string and number values
    const params = {
      module: 'contract',
      action: 'getabi',
      address: contractAddress
    };
    
    const abiResponse = await client.cachedGet('', params);
    
    // Process the ABI to identify oracle usage
    // ...
    
    return {
      blockchain,
      contractAddress,
      hasOracle: true, // This would be determined by analyzing the ABI
      oracleType: 'chainlink' // Example
    };
  }
  
  async getCoinGeckoData(coinId: string): Promise<any> {
    // Create a custom client for CoinGecko
    const coinGeckoClient = new EnhancedApiClient(
      'https://api.coingecko.com/api/v3',
      process.env.COINGECKO_API_KEY,
      'x-cg-api-key',
      'coingecko',
      3600 // Cache for 1 hour
    );
    
    // Use string values for boolean parameters
    const params = {
      localization: 'false',
      market_data: 'true',
      community_data: 'true',
      developer_data: 'false'
    };
    
    return await coinGeckoClient.cachedGet(`/coins/${coinId}`, params);
  }
}

/**
 * IMPLEMENTATION GUIDE:
 * 
 * To refactor the existing Tier 3 services:
 * 
 * 1. Install the required dependencies:
 *    - npm install cheerio
 *    - npm install --save-dev @types/cheerio
 * 
 * 2. In each service file:
 *    - Import the new utility services
 *    - Replace direct API calls with EnhancedApiClient
 *    - Replace web scraping code with webDiscoveryService
 *    - Convert boolean values to strings in API parameters
 * 
 * 3. Key benefits:
 *    - Reduced code duplication
 *    - Consistent caching across services
 *    - Better error handling
 *    - Improved performance
 *    - More maintainable code
 */ 