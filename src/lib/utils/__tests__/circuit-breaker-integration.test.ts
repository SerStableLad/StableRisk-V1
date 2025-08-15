import { CircuitBreaker, CircuitBreakerOptions, CircuitState } from '../circuit-breaker';

// Integration tests for Circuit Breaker with monitoring, logging, and real-world scenarios
describe('CircuitBreaker Integration Tests', () => {
  let circuitBreaker: CircuitBreaker;
  let mockOperation: jest.Mock;
  let monitoringData: Array<{ state: CircuitState; error?: Error; timestamp: Date }>;

  const createMonitoringCallback = () => {
    return jest.fn((state: CircuitState, error?: Error) => {
      monitoringData.push({
        state,
        error,
        timestamp: new Date()
      });
    });
  };

  beforeEach(() => {
    mockOperation = jest.fn();
    monitoringData = [];
    
    const options: CircuitBreakerOptions = {
      threshold: 3,
      timeout: 60000,
      monitor: createMonitoringCallback()
    };
    
    circuitBreaker = new CircuitBreaker('integration-test', options);
    jest.clearAllMocks();
  });

  describe('Real-world Service Simulation', () => {
    it('should handle API service failures and recovery', async () => {
      // Simulate API service that fails intermittently
      let callCount = 0;
      mockOperation.mockImplementation(() => {
        callCount++;
        
        // First 3 calls fail (network issues)
        if (callCount <= 3) {
          return Promise.reject(new Error(`Network timeout ${callCount}`));
        }
        
        // API recovers
        if (callCount <= 6) {
          return Promise.resolve({ 
            data: `API response ${callCount}`, 
            status: 'success',
            timestamp: new Date().toISOString()
          });
        }
        
        // Service degrades again
        return Promise.reject(new Error('Service overloaded'));
      });

      // Initial failures should open circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation))
          .rejects.toThrow(`Network timeout ${i + 1}`);
      }

      expect(circuitBreaker.getState().state).toBe('OPEN');
      expect(monitoringData).toHaveLength(1);
      expect(monitoringData[0].state).toBe('OPEN');

      // Circuit should block further calls
      await expect(circuitBreaker.execute(mockOperation))
        .rejects.toThrow('Circuit breaker is OPEN');

      // Advance time to allow recovery attempt
      jest.useFakeTimers();
      jest.advanceTimersByTime(60001);

      // Service should recover through HALF_OPEN
      const result1 = await circuitBreaker.execute(mockOperation);
      expect(result1).toEqual({
        data: 'API response 4',
        status: 'success',
        timestamp: expect.any(String)
      });

      // Continue recovery with more successes
      await circuitBreaker.execute(mockOperation);
      await circuitBreaker.execute(mockOperation);

      expect(circuitBreaker.getState().state).toBe('CLOSED');
      expect(monitoringData).toHaveLength(2);
      expect(monitoringData[1].state).toBe('CLOSED');

      jest.useRealTimers();
    });

    it('should handle database connection failures', async () => {
      // Simulate database connection that times out
      mockOperation.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Database connection timeout'));
          }, 1000);
        });
      });

      // Test multiple concurrent database calls
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          circuitBreaker.execute(mockOperation).catch(err => ({
            error: err.message,
            callIndex: i
          }))
        );
      }

      const results = await Promise.all(promises);
      
      // All should fail with timeout or circuit breaker
      expect(results.every(r => 'error' in r)).toBe(true);
      
      // Circuit should be open after threshold failures
      expect(circuitBreaker.getState().state).toBe('OPEN');
      expect(monitoringData.length).toBeGreaterThanOrEqual(1);
      expect(monitoringData[0].error?.message).toContain('Database connection timeout');
    });
  });

  describe('Monitoring and Observability', () => {
    it('should provide comprehensive monitoring data', async () => {
      const detailedMonitor = jest.fn((state: CircuitState, error?: Error) => {
        const monitoringEntry = {
          timestamp: new Date().toISOString(),
          circuitName: 'integration-test',
          state,
          error: error ? {
            message: error.message,
            name: error.name,
            stack: error.stack
          } : undefined
        };
        monitoringData.push(monitoringEntry);
      });

      const monitoredCB = new CircuitBreaker('monitored-service', {
        threshold: 2,
        timeout: 30000,
        monitor: detailedMonitor
      });

      // Trigger state transitions
      mockOperation.mockRejectedValueOnce(new Error('First failure'));
      mockOperation.mockRejectedValueOnce(new Error('Second failure - opens circuit'));

      await monitoredCB.execute(mockOperation).catch(() => {});
      await monitoredCB.execute(mockOperation).catch(() => {});

      expect(detailedMonitor).toHaveBeenCalledWith('OPEN', expect.any(Error));
      expect(monitoringData).toHaveLength(1);
      expect(monitoringData[0]).toHaveProperty('timestamp');
      expect(monitoringData[0]).toHaveProperty('error');
      expect(monitoringData[0].error).toHaveProperty('message');
      expect(monitoringData[0].error).toHaveProperty('name');
    });

    it('should integrate with external monitoring systems', async () => {
      const externalMetrics: Array<{
        metric: string;
        value: number;
        tags: Record<string, string>;
        timestamp: Date;
      }> = [];

      const metricsCollector = (state: CircuitState, error?: Error) => {
        externalMetrics.push({
          metric: 'circuit_breaker.state_change',
          value: state === 'OPEN' ? 1 : 0,
          tags: {
            circuit_name: 'integration-test',
            new_state: state,
            error_type: error?.name || 'none'
          },
          timestamp: new Date()
        });
      };

      const metricsCB = new CircuitBreaker('metrics-service', {
        threshold: 2,
        timeout: 15000,
        monitor: metricsCollector
      });

      // Generate state transitions
      mockOperation.mockRejectedValue(new Error('ServiceUnavailable'));
      
      await metricsCB.execute(mockOperation).catch(() => {});
      await metricsCB.execute(mockOperation).catch(() => {});

      expect(externalMetrics).toHaveLength(1);
      expect(externalMetrics[0]).toEqual({
        metric: 'circuit_breaker.state_change',
        value: 1,
        tags: {
          circuit_name: 'integration-test',
          new_state: 'OPEN',
          error_type: 'Error'
        },
        timestamp: expect.any(Date)
      });

      // Simulate recovery
      jest.useFakeTimers();
      jest.advanceTimersByTime(15001);

      mockOperation.mockResolvedValue('service recovered');
      await metricsCB.execute(mockOperation);
      await metricsCB.execute(mockOperation);
      await metricsCB.execute(mockOperation);

      expect(externalMetrics).toHaveLength(2);
      expect(externalMetrics[1].tags.new_state).toBe('CLOSED');

      jest.useRealTimers();
    });

    it('should support custom monitoring context', async () => {
      const contextualMonitor = jest.fn((state: CircuitState, error?: Error) => {
        const context = {
          serviceName: 'payment-service',
          environment: 'production',
          region: 'us-east-1',
          version: '1.2.3'
        };

        monitoringData.push({
          state,
          error,
          context,
          timestamp: new Date()
        });
      });

      const contextualCB = new CircuitBreaker('payment-service', {
        threshold: 3,
        timeout: 45000,
        monitor: contextualMonitor
      });

      mockOperation.mockRejectedValue(new Error('Payment gateway timeout'));

      for (let i = 0; i < 3; i++) {
        await contextualCB.execute(mockOperation).catch(() => {});
      }

      expect(contextualMonitor).toHaveBeenCalledWith('OPEN', expect.any(Error));
      expect(monitoringData).toHaveLength(1);
      expect(monitoringData[0]).toHaveProperty('context');
      expect(monitoringData[0].context).toEqual({
        serviceName: 'payment-service',
        environment: 'production',
        region: 'us-east-1',
        version: '1.2.3'
      });
    });
  });

  describe('State Management Integration', () => {
    it('should maintain state consistency across multiple circuit breakers', () => {
      const cb1 = new CircuitBreaker('service-1', {
        threshold: 2,
        timeout: 30000,
        monitor: createMonitoringCallback()
      });

      const cb2 = new CircuitBreaker('service-2', {
        threshold: 3,
        timeout: 45000,
        monitor: createMonitoringCallback()
      });

      // Each circuit breaker should maintain independent state
      expect(cb1.getState().state).toBe('CLOSED');
      expect(cb2.getState().state).toBe('CLOSED');

      // Resetting one should not affect the other
      cb1.reset();
      expect(cb1.getState().state).toBe('CLOSED');
      expect(cb2.getState().state).toBe('CLOSED');

      // State changes should be independent
      cb1['state'] = 'OPEN'; // Direct state manipulation for testing
      expect(cb1.getState().state).toBe('OPEN');
      expect(cb2.getState().state).toBe('CLOSED');
    });

    it('should provide consistent state snapshots', async () => {
      const stateSnapshots: Array<{
        state: CircuitState;
        failureCount: number;
        nextAttempt?: Date;
        timestamp: Date;
      }> = [];

      const stateCapture = () => {
        const state = circuitBreaker.getState();
        stateSnapshots.push({
          ...state,
          timestamp: new Date()
        });
      };

      mockOperation.mockRejectedValue(new Error('state test failure'));

      // Capture states during failures
      for (let i = 0; i < 3; i++) {
        stateCapture();
        await circuitBreaker.execute(mockOperation).catch(() => {});
      }
      stateCapture();

      expect(stateSnapshots).toHaveLength(4);
      
      // First three should be CLOSED with increasing failure counts
      expect(stateSnapshots[0]).toMatchObject({ state: 'CLOSED', failureCount: 0 });
      expect(stateSnapshots[1]).toMatchObject({ state: 'CLOSED', failureCount: 1 });
      expect(stateSnapshots[2]).toMatchObject({ state: 'CLOSED', failureCount: 2 });
      
      // Last should be OPEN
      expect(stateSnapshots[3]).toMatchObject({ 
        state: 'OPEN', 
        failureCount: 3 
      });
      expect(stateSnapshots[3].nextAttempt).toBeDefined();
    });

    it('should handle state transitions in complex scenarios', async () => {
      const transitionLog: Array<{
        from: CircuitState;
        to: CircuitState;
        trigger: string;
        timestamp: Date;
      }> = [];

      let previousState: CircuitState = 'CLOSED';
      
      const transitionTracker = (state: CircuitState, error?: Error) => {
        transitionLog.push({
          from: previousState,
          to: state,
          trigger: error ? 'failure' : 'success',
          timestamp: new Date()
        });
        previousState = state;
      };

      const transitionCB = new CircuitBreaker('transition-tracker', {
        threshold: 2,
        timeout: 10000,
        monitor: transitionTracker
      });

      // CLOSED -> OPEN transition
      mockOperation.mockRejectedValue(new Error('transition failure'));
      await transitionCB.execute(mockOperation).catch(() => {});
      await transitionCB.execute(mockOperation).catch(() => {});

      jest.useFakeTimers();
      jest.advanceTimersByTime(10001);

      // OPEN -> HALF_OPEN -> CLOSED transition
      mockOperation.mockResolvedValue('recovery');
      await transitionCB.execute(mockOperation); // 1st success
      await transitionCB.execute(mockOperation); // 2nd success
      await transitionCB.execute(mockOperation); // 3rd success - closes circuit

      expect(transitionLog).toHaveLength(2);
      expect(transitionLog[0]).toMatchObject({
        from: 'CLOSED',
        to: 'OPEN',
        trigger: 'failure'
      });
      expect(transitionLog[1]).toMatchObject({
        from: 'OPEN', // Note: internal HALF_OPEN state isn't exposed
        to: 'CLOSED',
        trigger: 'success'
      });

      jest.useRealTimers();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle complex error scenarios with proper monitoring', async () => {
      const errorTypes = [
        'NetworkError',
        'TimeoutError',
        'ServiceUnavailableError',
        'DatabaseConnectionError'
      ];

      let errorIndex = 0;
      mockOperation.mockImplementation(() => {
        const ErrorClass = class extends Error {
          name = errorTypes[errorIndex % errorTypes.length];
        };
        const error = new ErrorClass(`${errorTypes[errorIndex % errorTypes.length]} occurred`);
        errorIndex++;
        return Promise.reject(error);
      });

      const errorMonitor = jest.fn((state: CircuitState, error?: Error) => {
        monitoringData.push({
          state,
          error: {
            name: error?.name,
            message: error?.message,
            type: error?.constructor.name
          },
          timestamp: new Date()
        });
      });

      const errorCB = new CircuitBreaker('error-service', {
        threshold: 4,
        timeout: 20000,
        monitor: errorMonitor
      });

      // Generate various error types
      for (let i = 0; i < 4; i++) {
        await errorCB.execute(mockOperation).catch(() => {});
      }

      expect(errorMonitor).toHaveBeenCalledTimes(1);
      expect(errorCB.getState().state).toBe('OPEN');
      
      // Verify different error types were captured
      const capturedErrors = monitoringData[0].error;
      expect(capturedErrors).toBeDefined();
      expect(errorTypes.includes(capturedErrors.name)).toBe(true);
    });

    it('should maintain functionality when monitor throws errors', async () => {
      let monitorCallCount = 0;
      const faultyMonitor = jest.fn((state: CircuitState, error?: Error) => {
        monitorCallCount++;
        if (monitorCallCount === 1) {
          throw new Error('Monitor system failure');
        }
        monitoringData.push({ state, error, timestamp: new Date() });
      });

      const faultyCB = new CircuitBreaker('faulty-monitor', {
        threshold: 2,
        timeout: 15000,
        monitor: faultyMonitor
      });

      mockOperation.mockRejectedValue(new Error('service failure'));

      // First failure should trigger faulty monitor
      await faultyCB.execute(mockOperation).catch(() => {});
      await faultyCB.execute(mockOperation).catch(() => {});

      // Circuit breaker should still function despite monitor errors
      expect(faultyCB.getState().state).toBe('OPEN');
      expect(faultyMonitor).toHaveBeenCalledTimes(1);
      
      // Should not crash the application
      expect(() => faultyCB.getState()).not.toThrow();
    });
  });

  describe('Configuration Validation', () => {
    it('should work with minimal configuration', () => {
      const minimalCB = new CircuitBreaker('minimal', {
        threshold: 1,
        timeout: 1000
      });

      expect(minimalCB.getState()).toEqual({
        state: 'CLOSED',
        failureCount: 0,
        nextAttempt: undefined
      });
    });

    it('should handle edge case configurations', () => {
      const edgeCaseCB = new CircuitBreaker('edge-case', {
        threshold: 1, // Very low threshold
        timeout: 1, // Very short timeout
        monitor: () => {} // No-op monitor
      });

      expect(edgeCaseCB.getState().state).toBe('CLOSED');
    });

    it('should validate configuration boundaries', () => {
      // Test with maximum reasonable values
      const maxConfigCB = new CircuitBreaker('max-config', {
        threshold: 100,
        timeout: 300000, // 5 minutes
        monitor: (state, error) => {
          // Complex monitoring logic
          console.log(`Circuit ${state}`, error?.message);
        }
      });

      expect(maxConfigCB.getState().state).toBe('CLOSED');
    });
  });
});