"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TTLCalculator = void 0;
class TTLCalculator {
    baseTTL = 3600; // 1 hour default
    minTTL = 300; // 5 minutes minimum
    maxTTL = 86400; // 24 hours maximum
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
    // TTL calculation for different data types
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
    // Getters for testing
    getBaseTTL() {
        return this.baseTTL;
    }
    getMinTTL() {
        return this.minTTL;
    }
    getMaxTTL() {
        return this.maxTTL;
    }
    // Setters for testing
    setBaseTTL(ttl) {
        this.baseTTL = ttl;
    }
    setMinTTL(ttl) {
        this.minTTL = ttl;
    }
    setMaxTTL(ttl) {
        this.maxTTL = ttl;
    }
}
exports.TTLCalculator = TTLCalculator;
describe('TTL Calculator', () => {
    let ttlCalculator;
    beforeEach(() => {
        ttlCalculator = new TTLCalculator();
    });
    describe('Basic TTL Calculation', () => {
        test('should return explicit TTL when provided', () => {
            const explicitTTL = 7200; // 2 hours
            const result = ttlCalculator.calculateOptimalTTL('test:key', 1000, undefined, explicitTTL);
            expect(result).toBe(explicitTTL);
        });
        test('should respect minimum TTL bounds', () => {
            const tooSmallTTL = 100; // Less than 5 minutes
            const result = ttlCalculator.calculateOptimalTTL('test:key', 1000, undefined, tooSmallTTL);
            expect(result).toBe(ttlCalculator.getMinTTL());
        });
        test('should respect maximum TTL bounds', () => {
            const tooLargeTTL = 100000; // More than 24 hours
            const result = ttlCalculator.calculateOptimalTTL('test:key', 1000, undefined, tooLargeTTL);
            expect(result).toBe(ttlCalculator.getMaxTTL());
        });
        test('should return base TTL when no access pattern provided', () => {
            const result = ttlCalculator.calculateOptimalTTL('test:key', 1000);
            expect(result).toBe(ttlCalculator.getBaseTTL());
        });
    });
    describe('Access Pattern-based TTL Calculation', () => {
        test('should increase TTL for high frequency access', () => {
            const accessPattern = {
                frequency: 100, // High frequency (100 accesses per hour)
                recency: 0, // Just accessed
                volatility: 0.1, // Low volatility
                dataSize: 1000,
                importance: 0.8 // High importance
            };
            const result = ttlCalculator.calculateOptimalTTL('test:key', 1000, accessPattern);
            expect(result).toBeGreaterThan(ttlCalculator.getBaseTTL());
        });
        test('should decrease TTL for low frequency access', () => {
            const accessPattern = {
                frequency: 1, // Low frequency
                recency: 12, // Accessed 12 hours ago
                volatility: 0.8, // High volatility
                dataSize: 1000,
                importance: 0.2 // Low importance
            };
            const result = ttlCalculator.calculateOptimalTTL('test:key', 1000, accessPattern);
            expect(result).toBeLessThan(ttlCalculator.getBaseTTL());
        });
        test('should handle recency factor correctly', () => {
            const recentAccess = {
                frequency: 10,
                recency: 0, // Just accessed
                volatility: 0.5,
                dataSize: 1000,
                importance: 0.5
            };
            const oldAccess = {
                frequency: 10,
                recency: 20, // Accessed 20 hours ago
                volatility: 0.5,
                dataSize: 1000,
                importance: 0.5
            };
            const recentResult = ttlCalculator.calculateOptimalTTL('test:recent', 1000, recentAccess);
            const oldResult = ttlCalculator.calculateOptimalTTL('test:old', 1000, oldAccess);
            expect(recentResult).toBeGreaterThan(oldResult);
        });
        test('should handle volatility factor correctly', () => {
            const stableData = {
                frequency: 10,
                recency: 1,
                volatility: 0.1, // Low volatility (stable data)
                dataSize: 1000,
                importance: 0.5
            };
            const volatileData = {
                frequency: 10,
                recency: 1,
                volatility: 0.9, // High volatility
                dataSize: 1000,
                importance: 0.5
            };
            const stableResult = ttlCalculator.calculateOptimalTTL('test:stable', 1000, stableData);
            const volatileResult = ttlCalculator.calculateOptimalTTL('test:volatile', 1000, volatileData);
            expect(stableResult).toBeGreaterThan(volatileResult);
        });
        test('should handle data size factor correctly', () => {
            const smallData = {
                frequency: 10,
                recency: 1,
                volatility: 0.5,
                dataSize: 500, // Small data
                importance: 0.5
            };
            const largeData = {
                frequency: 10,
                recency: 1,
                volatility: 0.5,
                dataSize: 50000, // Large data
                importance: 0.5
            };
            const smallResult = ttlCalculator.calculateOptimalTTL('test:small', 500, smallData);
            const largeResult = ttlCalculator.calculateOptimalTTL('test:large', 50000, largeData);
            expect(smallResult).toBeGreaterThan(largeResult);
        });
        test('should handle importance factor correctly', () => {
            const importantData = {
                frequency: 10,
                recency: 1,
                volatility: 0.5,
                dataSize: 1000,
                importance: 1.0 // Very important
            };
            const unimportantData = {
                frequency: 10,
                recency: 1,
                volatility: 0.5,
                dataSize: 1000,
                importance: 0.0 // Not important
            };
            const importantResult = ttlCalculator.calculateOptimalTTL('test:important', 1000, importantData);
            const unimportantResult = ttlCalculator.calculateOptimalTTL('test:unimportant', 1000, unimportantData);
            expect(importantResult).toBeGreaterThan(unimportantResult);
        });
        test('should round TTL to nearest minute', () => {
            const accessPattern = {
                frequency: 50,
                recency: 0.5,
                volatility: 0.3,
                dataSize: 1000,
                importance: 0.7
            };
            const result = ttlCalculator.calculateOptimalTTL('test:rounding', 1000, accessPattern);
            // Should be divisible by 60 (rounded to nearest minute)
            expect(result % 60).toBe(0);
        });
    });
    describe('Stablecoin-specific TTL Calculation', () => {
        test('should calculate appropriate TTL for USDT', () => {
            const dataAge = 3600; // 1 hour old data
            const result = ttlCalculator.calculateTTLForStablecoinData('USDT', dataAge);
            // USDT has 0.8 multiplier, so should be less than base TTL
            expect(result).toBeLessThan(ttlCalculator.getBaseTTL());
        });
        test('should calculate appropriate TTL for DAI', () => {
            const dataAge = 3600; // 1 hour old data
            const result = ttlCalculator.calculateTTLForStablecoinData('DAI', dataAge);
            // DAI has 1.2 multiplier, so should be more than base TTL
            expect(result).toBeGreaterThan(ttlCalculator.getBaseTTL());
        });
        test('should reduce TTL for older data', () => {
            const freshData = ttlCalculator.calculateTTLForStablecoinData('USDC', 0);
            const oldData = ttlCalculator.calculateTTLForStablecoinData('USDC', 86400); // 1 day old
            expect(freshData).toBeGreaterThan(oldData);
        });
        test('should use default multiplier for unknown tickers', () => {
            const unknownResult = ttlCalculator.calculateTTLForStablecoinData('UNKNOWN', 0);
            const knownResult = ttlCalculator.calculateTTLForStablecoinData('USDC', 0);
            // Unknown should use 1.0 multiplier, USDC uses 0.9
            expect(unknownResult).toBeGreaterThan(knownResult);
        });
    });
    describe('Transparency Data TTL Calculation', () => {
        test('should calculate longer TTL for infrequently changing transparency data', () => {
            const lowChangeFreq = ttlCalculator.calculateTTLForTransparencyData(1); // Changes once per 10
            const highChangeFreq = ttlCalculator.calculateTTLForTransparencyData(8); // Changes 8 times per 10
            expect(lowChangeFreq).toBeGreaterThan(highChangeFreq);
        });
        test('should use base multiplier of 2.0 for transparency data', () => {
            const result = ttlCalculator.calculateTTLForTransparencyData(0); // No changes
            // Should be at least 2x base TTL
            expect(result).toBeGreaterThanOrEqual(ttlCalculator.getBaseTTL() * 2);
        });
        test('should respect minimum frequency factor', () => {
            const result = ttlCalculator.calculateTTLForTransparencyData(15); // Very high change frequency
            // Should still have minimum 0.5x factor
            expect(result).toBeGreaterThanOrEqual(ttlCalculator.getBaseTTL());
        });
    });
    describe('Configuration and Bounds', () => {
        test('should allow configuration of base TTL', () => {
            const newBaseTTL = 7200; // 2 hours
            ttlCalculator.setBaseTTL(newBaseTTL);
            const result = ttlCalculator.calculateOptimalTTL('test:config', 1000);
            expect(result).toBe(newBaseTTL);
        });
        test('should allow configuration of min TTL', () => {
            const newMinTTL = 600; // 10 minutes
            ttlCalculator.setMinTTL(newMinTTL);
            const result = ttlCalculator.calculateOptimalTTL('test:min', 1000, undefined, 100);
            expect(result).toBe(newMinTTL);
        });
        test('should allow configuration of max TTL', () => {
            const newMaxTTL = 172800; // 48 hours
            ttlCalculator.setMaxTTL(newMaxTTL);
            const result = ttlCalculator.calculateOptimalTTL('test:max', 1000, undefined, 200000);
            expect(result).toBe(newMaxTTL);
        });
        test('should enforce bounds even with extreme access patterns', () => {
            const extremePattern = {
                frequency: 1000, // Very high frequency
                recency: 0,
                volatility: 0,
                dataSize: 100,
                importance: 1.0
            };
            const result = ttlCalculator.calculateOptimalTTL('test:extreme', 100, extremePattern);
            expect(result).toBeLessThanOrEqual(ttlCalculator.getMaxTTL());
            expect(result).toBeGreaterThanOrEqual(ttlCalculator.getMinTTL());
        });
    });
    describe('Edge Cases', () => {
        test('should handle zero frequency', () => {
            const accessPattern = {
                frequency: 0,
                recency: 24,
                volatility: 0.5,
                dataSize: 1000,
                importance: 0.5
            };
            const result = ttlCalculator.calculateOptimalTTL('test:zero-freq', 1000, accessPattern);
            expect(result).toBeGreaterThanOrEqual(ttlCalculator.getMinTTL());
            expect(result).toBeLessThanOrEqual(ttlCalculator.getMaxTTL());
        });
        test('should handle maximum values', () => {
            const accessPattern = {
                frequency: Number.MAX_SAFE_INTEGER,
                recency: 0,
                volatility: 1.0,
                dataSize: Number.MAX_SAFE_INTEGER,
                importance: 1.0
            };
            const result = ttlCalculator.calculateOptimalTTL('test:max-values', Number.MAX_SAFE_INTEGER, accessPattern);
            expect(result).toBeGreaterThanOrEqual(ttlCalculator.getMinTTL());
            expect(result).toBeLessThanOrEqual(ttlCalculator.getMaxTTL());
        });
        test('should handle negative values gracefully', () => {
            const accessPattern = {
                frequency: -10, // Invalid negative frequency
                recency: -5, // Invalid negative recency
                volatility: -0.5, // Invalid negative volatility
                dataSize: 1000,
                importance: -1.0 // Invalid negative importance
            };
            const result = ttlCalculator.calculateOptimalTTL('test:negative', 1000, accessPattern);
            // Should still return a valid TTL within bounds
            expect(result).toBeGreaterThanOrEqual(ttlCalculator.getMinTTL());
            expect(result).toBeLessThanOrEqual(ttlCalculator.getMaxTTL());
        });
        test('should handle undefined and null values', () => {
            const result1 = ttlCalculator.calculateOptimalTTL('test:undefined', 1000, undefined);
            const result2 = ttlCalculator.calculateOptimalTTL('test:null', 1000, null);
            expect(result1).toBe(ttlCalculator.getBaseTTL());
            expect(result2).toBe(ttlCalculator.getBaseTTL());
        });
    });
});
//# sourceMappingURL=ttl-calculator.test.js.map