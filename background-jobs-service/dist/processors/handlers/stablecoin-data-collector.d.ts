/**
 * Stablecoin Data Collection Job Handler
 *
 * Handles jobs for collecting comprehensive stablecoin data
 * from multiple sources (CoinGecko, transparency reports, DEX data)
 * with enhanced error handling, retries, and integration patterns
 */
import { Job } from '../../types';
import { BaseHandler, HandlerConfig } from './base-handler';
export declare class StablecoinDataCollector extends BaseHandler {
    private readonly supportedSources;
    constructor(config?: HandlerConfig);
    protected executeJob(job: Job, logger: any): Promise<any>;
    private collectFromSource;
    private performSourceCollection;
    private collectFromCoinGecko;
    private collectTransparencyData;
    private collectDexData;
    private collectSocialData;
    private collectMetricsData;
    /**
     * Assess overall data quality from collection results
     */
    private assessDataQuality;
}
//# sourceMappingURL=stablecoin-data-collector.d.ts.map