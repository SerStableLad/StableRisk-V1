/**
 * Stablecoin Data Collection Job Handler
 * 
 * Handles jobs for collecting comprehensive stablecoin data
 * from multiple sources (CoinGecko, transparency reports, DEX data)
 * with enhanced error handling, retries, and integration patterns
 */

import { Job } from '../../types';
import { BaseHandler, HandlerConfig } from './base-handler';

export class StablecoinDataCollector extends BaseHandler {
  private readonly supportedSources = [
    'coingecko',
    'transparency', 
    'dex',
    'social',
    'metrics'
  ];

  constructor(config: HandlerConfig = {}) {
    super({
      timeoutMs: 180000, // 3 minutes for multiple source collection
      retries: 2,
      enableMetrics: true,
      enableCircuitBreaker: true,
      circuitBreakerThreshold: 0.4, // Allow some source failures
      ...config
    });
  }

  protected async executeJob(job: Job, logger: any): Promise<any> {
    this.validateJobData(job, ['ticker']);
    
    const { ticker, urgent = false } = job.data;
    let { sources } = job.data;
    
    // Use default sources if none provided or empty array
    if (!sources || sources.length === 0) {
      sources = this.supportedSources;
    }

    logger.info('Starting stablecoin data collection', {
      operation: 'stablecoin_data_collection',
      metadata: { ticker, sources, urgent, sourcesCount: sources.length }
    });

    // Validate sources
    const invalidSources = sources.filter((s: string) => !this.supportedSources.includes(s.toLowerCase()));
    if (invalidSources.length > 0) {
      logger.warn(`Unsupported sources ignored: ${invalidSources.join(', ')}`);
    }

    const validSources = sources.filter((s: string) => this.supportedSources.includes(s.toLowerCase()));
    
    if (validSources.length === 0) {
      // Fallback to default sources if all provided sources are invalid
      logger.warn('All provided sources were invalid, using default sources');
      validSources.push(...this.supportedSources);
    }

    // Collect data from sources with enhanced error handling
    const sourceOperations = validSources.map((source: string) => 
      () => this.collectFromSource(source, ticker, logger)
    );

    const collectionResults = await this.executeInParallel(
      sourceOperations,
      validSources
    );

    // Build results object
    const results = {
      ticker,
      sources: {} as Record<string, any>,
      errors: collectionResults.errors,
      collectedAt: new Date().toISOString(),
      metadata: {
        urgent,
        totalSources: validSources.length,
        successfulSources: collectionResults.successCount,
        failedSources: collectionResults.failureCount,
        dataQuality: this.assessDataQuality(collectionResults.results)
      }
    };

    // Map successful results to sources
    collectionResults.results.forEach((result, index) => {
      const source = validSources[index];
      results.sources[source] = result;
    });

    logger.info('Stablecoin data collection completed', {
      operation: 'stablecoin_data_collection_complete',
      metadata: {
        ticker,
        successful: results.metadata.successfulSources,
        failed: results.metadata.failedSources,
        dataQuality: results.metadata.dataQuality
      }
    });

    return this.createResult(results, {
      ...results.metadata, // Preserve the original metadata
      collectionStrategy: urgent ? 'urgent' : 'standard',
      sourceCoverage: results.metadata.successfulSources / results.metadata.totalSources
    });
  }

  private async collectFromSource(source: string, ticker: string, logger: any): Promise<any> {
    const timeoutMs = 60000; // 1 minute per source
    
    return this.withTimeout(
      this.performSourceCollection(source, ticker, logger),
      timeoutMs,
      `${source} data collection`
    );
  }

  private async performSourceCollection(source: string, ticker: string, logger: any): Promise<any> {
    switch (source.toLowerCase()) {
      case 'coingecko':
        return await this.collectFromCoinGecko(ticker, logger);
      
      case 'transparency':
        return await this.collectTransparencyData(ticker, logger);
      
      case 'dex':
        return await this.collectDexData(ticker, logger);
      
      case 'social':
        return await this.collectSocialData(ticker, logger);
      
      case 'metrics':
        return await this.collectMetricsData(ticker, logger);
        
      default:
        throw new Error(`Unknown data source: ${source}`);
    }
  }

  private async collectFromCoinGecko(ticker: string, logger: any): Promise<any> {
    logger.debug(`Collecting CoinGecko data for ${ticker}`);
    
    // Simulate API call to CoinGecko
    await this.delay(Math.random() * 2000 + 1000); // 1-3 second delay
    
    // Mock data structure similar to what would be returned
    return {
      price: {
        usd: 1.0 + (Math.random() - 0.5) * 0.01, // Price around $1 with small variance
        market_cap: 15000000000 + Math.random() * 1000000000,
        volume_24h: 50000000 + Math.random() * 10000000
      },
      market_data: {
        circulating_supply: 15000000000,
        total_supply: 15000000000,
        max_supply: null
      },
      developer_data: {
        last_4_weeks_commits: Math.floor(Math.random() * 50),
        code_additions_deletions_4_weeks: {
          additions: Math.floor(Math.random() * 1000),
          deletions: Math.floor(Math.random() * 500)
        }
      },
      community_data: {
        twitter_followers: Math.floor(Math.random() * 100000) + 50000,
        reddit_average_posts_48h: Math.floor(Math.random() * 50),
        reddit_subscribers: Math.floor(Math.random() * 10000) + 5000
      }
    };
  }

  private async collectTransparencyData(ticker: string, logger: any): Promise<any> {
    logger.debug(`Collecting transparency data for ${ticker}`);
    
    await this.delay(Math.random() * 3000 + 2000); // 2-5 second delay
    
    const assets = ['Cash', 'Treasury Bills', 'Commercial Paper', 'Corporate Bonds'];
    const allocations = assets.map(asset => ({
      asset,
      percentage: Math.random() * 30 + 10, // 10-40% allocation
      usd_value: Math.random() * 5000000000 + 1000000000 // 1-6B USD
    }));

    // Normalize to 100%
    const total = allocations.reduce((sum, alloc) => sum + alloc.percentage, 0);
    allocations.forEach(alloc => {
      alloc.percentage = (alloc.percentage / total) * 100;
    });

    return {
      report_date: new Date().toISOString().split('T')[0],
      total_assets_usd: allocations.reduce((sum, alloc) => sum + alloc.usd_value, 0),
      asset_breakdown: allocations,
      audit_firm: 'Grant Thornton LLP',
      attestation_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      confidence_score: 0.85 + Math.random() * 0.15 // 0.85-1.0
    };
  }

  private async collectDexData(ticker: string, logger: any): Promise<any> {
    logger.debug(`Collecting DEX data for ${ticker}`);
    
    await this.delay(Math.random() * 1500 + 500); // 0.5-2 second delay
    
    const exchanges = ['Uniswap V3', 'Curve', 'Balancer', 'SushiSwap'];
    const pairs = exchanges.map(exchange => ({
      exchange,
      pair: `${ticker}/USDC`,
      liquidity_usd: Math.random() * 100000000 + 10000000, // 10-110M USD
      volume_24h_usd: Math.random() * 50000000 + 5000000, // 5-55M USD
      price: 1.0 + (Math.random() - 0.5) * 0.005, // Very close to $1
      price_impact_1000: Math.random() * 0.002 + 0.0001 // 0.01-0.21% price impact
    }));

    return {
      total_liquidity_usd: pairs.reduce((sum, pair) => sum + pair.liquidity_usd, 0),
      total_volume_24h_usd: pairs.reduce((sum, pair) => sum + pair.volume_24h_usd, 0),
      weighted_average_price: pairs.reduce((sum, pair, _, arr) => 
        sum + (pair.price * pair.liquidity_usd) / arr.reduce((total, p) => total + p.liquidity_usd, 0), 0),
      exchange_data: pairs,
      peg_stability: {
        deviation_from_dollar: Math.abs(pairs[0].price - 1.0),
        volatility_24h: Math.random() * 0.01 + 0.001 // 0.1-1.1% volatility
      }
    };
  }

  private async collectSocialData(ticker: string, logger: any): Promise<any> {
    logger.debug(`Collecting social sentiment data for ${ticker}`);
    
    await this.delay(Math.random() * 1000 + 500); // 0.5-1.5 second delay
    
    return {
      twitter: {
        mentions_24h: Math.floor(Math.random() * 1000) + 100,
        sentiment_score: Math.random() * 2 - 1, // -1 to 1
        trending_hashtags: [`#${ticker}`, '#stablecoin', '#crypto']
      },
      reddit: {
        posts_24h: Math.floor(Math.random() * 50) + 10,
        sentiment_score: Math.random() * 2 - 1,
        top_subreddits: ['cryptocurrency', 'defi', 'ethereum']
      },
      news: {
        articles_24h: Math.floor(Math.random() * 20) + 5,
        sentiment_score: Math.random() * 2 - 1,
        key_topics: ['regulation', 'adoption', 'reserves']
      }
    };
  }

  private async collectMetricsData(ticker: string, logger: any): Promise<any> {
    logger.debug(`Collecting metrics data for ${ticker}`);
    
    await this.delay(Math.random() * 2000 + 1000); // 1-3 second delay
    
    return {
      on_chain: {
        total_transfers_24h: Math.floor(Math.random() * 10000) + 1000,
        unique_addresses_24h: Math.floor(Math.random() * 5000) + 500,
        average_transaction_size: Math.random() * 10000 + 1000,
        whale_transactions_24h: Math.floor(Math.random() * 100) + 10
      },
      exchange_flows: {
        net_exchange_flow_24h: (Math.random() - 0.5) * 100000000, // -50M to +50M
        largest_inflow: Math.random() * 10000000 + 1000000,
        largest_outflow: Math.random() * 10000000 + 1000000
      },
      defi_usage: {
        tvl_protocols: Math.random() * 5000000000 + 1000000000, // 1-6B USD
        lending_borrowed: Math.random() * 2000000000 + 500000000,
        yield_farming_staked: Math.random() * 3000000000 + 500000000
      }
    };
  }

  /**
   * Assess overall data quality from collection results
   */
  private assessDataQuality(results: any[]): {
    score: number;
    completeness: number;
    freshness: number;
    consistency: number;
  } {
    if (results.length === 0) {
      return { score: 0, completeness: 0, freshness: 0, consistency: 0 };
    }

    // Calculate completeness based on expected data fields
    const expectedFields = ['price', 'market_data', 'volume', 'supply'];
    const completeness = results.reduce((sum, result) => {
      const presentFields = expectedFields.filter(field => 
        result && typeof result === 'object' && field in result
      ).length;
      return sum + (presentFields / expectedFields.length);
    }, 0) / results.length;

    // Assess data freshness (mock implementation)
    const freshness = 0.9 + Math.random() * 0.1; // 90-100%

    // Assess consistency across sources (mock implementation)
    const consistency = results.length > 1 ? 0.85 + Math.random() * 0.15 : 1.0;

    const score = (completeness * 0.4) + (freshness * 0.3) + (consistency * 0.3);

    return {
      score: Math.round(score * 100) / 100,
      completeness: Math.round(completeness * 100) / 100,
      freshness: Math.round(freshness * 100) / 100,
      consistency: Math.round(consistency * 100) / 100
    };
  }
}