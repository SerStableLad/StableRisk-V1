/**
 * Transparency Analysis Job Handler
 *
 * Analyzes transparency reports and attestations for stablecoins
 * using web scraping and document analysis techniques with enhanced
 * error handling, validation, and integration patterns
 */
import { Job } from '../../types';
import { BaseHandler, HandlerConfig } from './base-handler';
export declare class TransparencyAnalyzer extends BaseHandler {
    private readonly supportedAnalysisTypes;
    constructor(config?: HandlerConfig);
    protected executeJob(job: Job, logger: any): Promise<any>;
    private analyzeTransparencyReport;
    private analyzeCollateralReport;
    private analyzeAttestationReport;
    private analyzeReservesReport;
    private performGeneralAnalysis;
    private getRandomCreditRating;
    private getRandomMaturity;
    /**
     * Validate URL format
     */
    private isValidUrl;
    /**
     * Validate analysis results based on type
     */
    private validateAnalysisResult;
    /**
     * Count meaningful data points in analysis result
     */
    private countDataPoints;
    /**
     * Assess depth and complexity of analysis
     */
    private assessAnalysisDepth;
    /**
     * Infer document type from analysis results
     */
    private inferDocumentType;
    /**
     * Calculate completeness score
     */
    private calculateCompleteness;
    /**
     * Get nested object value by dot notation
     */
    private getNestedValue;
    /**
     * Check if result has nested data structures
     */
    private hasNestedStructures;
    /**
     * Check if result contains calculated metrics
     */
    private hasCalculatedMetrics;
}
//# sourceMappingURL=transparency-analyzer.d.ts.map