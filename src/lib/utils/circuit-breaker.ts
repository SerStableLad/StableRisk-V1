/**
 * Circuit Breaker Pattern Implementation
 * 
 * Implements the Circuit Breaker pattern to handle failures gracefully and prevent 
 * cascade failures in distributed systems. Supports three states:
 * - CLOSED: Normal operation, calls are allowed
 * - OPEN: Failure threshold reached, calls are blocked
 * - HALF_OPEN: Testing phase, limited calls allowed to check recovery
 */

export interface CircuitBreakerOptions {
  threshold: number; // Number of failures before opening
  timeout: number; // Time to wait before trying again (ms)
  monitor?: (state: CircuitState, error?: Error) => void;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  nextAttempt?: Date;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private nextAttempt = Date.now();
  private successCount = 0; // Used for HALF_OPEN state tracking

  constructor(
    private name: string,
    private options: CircuitBreakerOptions
  ) {}

  /**
   * Executes an operation through the circuit breaker
   * @param operation - The async operation to execute
   * @returns Promise with the operation result
   * @throws Error if circuit is OPEN or operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      }
      // Try to close the circuit - transition to HALF_OPEN
      this.state = 'HALF_OPEN';
      this.successCount = 0;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Handles successful operation execution
   */
  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) { // Need 3 successes to close
        this.state = 'CLOSED';
        this.notifyMonitor(this.state, undefined);
      }
    }
  }

  /**
   * Handles failed operation execution
   * @param error - The error that occurred
   */
  private onFailure(error: Error): void {
    // If we're in HALF_OPEN state, any failure should reopen the circuit immediately
    if (this.state === 'HALF_OPEN') {
      this.failureCount++;
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.options.timeout;
      this.notifyMonitor(this.state, error);
      return;
    }
    
    // For CLOSED state, increment failure count
    this.failureCount++;
    
    if (this.failureCount >= this.options.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.options.timeout;
      this.notifyMonitor(this.state, error);
    }
  }

  /**
   * Gets the current state of the circuit breaker
   * @returns Current state information
   */
  getState(): CircuitBreakerState {
    return {
      state: this.state,
      failureCount: this.failureCount,
      nextAttempt: this.state === 'OPEN' ? new Date(this.nextAttempt) : undefined
    };
  }

  /**
   * Resets the circuit breaker to CLOSED state
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
  }

  /**
   * Notifies the monitor callback of state changes
   * @param state - New circuit state
   * @param error - Optional error that caused the state change
   */
  private notifyMonitor(state: CircuitState, error?: Error): void {
    try {
      if (state === 'OPEN') {
        this.options.monitor?.(state, error);
      } else {
        this.options.monitor?.(state);
      }
    } catch (monitorError) {
      // Monitor errors should not affect circuit breaker operation
      console.error(`Circuit breaker monitor error for ${this.name}:`, monitorError);
    }
  }
}