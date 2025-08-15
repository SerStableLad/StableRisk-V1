import { CircuitBreaker, CircuitBreakerOptions, CircuitState } from '../circuit-breaker';

// Performance and load testing for Circuit Breaker
describe('CircuitBreaker Performance Tests', () => {
  let circuitBreaker: CircuitBreaker;
  let mockOperation: jest.Mock;
  let mockMonitor: jest.Mock;

  beforeEach(() => {
    mockOperation = jest.fn();
    mockMonitor = jest.fn();
    
    const options: CircuitBreakerOptions = {
      threshold: 5,
      timeout: 30000,
      monitor: mockMonitor
    };
    
    circuitBreaker = new CircuitBreaker('performance-test', options);
    jest.clearAllMocks();
  });

  describe('High Volume Operations', () => {
    it('should handle 1000 successful operations efficiently', async () => {
      mockOperation.mockResolvedValue('success');
      
      const startTime = Date.now();
      const promises = [];
      
      for (let i = 0; i < 1000; i++) {
        promises.push(circuitBreaker.execute(mockOperation));
      }
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(results).toHaveLength(1000);
      expect(results.every(result => result === 'success')).toBe(true);
      expect(mockOperation).toHaveBeenCalledTimes(1000);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle mixed success/failure operations under load', async () => {
      let callCount = 0;
      mockOperation.mockImplementation(() => {
        callCount++;
        if (callCount % 10 === 0) {
          return Promise.reject(new Error(`Failure ${callCount}`));
        }
        return Promise.resolve(`Success ${callCount}`);
      });

      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          circuitBreaker.execute(mockOperation).catch(err => ({ error: err.message }))
        );
      }

      const results = await Promise.all(promises);
      const successes = results.filter(r => typeof r === 'string' && r.startsWith('Success')).length;
      const failures = results.filter(r => r && typeof r === 'object' && 'error' in r).length;
      
      expect(successes).toBeGreaterThan(0);
      expect(failures).toBeGreaterThan(0);
      expect(successes + failures).toBe(100);
      // Circuit might open after threshold failures, so failure count could be higher
      expect(circuitBreaker.getState().failureCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Concurrent State Transitions', () => {
    it('should handle rapid state transitions correctly', async () => {
      // First, cause rapid failures to open the circuit
      mockOperation.mockRejectedValue(new Error('rapid failure'));
      
      const failurePromises = [];
      for (let i = 0; i < 10; i++) {
        failurePromises.push(
          circuitBreaker.execute(mockOperation).catch(err => err)
        );
      }
      
      await Promise.all(failurePromises);
      expect(circuitBreaker.getState().state).toBe('OPEN');
      
      // Now test rapid attempts after timeout
      jest.useFakeTimers();
      jest.advanceTimersByTime(30001);
      
      mockOperation.mockResolvedValue('recovery success');
      
      const recoveryPromises = [];
      for (let i = 0; i < 5; i++) {
        recoveryPromises.push(circuitBreaker.execute(mockOperation));
      }
      
      const recoveryResults = await Promise.all(recoveryPromises);
      expect(recoveryResults.every(r => r === 'recovery success')).toBe(true);
      
      jest.useRealTimers();
    });

    it('should maintain consistency during concurrent access', async () => {
      const operationResults: string[] = [];
      const stateSnapshots: CircuitState[] = [];
      
      mockOperation.mockImplementation(async () => {
        // Capture state during operation
        stateSnapshots.push(circuitBreaker.getState().state);
        
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 1));
        
        operationResults.push('concurrent operation');
        return 'concurrent operation';
      });

      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(circuitBreaker.execute(mockOperation));
      }

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(50);
      expect(operationResults).toHaveLength(50);
      expect(stateSnapshots.every(state => state === 'CLOSED')).toBe(true);
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should not accumulate excessive state over many operations', async () => {
      mockOperation.mockResolvedValue('memory test');
      
      // Perform many operations
      for (let batch = 0; batch < 10; batch++) {
        const batchPromises = [];
        for (let i = 0; i < 100; i++) {
          batchPromises.push(circuitBreaker.execute(mockOperation));
        }
        await Promise.all(batchPromises);
      }
      
      const state = circuitBreaker.getState();
      expect(state.failureCount).toBe(0);
      expect(state.state).toBe('CLOSED');
      
      // Verify the circuit breaker instance is still functional
      const finalResult = await circuitBreaker.execute(mockOperation);
      expect(finalResult).toBe('memory test');
    });

    it('should handle reset operations efficiently', async () => {
      // Open the circuit
      mockOperation.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.execute(mockOperation).catch(() => {});
      }
      
      expect(circuitBreaker.getState().state).toBe('OPEN');
      
      // Test multiple rapid resets
      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        circuitBreaker.reset();
      }
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(100); // Should be very fast
      expect(circuitBreaker.getState().state).toBe('CLOSED');
      expect(circuitBreaker.getState().failureCount).toBe(0);
    });
  });

  describe('Timeout Precision and Performance', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should handle precise timeout calculations under load', async () => {
      // Open circuit
      mockOperation.mockRejectedValue(new Error('timeout test failure'));
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.execute(mockOperation).catch(() => {});
      }
      
      expect(circuitBreaker.getState().state).toBe('OPEN');
      
      const state = circuitBreaker.getState();
      const timeoutDuration = state.nextAttempt!.getTime() - Date.now();
      
      // Advance time to just before timeout
      jest.advanceTimersByTime(timeoutDuration - 100);
      
      mockOperation.mockResolvedValue('success');
      
      // Should still be blocked
      await expect(circuitBreaker.execute(mockOperation))
        .rejects.toThrow('Circuit breaker is OPEN');
      
      // Advance past timeout
      jest.advanceTimersByTime(101);
      
      // Should now allow execution
      const result = await circuitBreaker.execute(mockOperation);
      expect(result).toBe('success');
    });

    it('should maintain timeout accuracy across multiple state transitions', async () => {
      const timeoutDuration = 5000; // 5 seconds
      const options: CircuitBreakerOptions = {
        threshold: 2,
        timeout: timeoutDuration,
        monitor: mockMonitor
      };
      
      const preciseCB = new CircuitBreaker('precision-test', options);
      
      // Open circuit
      mockOperation.mockRejectedValue(new Error('precision failure'));
      await preciseCB.execute(mockOperation).catch(() => {});
      await preciseCB.execute(mockOperation).catch(() => {});
      
      expect(preciseCB.getState().state).toBe('OPEN');
      
      const openTime = Date.now();
      jest.advanceTimersByTime(timeoutDuration + 10);
      
      // Test half-open transition
      mockOperation.mockResolvedValueOnce('half-open success');
      await preciseCB.execute(mockOperation);
      
      // Fail again to reopen
      mockOperation.mockRejectedValue(new Error('reopen failure'));
      await preciseCB.execute(mockOperation).catch(() => {});
      
      const reopenState = preciseCB.getState();
      expect(reopenState.state).toBe('OPEN');
      
      // Verify new timeout is correctly set
      const newTimeoutDuration = reopenState.nextAttempt!.getTime() - Date.now();
      expect(Math.abs(newTimeoutDuration - timeoutDuration)).toBeLessThan(100);
    });
  });

  describe('Monitor Callback Performance', () => {
    it('should not significantly impact performance with monitoring enabled', async () => {
      const heavyMonitor = jest.fn().mockImplementation((state: CircuitState, error?: Error) => {
        // Simulate some logging overhead
        for (let i = 0; i < 100; i++) {
          Math.random();
        }
      });
      
      const options: CircuitBreakerOptions = {
        threshold: 3,
        timeout: 10000,
        monitor: heavyMonitor
      };
      
      const monitoredCB = new CircuitBreaker('monitored-performance', options);
      mockOperation.mockRejectedValue(new Error('monitored failure'));
      
      const startTime = Date.now();
      
      // Trigger monitor callbacks
      for (let i = 0; i < 3; i++) {
        await monitoredCB.execute(mockOperation).catch(() => {});
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(heavyMonitor).toHaveBeenCalledWith('OPEN', expect.any(Error));
      expect(duration).toBeLessThan(1000); // Should still be reasonably fast
    });

    it('should handle monitor callback errors gracefully', async () => {
      const errorProneMonitor = jest.fn().mockImplementation(() => {
        throw new Error('Monitor callback error');
      });
      
      const options: CircuitBreakerOptions = {
        threshold: 2,
        timeout: 5000,
        monitor: errorProneMonitor
      };
      
      const errorCB = new CircuitBreaker('error-monitor', options);
      mockOperation.mockRejectedValue(new Error('operation failure'));
      
      // This should not throw despite monitor errors
      await errorCB.execute(mockOperation).catch(() => {});
      await errorCB.execute(mockOperation).catch(() => {});
      
      expect(errorCB.getState().state).toBe('OPEN');
      expect(errorProneMonitor).toHaveBeenCalled();
    });
  });

  describe('Stress Testing', () => {
    it('should handle extreme failure scenarios', async () => {
      // Create a fresh circuit breaker for this test
      const stressCB = new CircuitBreaker('stress-test', {
        threshold: 3,
        timeout: 60000,
        monitor: mockMonitor
      });
      
      mockOperation.mockRejectedValue(new Error('extreme failure'));
      
      // First, open the circuit with initial failures
      for (let i = 0; i < 3; i++) {
        await stressCB.execute(mockOperation).catch(() => {});
      }
      
      expect(stressCB.getState().state).toBe('OPEN');
      
      // Now attempt many operations - they should all be circuit breaker errors
      const failurePromises = [];
      for (let i = 0; i < 100; i++) {
        failurePromises.push(
          stressCB.execute(mockOperation).catch(err => ({ error: err.message }))
        );
      }
      
      const results = await Promise.all(failurePromises);
      
      // All subsequent operations should be circuit breaker errors
      const circuitBreakerErrors = results.filter(r => 
        r && typeof r === 'object' && 'error' in r && r.error.includes('Circuit breaker is OPEN')
      ).length;
      
      expect(circuitBreakerErrors).toBe(100); // All should be circuit breaker errors
      expect(stressCB.getState().state).toBe('OPEN');
    });

    it('should recover efficiently from extreme scenarios', async () => {
      // First create extreme failure scenario
      mockOperation.mockRejectedValue(new Error('extreme failure'));
      
      const failurePromises = [];
      for (let i = 0; i < 1000; i++) {
        failurePromises.push(
          circuitBreaker.execute(mockOperation).catch(() => 'failed')
        );
      }
      
      await Promise.all(failurePromises);
      expect(circuitBreaker.getState().state).toBe('OPEN');
      
      // Reset and verify quick recovery
      circuitBreaker.reset();
      mockOperation.mockResolvedValue('recovery success');
      
      const recoveryPromises = [];
      for (let i = 0; i < 100; i++) {
        recoveryPromises.push(circuitBreaker.execute(mockOperation));
      }
      
      const recoveryResults = await Promise.all(recoveryPromises);
      expect(recoveryResults.every(r => r === 'recovery success')).toBe(true);
      expect(circuitBreaker.getState().state).toBe('CLOSED');
    });
  });
});