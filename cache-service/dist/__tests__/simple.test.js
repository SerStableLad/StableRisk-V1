"use strict";
/**
 * Simple test to validate Jest TypeScript setup
 */
Object.defineProperty(exports, "__esModule", { value: true });
describe('Simple Test Suite', () => {
    it('should run a basic test', () => {
        expect(1 + 1).toBe(2);
    });
    it('should handle async operations', async () => {
        const result = await Promise.resolve('hello world');
        expect(result).toBe('hello world');
    });
    it('should handle basic TypeScript features', () => {
        const testObject = {
            name: 'test',
            value: 42
        };
        expect(testObject.name).toBe('test');
        expect(testObject.value).toBe(42);
    });
});
//# sourceMappingURL=simple.test.js.map