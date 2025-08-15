export interface AccessPattern {
    frequency: number;
    recency: number;
    volatility: number;
    dataSize: number;
    importance: number;
}
export declare class TTLCalculator {
    private baseTTL;
    private minTTL;
    private maxTTL;
    calculateOptimalTTL(key: string, dataSize: number, accessPattern?: AccessPattern, explicitTTL?: number): number;
    calculateTTLForStablecoinData(ticker: string, dataAge: number): number;
    calculateTTLForTransparencyData(changeFrequency: number): number;
    private getStablecoinMultiplier;
    getBaseTTL(): number;
    getMinTTL(): number;
    getMaxTTL(): number;
    setBaseTTL(ttl: number): void;
    setMinTTL(ttl: number): void;
    setMaxTTL(ttl: number): void;
}
//# sourceMappingURL=ttl-calculator.test.d.ts.map