import { logger } from './logger';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  timeout: number;
  resetTimeout: number;
  monitoringInterval?: number;
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime?: number;
  private successCount = 0;
  private requestCount = 0;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {
    if (config.monitoringInterval) {
      setInterval(() => this.logMetrics(), config.monitoringInterval);
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        logger.info(`Circuit breaker ${this.name} attempting reset (HALF_OPEN)`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    this.requestCount++;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), this.config.timeout);
      });

      const result = await Promise.race([fn(), timeoutPromise]);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.successCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      logger.info(`Circuit breaker ${this.name} closed after successful recovery`);
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      logger.error(`Circuit breaker ${this.name} opened after ${this.failureCount} failures`);
    }
  }

  private shouldAttemptReset(): boolean {
    return (
      this.lastFailureTime !== undefined &&
      Date.now() - this.lastFailureTime >= this.config.resetTimeout
    );
  }

  private logMetrics(): void {
    const metrics = {
      state: this.state,
      requestCount: this.requestCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      successRate: this.requestCount > 0 ? this.successCount / this.requestCount : 0
    };
    
    logger.info(`Circuit breaker ${this.name} metrics`, metrics);
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      requestCount: this.requestCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      successRate: this.requestCount > 0 ? this.successCount / this.requestCount : 0
    };
  }
}