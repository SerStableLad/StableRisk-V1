"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TTLCalculator = void 0;
class TTLCalculator {
    baseTTL = 3600; // 1 hour default
    minTTL = 300; // 5 minutes minimum
    maxTTL = 86400; // 24 hours maximum
    /**
     * Calculate optimal TTL based on multiple factors
     */
    calculateOptimalTTL(key, dataSize, accessPattern, explicitTTL) {
        // If explicit TTL is provided, use it (but respect bounds)
        if (explicitTTL !== undefined) {
            return Math.max(this.minTTL, Math.min(this.maxTTL, explicitTTL));
        }
        if (!accessPattern) {
            return this.baseTTL;
        }
        let calculatedTTL = this.baseTTL;
        // Frequency factor: More frequent access = longer TTL
        const frequencyFactor = Math.min(2.0, 1 + (accessPattern.frequency / 100));
        calculatedTTL *= frequencyFactor;
        // Recency factor: Recent access = longer TTL
        const recencyFactor = Math.max(0.5, 1 - (accessPattern.recency / 24));
        calculatedTTL *= recencyFactor;
        // Volatility factor: Less volatile data = longer TTL
        const volatilityFactor = Math.max(0.3, 1 - accessPattern.volatility);
        calculatedTTL *= volatilityFactor;
        // Size factor: Smaller data = longer TTL (less memory pressure)
        const sizeFactor = dataSize < 1024 ? 1.2 : dataSize < 10240 ? 1.0 : 0.8;
        calculatedTTL *= sizeFactor;
        // Importance factor: Important data = longer TTL
        const importanceFactor = 0.8 + (accessPattern.importance * 0.4);
        calculatedTTL *= importanceFactor;
        // Apply bounds and round to nearest minute
        calculatedTTL = Math.max(this.minTTL, Math.min(this.maxTTL, calculatedTTL));
        return Math.round(calculatedTTL / 60) * 60; // Round to nearest minute
    }
    /**
     * TTL calculation for different data types
     */
    calculateTTLForStablecoinData(ticker, dataAge) {
        const baseMultiplier = this.getStablecoinMultiplier(ticker);
        const ageMultiplier = Math.max(0.5, 1 - (dataAge / 86400)); // Reduce TTL as data ages
        return Math.round(this.baseTTL * baseMultiplier * ageMultiplier);
    }
    calculateTTLForTransparencyData(changeFrequency) {
        // Transparency data changes less frequently
        const baseMultiplier = 2.0; // Start with 2x base TTL
        const frequencyFactor = Math.max(0.5, 1 - (changeFrequency / 10));
        return Math.round(this.baseTTL * baseMultiplier * frequencyFactor);
    }
    getStablecoinMultiplier(ticker) {
        // Different stablecoins have different update patterns
        const multipliers = {
            'USDT': 0.8, // High volume, frequent updates
            'USDC': 0.9, // High volume, regular updates
            'DAI': 1.2, // DeFi, less frequent updates
            'BUSD': 0.9, // Exchange token, regular updates
            'FRAX': 1.5 // Algorithmic, less frequent updates
        };
        return multipliers[ticker.toUpperCase()] || 1.0;
    }
    /**
     * Set custom TTL bounds
     */
    setBounds(minTTL, maxTTL) {
        this.minTTL = Math.max(60, minTTL); // At least 1 minute
        this.maxTTL = Math.min(604800, maxTTL); // At most 1 week
        if (this.minTTL >= this.maxTTL) {
            throw new Error('Minimum TTL must be less than maximum TTL');
        }
    }
    /**
     * Set base TTL
     */
    setBaseTTL(ttl) {
        if (ttl < this.minTTL || ttl > this.maxTTL) {
            throw new Error(`Base TTL must be between ${this.minTTL} and ${this.maxTTL}`);
        }
        this.baseTTL = ttl;
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return {
            baseTTL: this.baseTTL,
            minTTL: this.minTTL,
            maxTTL: this.maxTTL
        };
    }
}
exports.TTLCalculator = TTLCalculator;
//# sourceMappingURL=ttl-calculator.js.map