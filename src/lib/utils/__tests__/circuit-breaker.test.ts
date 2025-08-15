import { CircuitBreaker, CircuitBreakerOptions, CircuitState } from '../circuit-breaker';

// Mock timers for testing timeout functionality
jest.useFakeTimers();

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let mockOperation: jest.Mock;
  let mockMonitor: jest.Mock;

  beforeEach(() => {
    mockOperation = jest.fn();
    mockMonitor = jest.fn();
    
    const options: CircuitBreakerOptions = {
      threshold: 3,
      timeout: 60000, // 1 minute
      monitor: mockMonitor
    };
    
    circuitBreaker = new CircuitBreaker('test-service', options);
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.useFakeTimers();
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      const state = circuitBreaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
      expect(state.nextAttempt).toBeUndefined();
    });
  });

  describe('Success Operations', () => {
    it('should execute operation and return result when CLOSED', async () => {
      const expectedResult = { data: 'success' };
      mockOperation.mockResolvedValue(expectedResult);

      const result = await circuitBreaker.execute(mockOperation);

      expect(result).toEqual(expectedResult);
      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState().state).toBe('CLOSED');
    });

    it('should reset failure count after successful operation', async () => {
      mockOperation.mockRejectedValueOnce(new Error('temporary failure'));
      mockOperation.mockResolvedValue('success');

      // First call fails
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('temporary failure');
      expect(circuitBreaker.getState().failureCount).toBe(1);

      // Second call succeeds
      await circuitBreaker.execute(mockOperation);
      expect(circuitBreaker.getState().failureCount).toBe(0);
    });
  });

  describe('Failure Handling', () => {
    it('should track failure count on operation failures', async () => {
      const error = new Error('operation failed');
      mockOperation.mockRejectedValue(error);

      // First failure
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('operation failed');
      expect(circuitBreaker.getState().failureCount).toBe(1);
      expect(circuitBreaker.getState().state).toBe('CLOSED');

      // Second failure
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('operation failed');
      expect(circuitBreaker.getState().failureCount).toBe(2);
      expect(circuitBreaker.getState().state).toBe('CLOSED');
    });

    it('should open circuit after threshold failures are reached', async () => {
      const error = new Error('operation failed');
      mockOperation.mockRejectedValue(error);

      // Fail threshold times (3)
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('operation failed');
      }

      const state = circuitBreaker.getState();
      expect(state.state).toBe('OPEN');
      expect(state.failureCount).toBe(3);
      expect(state.nextAttempt).toBeDefined();
      expect(mockMonitor).toHaveBeenCalledWith('OPEN', error);
    });

    it('should throw circuit breaker error when OPEN and timeout not passed', async () => {
      // Force circuit to OPEN state
      mockOperation.mockRejectedValue(new Error('operation failed'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      expect(circuitBreaker.getState().state).toBe('OPEN');

      // Try to execute operation while circuit is OPEN
      mockOperation.mockResolvedValue('success');
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Circuit breaker is OPEN for test-service');

      // Operation should not have been called
      expect(mockOperation).toHaveBeenCalledTimes(3); // Only the initial failing calls
    });
  });

  describe('State Transitions', () => {
    beforeEach(async () => {
      // Open the circuit
      mockOperation.mockRejectedValue(new Error('operation failed'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }
      mockOperation.mockClear();
      mockMonitor.mockClear();
    });

    it('should transition from OPEN to HALF_OPEN after timeout', async () => {
      expect(circuitBreaker.getState().state).toBe('OPEN');

      // Advance time past the timeout
      jest.advanceTimersByTime(60001);

      // Mock successful operation for HALF_OPEN test
      mockOperation.mockResolvedValue('success');

      // This should transition to HALF_OPEN
      await circuitBreaker.execute(mockOperation);

      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should require 3 consecutive successes in HALF_OPEN to return to CLOSED', async () => {
      expect(circuitBreaker.getState().state).toBe('OPEN');

      // Advance time past timeout
      jest.advanceTimersByTime(60001);

      mockOperation.mockResolvedValue('success');

      // First success should transition to HALF_OPEN
      await circuitBreaker.execute(mockOperation);
      // Note: getState() doesn't expose internal successCount, so we test behavior

      // Second success
      await circuitBreaker.execute(mockOperation);

      // Third success should close the circuit
      await circuitBreaker.execute(mockOperation);

      expect(mockOperation).toHaveBeenCalledTimes(3);
      expect(mockMonitor).toHaveBeenCalledWith('CLOSED');
    });

    it('should return to OPEN if failure occurs in HALF_OPEN state', async () => {
      expect(circuitBreaker.getState().state).toBe('OPEN');

      // Advance time past timeout
      jest.advanceTimersByTime(60001);

      // First operation succeeds (transitions to HALF_OPEN)
      mockOperation.mockResolvedValueOnce('success');
      await circuitBreaker.execute(mockOperation);

      // Second operation fails (should return to OPEN)
      const error = new Error('half-open failure');
      mockOperation.mockRejectedValueOnce(error);
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('half-open failure');

      const state = circuitBreaker.getState();
      expect(state.state).toBe('OPEN');
      expect(state.nextAttempt).toBeDefined();
      expect(mockMonitor).toHaveBeenLastCalledWith('OPEN', error);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset circuit to CLOSED state regardless of current state', async () => {
      // Open the circuit
      mockOperation.mockRejectedValue(new Error('operation failed'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      expect(circuitBreaker.getState().state).toBe('OPEN');

      // Reset the circuit
      circuitBreaker.reset();

      const state = circuitBreaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
      expect(state.nextAttempt).toBeUndefined();
    });

    it('should allow normal operation after reset', async () => {
      // Open the circuit
      mockOperation.mockRejectedValue(new Error('operation failed'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      circuitBreaker.reset();
      mockOperation.mockResolvedValue('success after reset');

      const result = await circuitBreaker.execute(mockOperation);
      expect(result).toBe('success after reset');
    });
  });

  describe('Monitoring Callbacks', () => {
    it('should call monitor callback when circuit opens', async () => {
      const error = new Error('threshold reached');
      mockOperation.mockRejectedValue(error);

      // Fail threshold times to open circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      expect(mockMonitor).toHaveBeenCalledWith('OPEN', error);
    });

    it('should call monitor callback when circuit closes from HALF_OPEN', async () => {
      // First open the circuit
      mockOperation.mockRejectedValue(new Error('operation failed'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      mockMonitor.mockClear();

      // Advance time and succeed 3 times
      jest.advanceTimersByTime(60001);
      mockOperation.mockResolvedValue('success');

      await circuitBreaker.execute(mockOperation); // 1st success
      await circuitBreaker.execute(mockOperation); // 2nd success
      await circuitBreaker.execute(mockOperation); // 3rd success - should close

      expect(mockMonitor).toHaveBeenCalledWith('CLOSED');
    });

    it('should work without monitor callback', () => {
      const optionsWithoutMonitor: CircuitBreakerOptions = {
        threshold: 2,
        timeout: 30000
      };

      const cbWithoutMonitor = new CircuitBreaker('no-monitor', optionsWithoutMonitor);

      // Should not throw when no monitor is provided
      expect(() => {
        cbWithoutMonitor.getState();
      }).not.toThrow();
    });
  });

  describe('Configuration Options', () => {
    it('should respect custom threshold settings', async () => {
      const customOptions: CircuitBreakerOptions = {
        threshold: 5,
        timeout: 30000,
        monitor: mockMonitor
      };

      const customCB = new CircuitBreaker('custom-threshold', customOptions);
      mockOperation.mockRejectedValue(new Error('failure'));

      // Should not open until 5th failure
      for (let i = 0; i < 4; i++) {
        await expect(customCB.execute(mockOperation)).rejects.toThrow();
        expect(customCB.getState().state).toBe('CLOSED');
      }

      // 5th failure should open the circuit
      await expect(customCB.execute(mockOperation)).rejects.toThrow();
      expect(customCB.getState().state).toBe('OPEN');
    });

    it('should respect custom timeout settings', async () => {
      const customOptions: CircuitBreakerOptions = {
        threshold: 2,
        timeout: 5000, // 5 seconds
        monitor: mockMonitor
      };

      const customCB = new CircuitBreaker('custom-timeout', customOptions);
      mockOperation.mockRejectedValue(new Error('failure'));

      // Open the circuit
      await expect(customCB.execute(mockOperation)).rejects.toThrow();
      await expect(customCB.execute(mockOperation)).rejects.toThrow();
      expect(customCB.getState().state).toBe('OPEN');

      // Should still be closed after 4 seconds
      jest.advanceTimersByTime(4000);
      mockOperation.mockResolvedValue('success');
      await expect(customCB.execute(mockOperation)).rejects.toThrow('Circuit breaker is OPEN');

      // Should allow execution after 5+ seconds
      jest.advanceTimersByTime(1001);
      const result = await customCB.execute(mockOperation);
      expect(result).toBe('success');
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle synchronous errors in operations', async () => {
      const syncError = new Error('synchronous error');
      mockOperation.mockImplementation(() => {
        throw syncError;
      });

      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('synchronous error');
      expect(circuitBreaker.getState().failureCount).toBe(1);
    });

    it('should handle operations that return undefined', async () => {
      mockOperation.mockResolvedValue(undefined);

      const result = await circuitBreaker.execute(mockOperation);
      expect(result).toBeUndefined();
      expect(circuitBreaker.getState().state).toBe('CLOSED');
    });

    it('should handle operations that return null', async () => {
      mockOperation.mockResolvedValue(null);

      const result = await circuitBreaker.execute(mockOperation);
      expect(result).toBeNull();
      expect(circuitBreaker.getState().state).toBe('CLOSED');
    });

    it('should handle multiple rapid failures correctly', async () => {
      mockOperation.mockRejectedValue(new Error('rapid failure'));

      const promises = [];
      // Trigger multiple failures simultaneously
      for (let i = 0; i < 5; i++) {
        promises.push(circuitBreaker.execute(mockOperation).catch(err => err));
      }

      const results = await Promise.all(promises);
      
      // All should be errors
      results.forEach(result => {
        expect(result).toBeInstanceOf(Error);
      });

      // Circuit should be open
      expect(circuitBreaker.getState().state).toBe('OPEN');
      expect(circuitBreaker.getState().failureCount).toBeGreaterThanOrEqual(3);
    });

    it('should handle precise timing at timeout boundary', async () => {
      // Open circuit
      mockOperation.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      const state = circuitBreaker.getState();
      expect(state.state).toBe('OPEN');
      
      const nextAttemptTime = state.nextAttempt!.getTime();
      const currentTime = Date.now();
      const timeoutDuration = nextAttemptTime - currentTime;

      // Advance to exactly the timeout boundary
      jest.advanceTimersByTime(timeoutDuration);

      mockOperation.mockResolvedValue('boundary success');
      const result = await circuitBreaker.execute(mockOperation);
      expect(result).toBe('boundary success');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent operations when circuit is CLOSED', async () => {
      const delayedOperation = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('delayed success'), 100))
      );

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(circuitBreaker.execute(delayedOperation));
      }

      jest.advanceTimersByTime(100);
      const results = await Promise.all(promises);

      expect(results).toEqual(['delayed success', 'delayed success', 'delayed success', 'delayed success', 'delayed success']);
      expect(delayedOperation).toHaveBeenCalledTimes(5);
    });

    it('should handle concurrent operations when transitioning states', async () => {
      // Open the circuit first
      mockOperation.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      expect(circuitBreaker.getState().state).toBe('OPEN');
      mockOperation.mockClear(); // Clear the call count from opening the circuit

      // Advance time past timeout
      jest.advanceTimersByTime(60001);

      // Set up different behaviors for concurrent calls
      let callCount = 0;
      mockOperation.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve('first success');
        }
        return Promise.resolve('subsequent success');
      });

      // Multiple concurrent operations when circuit should transition to HALF_OPEN
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(circuitBreaker.execute(mockOperation));
      }

      const results = await Promise.all(promises);
      expect(results).toEqual(['first success', 'subsequent success', 'subsequent success']);
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });
  });

  describe('State Reporting', () => {
    it('should provide accurate state information', () => {
      const initialState = circuitBreaker.getState();
      
      expect(initialState).toHaveProperty('state');
      expect(initialState).toHaveProperty('failureCount');
      expect(initialState.state).toBe('CLOSED');
      expect(initialState.failureCount).toBe(0);
      expect(initialState.nextAttempt).toBeUndefined();
    });

    it('should provide nextAttempt time when circuit is OPEN', async () => {
      // Open the circuit
      mockOperation.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }

      const state = circuitBreaker.getState();
      expect(state.state).toBe('OPEN');
      expect(state.nextAttempt).toBeInstanceOf(Date);
      expect(state.nextAttempt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should update failure count accurately', async () => {
      mockOperation.mockRejectedValue(new Error('failure'));

      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      expect(circuitBreaker.getState().failureCount).toBe(1);

      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      expect(circuitBreaker.getState().failureCount).toBe(2);

      // Reset failure count on success
      mockOperation.mockResolvedValue('success');
      await circuitBreaker.execute(mockOperation);
      expect(circuitBreaker.getState().failureCount).toBe(0);
    });
  });
});