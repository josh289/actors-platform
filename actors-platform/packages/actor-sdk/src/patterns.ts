import { Event, CircuitBreakerConfig, RetryConfig } from './types';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime?: number;
  private successCount = 0;
  
  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitBreakerState.HALF_OPEN;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.threshold) {
        this.state = CircuitBreakerState.CLOSED;
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.failureCount >= this.config.threshold) {
      this.state = CircuitBreakerState.OPEN;
    }
  }

  private shouldAttemptReset(): boolean {
    return (
      this.lastFailureTime !== undefined &&
      Date.now() - this.lastFailureTime >= this.config.resetTimeout
    );
  }

  getState(): CircuitBreakerState {
    return this.state;
  }
}

export class RetryPolicy {
  constructor(private config: RetryConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    let delay = this.config.initialDelay;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.maxRetries) {
          await this.sleep(delay);
          delay = Math.min(
            delay * this.config.backoffMultiplier,
            this.config.maxDelay
          );
        }
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private maxTokens: number,
    private refillRate: number,
    private refillInterval: number
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(tokens: number = 1): Promise<void> {
    this.refill();

    if (this.tokens < tokens) {
      const waitTime = this.calculateWaitTime(tokens);
      await this.sleep(waitTime);
      this.refill();
    }

    this.tokens -= tokens;
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor(timePassed / this.refillInterval) * this.refillRate;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.tokens + tokensToAdd, this.maxTokens);
      this.lastRefill = now;
    }
  }

  private calculateWaitTime(requiredTokens: number): number {
    const tokensNeeded = requiredTokens - this.tokens;
    const intervalsToWait = Math.ceil(tokensNeeded / this.refillRate);
    return intervalsToWait * this.refillInterval;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

export class Saga {
  private steps: SagaStep[] = [];
  private compensations: CompensationStep[] = [];

  addStep(
    name: string,
    action: () => Promise<any>,
    compensation?: () => Promise<void>
  ): Saga {
    this.steps.push({ name, action });
    
    if (compensation) {
      this.compensations.unshift({ name, compensation });
    }

    return this;
  }

  async execute(): Promise<SagaResult> {
    const executedSteps: string[] = [];
    
    try {
      for (const step of this.steps) {
        await step.action();
        executedSteps.push(step.name);
      }

      return {
        success: true,
        executedSteps,
      };
    } catch (error) {
      // Execute compensations for completed steps
      for (const compensation of this.compensations) {
        if (executedSteps.includes(compensation.name)) {
          try {
            await compensation.compensation();
          } catch (compensationError) {
            console.error(
              `Compensation failed for step ${compensation.name}:`,
              compensationError
            );
          }
        }
      }

      return {
        success: false,
        executedSteps,
        error: error as Error,
      };
    }
  }
}

interface SagaStep {
  name: string;
  action: () => Promise<any>;
}

interface CompensationStep {
  name: string;
  compensation: () => Promise<void>;
}

interface SagaResult {
  success: boolean;
  executedSteps: string[];
  error?: Error;
}

export class MessageDeduplicator {
  private processedMessages: Set<string>;
  private maxSize: number;

  constructor(maxSize: number = 10000) {
    this.processedMessages = new Set();
    this.maxSize = maxSize;
  }

  isDuplicate(messageId: string): boolean {
    if (this.processedMessages.has(messageId)) {
      return true;
    }

    this.processedMessages.add(messageId);

    // Implement simple FIFO eviction
    if (this.processedMessages.size > this.maxSize) {
      const firstKey = this.processedMessages.values().next().value;
      this.processedMessages.delete(firstKey);
    }

    return false;
  }

  clear(): void {
    this.processedMessages.clear();
  }
}