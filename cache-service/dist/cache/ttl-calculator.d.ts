import { AccessPattern } from './access-pattern-analyzer';
export declare class TTLCalculator {
    private baseTTL;
    private minTTL;
    private maxTTL;
    /**
     * Calculate optimal TTL based on multiple factors
     */
    calculateOptimalTTL(key: string, dataSize: number, accessPattern?: AccessPattern, explicitTTL?: number): number;
    /**
     * TTL calculation for different data types
     */
    calculateTTLForStablecoinData(ticker: string, dataAge: number): number;
    calculateTTLForTransparencyData(changeFrequency: number): number;
    private getStablecoinMultiplier;
    /**
     * Set custom TTL bounds
     */
    setBounds(minTTL: number, maxTTL: number): void;
    /**
     * Set base TTL
     */
    setBaseTTL(ttl: number): void;
    /**
     * Get current configuration
     */
    getConfig(): {
        baseTTL: number;
        minTTL: number;
        maxTTL: number;
    };
}
//# sourceMappingURL=ttl-calculator.d.ts.map