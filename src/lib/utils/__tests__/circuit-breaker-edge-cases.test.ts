import { CircuitBreaker, CircuitBreakerOptions, CircuitState } from '../circuit-breaker';

// Edge cases, timing-sensitive scenarios, and boundary condition tests
describe('CircuitBreaker Edge Cases', () => {
  let circuitBreaker: CircuitBreaker;
  let mockOperation: jest.Mock;
  let mockMonitor: jest.Mock;

  beforeEach(() => {
    mockOperation = jest.fn();
    mockMonitor = jest.fn();
    
    const options: CircuitBreakerOptions = {
      threshold: 3,
      timeout: 60000,
      monitor: mockMonitor
    };
    
    circuitBreaker = new CircuitBreaker('edge-case-test', options);
    jest.clearAllMocks();
  });

  describe('Timing Edge Cases', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should handle operations that complete exactly at timeout boundary', async () => {
      // Open circuit first
      mockOperation.mockRejectedValue(new Error('initial failure'));
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(mockOperation).catch(() => {});
      }

      expect(circuitBreaker.getState().state).toBe('OPEN');
      const state = circuitBreaker.getState();
      const nextAttemptTime = state.nextAttempt!.getTime();
      const currentTime = Date.now();
      const exactTimeout = nextAttemptTime - currentTime;

      // Advance time to exactly the timeout moment
      jest.advanceTimersByTime(exactTimeout);

      mockOperation.mockResolvedValue('boundary success');
      const result = await circuitBreaker.execute(mockOperation);
      expect(result).toBe('boundary success');
    });

    it('should handle rapid successive calls at timeout boundary', async () => {
      // Open circuit
      mockOperation.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(mockOperation).catch(() => {});
      }

      const state = circuitBreaker.getState();
      const timeoutDuration = state.nextAttempt!.getTime() - Date.now();

      // Advance to timeout boundary
      jest.advanceTimersByTime(timeoutDuration);

      mockOperation.mockResolvedValue('rapid success');

      // Multiple rapid calls right at boundary
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(circuitBreaker.execute(mockOperation));
      }

      const results = await Promise.all(promises);
      expect(results.every(r => r === 'rapid success')).toBe(true);
    });

    it('should handle millisecond precision timing', async () => {
      const preciseOptions: CircuitBreakerOptions = {
        threshold: 1,
        timeout: 1000, // 1 second exactly
        monitor: mockMonitor
      };

      const preciseCB = new CircuitBreaker('precise-timing', preciseOptions);

      // Open circuit
      mockOperation.mockRejectedValue(new Error('precision failure'));
      await preciseCB.execute(mockOperation).catch(() => {});

      const openTime = Date.now();
      expect(preciseCB.getState().state).toBe('OPEN');

      // Test at 999ms (should still be closed)
      jest.advanceTimersByTime(999);
      mockOperation.mockResolvedValue('early attempt');
      await expect(preciseCB.execute(mockOperation))
        .rejects.toThrow('Circuit breaker is OPEN');

      // Test at 1000ms (should be allowed)
      jest.advanceTimersByTime(1);
      const result = await preciseCB.execute(mockOperation);
      expect(result).toBe('early attempt');
    });

    it('should handle clock adjustments and time jumps', async () => {
      // Open circuit
      mockOperation.mockRejectedValue(new Error('time jump test'));
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(mockOperation).catch(() => {});
      }

      expect(circuitBreaker.getState().state).toBe('OPEN');

      // Simulate large time jump (system clock adjustment)
      jest.advanceTimersByTime(1000000); // Jump way ahead

      mockOperation.mockResolvedValue('post time jump');
      const result = await circuitBreaker.execute(mockOperation);
      expect(result).toBe('post time jump');
    });
  });

  describe('Concurrency Edge Cases', () => {
    it('should handle race conditions during state transitions', async () => {
      let resolveOperations: Array<(value: any) => void> = [];
      let operationCount = 0;

      mockOperation.mockImplementation(() => {
        operationCount++;
        if (operationCount <= 3) {
          return Promise.reject(new Error(`Race condition failure ${operationCount}`));
        }

        // Create pending promises for race condition testing
        return new Promise((resolve) => {
          resolveOperations.push(resolve);
        });
      });

      // Create failures to open circuit
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(mockOperation).catch(() => {});
      }

      expect(circuitBreaker.getState().state).toBe('OPEN');

      jest.useFakeTimers();
      jest.advanceTimersByTime(60001);

      // Start multiple concurrent operations
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(circuitBreaker.execute(mockOperation));
      }

      // Resolve all pending operations
      resolveOperations.forEach((resolve, index) => {
        resolve(`Concurrent result ${index + 1}`);
      });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      expect(results.every(r => typeof r === 'string')).toBe(true);

      jest.useRealTimers();
    });

    it('should handle mixed success/failure during HALF_OPEN transitions', async () => {
      // Open circuit
      mockOperation.mockRejectedValue(new Error('open circuit'));
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(mockOperation).catch(() => {});
      }

      jest.useFakeTimers();
      jest.advanceTimersByTime(60001);

      let callCount = 0;
      mockOperation.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve('first success');
        if (callCount === 2) return Promise.reject(new Error('second failure'));
        if (callCount === 3) return Promise.resolve('third success');
        return Promise.resolve('subsequent success');
      });

      // First call should succeed (transitions to HALF_OPEN)
      const result1 = await circuitBreaker.execute(mockOperation);
      expect(result1).toBe('first success');

      // Second call fails (should reopen circuit)
      await expect(circuitBreaker.execute(mockOperation))
        .rejects.toThrow('second failure');

      expect(circuitBreaker.getState().state).toBe('OPEN');

      jest.useRealTimers();
    });

    it('should handle overlapping reset operations', async () => {
      // Open circuit
      mockOperation.mockRejectedValue(new Error('reset test'));
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(mockOperation).catch(() => {});
      }

      expect(circuitBreaker.getState().state).toBe('OPEN');

      // Multiple rapid resets
      for (let i = 0; i < 10; i++) {
        circuitBreaker.reset();
      }

      const finalState = circuitBreaker.getState();
      expect(finalState.state).toBe('CLOSED');
      expect(finalState.failureCount).toBe(0);
      expect(finalState.nextAttempt).toBeUndefined();
    });
  });

  describe('Memory and Resource Edge Cases', () => {
    it('should handle operations with large data payloads', async () => {
      const largePayloa = 'x'.repeat(1000000); // 1MB string
      
      mockOperation.mockResolvedValue({
        data: largePayloa,
        size: largePayloa.length,
        processed: true
      });

      const result = await circuitBreaker.execute(mockOperation);
      expect(result.data).toHaveLength(1000000);
      expect(result.processed).toBe(true);
      expect(circuitBreaker.getState().state).toBe('CLOSED');
    });

    it('should handle operations that modify global state', async () => {
      const globalState = { counter: 0, operations: [] };

      mockOperation.mockImplementation(async () => {
        globalState.counter++;
        globalState.operations.push(`Operation ${globalState.counter}`);
        
        if (globalState.counter <= 2) {
          throw new Error(`Global state failure ${globalState.counter}`);
        }
        
        return globalState.counter;
      });

      // First two operations fail but modify global state
      await circuitBreaker.execute(mockOperation).catch(() => {});
      await circuitBreaker.execute(mockOperation).catch(() => {});

      expect(globalState.counter).toBe(2);
      expect(globalState.operations).toHaveLength(2);

      // Third operation succeeds (counter=3), so circuit stays closed
      const result = await circuitBreaker.execute(mockOperation);
      expect(result).toBe(3);

      expect(circuitBreaker.getState().state).toBe('CLOSED');
      expect(globalState.counter).toBe(3);
    });

    it('should handle memory pressure scenarios', async () => {
      const memoryIntensiveOperation = jest.fn().mockImplementation(() => {
        // Simulate memory-intensive operation
        const largeArray = new Array(100000).fill().map((_, i) => ({
          id: i,
          data: `Memory test data ${i}`,
          timestamp: new Date(),
          payload: new Array(100).fill('x')
        }));

        // Simulate processing
        const processed = largeArray.filter(item => item.id % 2 === 0);
        
        return Promise.resolve({
          processedCount: processed.length,
          totalMemoryUsed: largeArray.length * 100
        });
      });

      const result = await circuitBreaker.execute(memoryIntensiveOperation);
      expect(result.processedCount).toBe(50000);
      expect(result.totalMemoryUsed).toBe(10000000);
    });
  });

  describe('Error Type Edge Cases', () => {
    it('should handle different error types consistently', async () => {
      const errorTypes = [
        () => new Error('Standard Error'),
        () => new TypeError('Type Error'),
        () => new RangeError('Range Error'),
        () => new ReferenceError('Reference Error'),
        () => { 
          const custom = new Error('Custom Error');
          custom.name = 'CustomError';
          return custom;
        }
      ];

      let errorIndex = 0;
      mockOperation.mockImplementation(() => {
        const error = errorTypes[errorIndex % errorTypes.length]();
        errorIndex++;
        return Promise.reject(error);
      });

      // Test different error types
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(mockOperation).catch(err => {
          expect(err).toBeInstanceOf(Error);
        });
      }

      expect(circuitBreaker.getState().state).toBe('OPEN');
      expect(mockMonitor).toHaveBeenCalledWith('OPEN', expect.any(Error));
    });

    it('should handle null and undefined error values', async () => {
      mockOperation.mockImplementation(() => {
        // Simulate rejecting with non-Error values
        return Promise.reject(null);
      });

      await expect(circuitBreaker.execute(mockOperation)).rejects.toBeNull();
      expect(circuitBreaker.getState().failureCount).toBe(1);

      mockOperation.mockImplementation(() => Promise.reject(undefined));
      await expect(circuitBreaker.execute(mockOperation)).rejects.toBeUndefined();
      expect(circuitBreaker.getState().failureCount).toBe(2);
    });

    it('should handle error objects with circular references', async () => {
      mockOperation.mockImplementation(() => {
        const circularError = new Error('Circular reference error');
        (circularError as any).self = circularError;
        return Promise.reject(circularError);
      });

      await expect(circuitBreaker.execute(mockOperation))
        .rejects.toThrow('Circular reference error');

      expect(circuitBreaker.getState().failureCount).toBe(1);
      // Should not crash despite circular reference
      expect(() => circuitBreaker.getState()).not.toThrow();
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle extreme threshold values', async () => {
      const extremeThresholdCB = new CircuitBreaker('extreme-threshold', {
        threshold: 1, // Opens after single failure
        timeout: 100,
        monitor: mockMonitor
      });

      mockOperation.mockRejectedValue(new Error('single failure'));
      await extremeThresholdCB.execute(mockOperation).catch(() => {});

      expect(extremeThresholdCB.getState().state).toBe('OPEN');
      expect(mockMonitor).toHaveBeenCalledWith('OPEN', expect.any(Error));
    });

    it('should handle very short timeout values', async () => {
      jest.useFakeTimers();
      
      const shortTimeoutCB = new CircuitBreaker('short-timeout', {
        threshold: 2,
        timeout: 1, // 1ms timeout
        monitor: mockMonitor
      });

      // Open circuit
      mockOperation.mockRejectedValue(new Error('short timeout test'));
      await shortTimeoutCB.execute(mockOperation).catch(() => {});
      await shortTimeoutCB.execute(mockOperation).catch(() => {});

      expect(shortTimeoutCB.getState().state).toBe('OPEN');

      jest.advanceTimersByTime(2); // Wait 2ms

      mockOperation.mockResolvedValue('quick recovery');
      const result = await shortTimeoutCB.execute(mockOperation);
      expect(result).toBe('quick recovery');

      jest.useRealTimers();
    });

    it('should handle monitor callback that modifies circuit state', async () => {
      let monitorCallCount = 0;
      const statefulMonitor = jest.fn((state: CircuitState, error?: Error) => {
        monitorCallCount++;
        // Simulate monitor that tries to reset circuit (should not interfere)
        if (monitorCallCount === 1 && state === 'OPEN') {
          // Reset the monitored circuit breaker, not the global one
          monitoredCB.reset();
        }
      });

      const monitoredCB = new CircuitBreaker('stateful-monitor', {
        threshold: 2,
        timeout: 30000,
        monitor: statefulMonitor
      });

      mockOperation.mockRejectedValue(new Error('monitor state test'));
      await monitoredCB.execute(mockOperation).catch(() => {});
      await monitoredCB.execute(mockOperation).catch(() => {});

      expect(statefulMonitor).toHaveBeenCalledWith('OPEN', expect.any(Error));
      expect(monitoredCB.getState().state).toBe('CLOSED'); // Reset by monitor
    }, 1000); // Reduced timeout to 1 second
  });

  describe('Boundary Condition Tests', () => {
    it('should handle exactly threshold failures', async () => {
      mockOperation.mockRejectedValue(new Error('boundary failure'));

      // Fail exactly threshold times (3)
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(mockOperation).catch(() => {});
        if (i < 2) {
          expect(circuitBreaker.getState().state).toBe('CLOSED');
        }
      }

      expect(circuitBreaker.getState().state).toBe('OPEN');
      expect(circuitBreaker.getState().failureCount).toBe(3);
    });

    it('should handle exactly 3 successes needed for HALF_OPEN -> CLOSED', async () => {
      // Open circuit
      mockOperation.mockRejectedValue(new Error('boundary success test'));
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(mockOperation).catch(() => {});
      }

      jest.useFakeTimers();
      jest.advanceTimersByTime(60001);

      mockOperation.mockResolvedValue('boundary success');

      // Exactly 2 successes should not close circuit
      await circuitBreaker.execute(mockOperation);
      await circuitBreaker.execute(mockOperation);

      // 3rd success should close circuit
      await circuitBreaker.execute(mockOperation);

      expect(mockMonitor).toHaveBeenCalledWith('CLOSED');

      jest.useRealTimers();
    });

    it('should handle timeout exactly at boundary', async () => {
      jest.useFakeTimers();
      
      const boundaryOptions: CircuitBreakerOptions = {
        threshold: 1,
        timeout: 5000,
        monitor: mockMonitor
      };

      const boundaryCB = new CircuitBreaker('boundary-timeout', boundaryOptions);

      mockOperation.mockRejectedValue(new Error('boundary timeout'));
      await boundaryCB.execute(mockOperation).catch(() => {});

      const state = boundaryCB.getState();
      expect(state.state).toBe('OPEN');

      // Advance time by exactly the timeout duration
      jest.advanceTimersByTime(5000);

      mockOperation.mockResolvedValue('boundary recovery');
      const result = await boundaryCB.execute(mockOperation);
      expect(result).toBe('boundary recovery');

      jest.useRealTimers();
    });
  });

  describe('Resource Cleanup Edge Cases', () => {
    it('should handle cleanup when operations are still pending', async () => {
      let pendingResolvers: Array<(value: any) => void> = [];

      mockOperation.mockImplementation(() => {
        return new Promise((resolve) => {
          pendingResolvers.push(resolve);
        });
      });

      // Start multiple pending operations
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(circuitBreaker.execute(mockOperation));
      }

      // Reset circuit while operations are pending
      circuitBreaker.reset();

      // Complete pending operations
      pendingResolvers.forEach((resolve, index) => {
        resolve(`Cleanup result ${index + 1}`);
      });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      expect(circuitBreaker.getState().state).toBe('CLOSED');
      expect(circuitBreaker.getState().failureCount).toBe(0);
    });

    it('should handle multiple rapid state changes', async () => {
      jest.useFakeTimers();

      for (let cycle = 0; cycle < 5; cycle++) {
        // Open circuit
        mockOperation.mockRejectedValue(new Error(`Cycle ${cycle} failure`));
        for (let i = 0; i < 3; i++) {
          await circuitBreaker.execute(mockOperation).catch(() => {});
        }

        expect(circuitBreaker.getState().state).toBe('OPEN');

        // Reset and close
        circuitBreaker.reset();
        expect(circuitBreaker.getState().state).toBe('CLOSED');
      }

      jest.useRealTimers();
    });
  });
});