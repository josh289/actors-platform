/**
 * Circuit Breaker pattern implementation for fault tolerance
 */
export class CircuitBreaker {
  private name: string;
  private failureThreshold: number;
  private resetTimeout: number;
  private halfOpenRequests: number;
  
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: Date;
  private nextAttempt?: Date;
  private halfOpenAttempts: number = 0;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.halfOpenRequests = options.halfOpenRequests || 3;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.nextAttempt && new Date() < this.nextAttempt) {
        throw new CircuitBreakerError(`Circuit breaker '${this.name}' is OPEN`, this.name);
      }
      // Try half-open
      this.state = 'half-open';
      this.halfOpenAttempts = 0;
    }

    if (this.state === 'half-open' && this.halfOpenAttempts >= this.halfOpenRequests) {
      // Too many half-open attempts, go back to open
      this.open();
      throw new CircuitBreakerError(`Circuit breaker '${this.name}' is OPEN`, this.name);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.successCount++;
    
    if (this.state === 'half-open') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.halfOpenRequests) {
        // Enough successful requests, close the circuit
        this.state = 'closed';
        this.halfOpenAttempts = 0;
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = new Date();
    
    if (this.state === 'half-open') {
      // Failed in half-open, go back to open
      this.open();
    } else if (this.failures >= this.failureThreshold) {
      this.open();
    }
  }

  private open(): void {
    this.state = 'open';
    this.nextAttempt = new Date(Date.now() + this.resetTimeout);
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = undefined;
    this.nextAttempt = undefined;
  }

  getStatus(): CircuitBreakerStatus {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt,
      halfOpenAttempts: this.halfOpenAttempts,
    };
  }

  isOpen(): boolean {
    return this.state === 'open';
  }

  isClosed(): boolean {
    return this.state === 'closed';
  }

  isHalfOpen(): boolean {
    return this.state === 'half-open';
  }
}

export class CircuitBreakerError extends Error {
  constructor(message: string, public circuitName: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

// Type definitions
export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenRequests?: number;
}

export interface CircuitBreakerStatus {
  name: string;
  state: CircuitState;
  failures: number;
  successCount: number;
  lastFailureTime?: Date;
  nextAttempt?: Date;
  halfOpenAttempts: number;
}

export type CircuitState = 'closed' | 'open' | 'half-open';