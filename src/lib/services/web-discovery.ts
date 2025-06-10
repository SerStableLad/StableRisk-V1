import { metricsService } from './metrics-service';
import { cacheService } from './cache-service';
import { ApiClient, createApiClient } from './api-client';

// Type for discovered links
export interface DiscoveredLink {
  url: string;
  text: string;
  context: string;
  source: string;
}

/**
 * WebDiscoveryService centralizes web scraping and crawling functionality
 * used across multiple tier 3 services.
 * 
 * IMPORTANT: This service requires the 'cheerio' package to be installed:
 * npm install cheerio
 * npm install --save-dev @types/cheerio
 * 
 * How to use this service:
 * 
 * 1. Finding transparency dashboards or audit links:
 * ```
 * const links = await webDiscoveryService.discoverSpecialPages(
 *   ['https://projectwebsite.com'], 
 *   [/audit/i, /transparency/i, /attestation/i]
 * );
 * ```
 * 
 * 2. Fetching and analyzing a webpage:
 * ```
 * const html = await webDiscoveryService.fetchHtml('https://projectwebsite.com/transparency');
 * if (html) {
 *   const keywordResults = await webDiscoveryService.findKeywordsOnPage(
 *     html, 
 *     ['audit', 'verified', 'report']
 *   );
 *   console.log(keywordResults.matches);
 * }
 * ```
 */
export class WebDiscoveryService {
  private cheerio: any;
  private cacheKeyPrefix = 'web-discovery:';
  private cacheTTL = 86400 * 7; // 7 days

  constructor() {
    // We'll lazy-load cheerio when needed
  }

  private async loadCheerio() {
    if (!this.cheerio) {
      try {
        // Dynamic import to avoid adding cheerio to client-side bundle
        // NOTE: You need to install the 'cheerio' package:
        // npm install cheerio
        // npm install --save-dev @types/cheerio
        const cheerioModule = await import('cheerio');
        this.cheerio = cheerioModule;
      } catch (error) {
        console.error('Failed to load cheerio module:', error);
        throw new Error('Web discovery requires the cheerio module. Run: npm install cheerio @types/cheerio');
      }
    }
    return this.cheerio;
  }

  /**
   * Fetch and parse HTML content from a URL with caching
   */
  async fetchHtml(url: string, cacheKey?: string): Promise<string | null> {
    const metricName = 'web_discovery.fetch_html';
    const actualCacheKey = cacheKey || `${this.cacheKeyPrefix}html:${url}`;
    
    // Using manual timing
    const startTime = Date.now();
    
    try {
      // Try to get from cache first
      const cachedHtml = await cacheService.get<string>(actualCacheKey);
      if (cachedHtml) {
        console.log('Cache hit for', url);
        return cachedHtml;
      }
      
      console.log('Cache miss for', url);
      
      try {
        // Using fetch without timeout as it's not supported in the RequestInit type
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'StableRisk/1.0 (https://stablerisk.com)',
            'Accept': 'text/html,application/xhtml+xml'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch ${url}: ${response.status}`);
        }
        
        const html = await response.text();
        
        // Cache the result
        await cacheService.set(actualCacheKey, html, this.cacheTTL);
        
        return html;
      } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        return null;
      }
    } finally {
      // Log performance manually
      const duration = Date.now() - startTime;
      console.log(`${metricName} took ${duration}ms`);
    }
  }

  /**
   * Parse HTML and extract all links that match certain criteria
   */
  async extractLinks(html: string, urlPatterns: RegExp[] = []): Promise<DiscoveredLink[]> {
    if (!html) return [];
    
    const cheerio = await this.loadCheerio();
    const $ = cheerio.load(html);
    const links: DiscoveredLink[] = [];
    
    $('a[href]').each((i: number, el: any) => {
      const $el = $(el);
      const url = $el.attr('href');
      const text = $el.text().trim();
      
      if (!url || url.startsWith('#') || url.startsWith('javascript:')) {
        return;
      }
      
      // If patterns are provided, check if the URL matches any pattern
      if (urlPatterns.length > 0) {
        const matches = urlPatterns.some(pattern => pattern.test(url));
        if (!matches) return;
      }
      
      // Get some context (parent element text or surrounding text)
      const $parent = $el.parent();
      const context = $parent.text().trim().substring(0, 100);
      
      links.push({
        url: url,
        text: text,
        context: context,
        source: 'html'
      });
    });
    
    return links;
  }

  /**
   * Find specific keywords on a webpage
   */
  async findKeywordsOnPage(html: string, keywords: string[]): Promise<{
    found: boolean;
    matches: { keyword: string; context: string }[];
  }> {
    if (!html || !keywords.length) {
      return { found: false, matches: [] };
    }
    
    const cheerio = await this.loadCheerio();
    const $ = cheerio.load(html);
    const matches: { keyword: string; context: string }[] = [];
    
    // Remove scripts, styles, and comments to clean the content
    $('script, style, noscript, iframe').remove();
    const bodyText = $('body').text().toLowerCase();
    
    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      if (bodyText.includes(keywordLower)) {
        // Find elements containing this keyword
        $('body *').each((i: number, el: any) => {
          const $el = $(el);
          const text = $el.text().toLowerCase();
          
          if (text.includes(keywordLower) && text.length < 200) {
            matches.push({
              keyword,
              context: $el.text().trim()
            });
          }
        });
      }
    }
    
    return {
      found: matches.length > 0,
      matches
    };
  }

  /**
   * Discover transparency dashboards, attestation pages, and audit reports
   */
  async discoverSpecialPages(
    homepageUrls: string[], 
    specialPagePatterns: RegExp[]
  ): Promise<DiscoveredLink[]> {
    const metricName = 'web_discovery.discover_special_pages';
    const startTime = Date.now();
    
    try {
      const allDiscoveredLinks: DiscoveredLink[] = [];
      
      // Process each homepage
      for (const url of homepageUrls) {
        if (!url) continue;
        
        const cacheKey = `${this.cacheKeyPrefix}special_pages:${url}`;
        const cached = await cacheService.get<DiscoveredLink[]>(cacheKey);
        
        if (cached) {
          console.log('Cache hit for special pages:', url);
          allDiscoveredLinks.push(...cached);
          continue;
        }
        
        console.log('Cache miss for special pages:', url);
        
        try {
          const html = await this.fetchHtml(url);
          if (!html) continue;
          
          const links = await this.extractLinks(html, specialPagePatterns);
          
          // Store the results
          if (links.length > 0) {
            await cacheService.set(cacheKey, links, this.cacheTTL);
            allDiscoveredLinks.push(...links);
          }
        } catch (error) {
          console.error(`Error discovering special pages for ${url}:`, error);
        }
      }
      
      return allDiscoveredLinks;
    } finally {
      // Log performance manually
      const duration = Date.now() - startTime;
      console.log(`${metricName} took ${duration}ms`);
    }
  }

  /**
   * Check if a string matches any of the provided patterns
   */
  textMatchesPatterns(text: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(text));
  }
}

// Create a singleton instance
export const webDiscoveryService = new WebDiscoveryService(); 