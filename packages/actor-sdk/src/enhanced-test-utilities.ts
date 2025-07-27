import { Command, Query, Event, ActorResult, QueryResult } from './types';
import { EnhancedActor } from './enhanced-actor';

/**
 * Enhanced Test Utilities for AI-Friendly Testing
 * 
 * Features:
 * 1. Automatic test data generation
 * 2. State snapshots and time travel
 * 3. Error injection for testing error paths
 * 4. Performance profiling
 * 5. Test scenario recording and replay
 */
export class EnhancedTestUtilities<TState = any> {
  private actor: EnhancedActor<TState>;
  private stateSnapshots: Map<string, TState> = new Map();
  private mockTime: number = Date.now();
  private recordedScenarios: Map<string, TestScenario> = new Map();
  private performanceMetrics: Map<string, PerformanceMetric[]> = new Map();
  
  constructor(actor: EnhancedActor<TState>) {
    this.actor = actor;
  }

  /**
   * Create mock command with proper structure
   */
  createMockCommand(type: string, payload: any, metadata?: any): Command {
    return {
      type,
      payload,
      metadata: {
        correlationId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: this.mockTime,
        source: 'test',
        userId: 'test-user',
        ...metadata,
      },
    };
  }

  /**
   * Create mock query with proper structure
   */
  createMockQuery(type: string, payload: any, metadata?: any): Query {
    return {
      type,
      payload,
      metadata: {
        correlationId: `test-query-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: this.mockTime,
        ...metadata,
      },
    };
  }

  /**
   * Generate test data based on type
   */
  generateTestData(dataType: string, options?: any): any {
    const generators: Record<string, (options?: any) => any> = {
      user: (opts) => ({
        id: opts?.id || `user-${this.generateId()}`,
        email: opts?.email || `test-${this.generateId()}@example.com`,
        name: opts?.name || `Test User ${this.generateId()}`,
        createdAt: new Date(this.mockTime),
        updatedAt: new Date(this.mockTime),
      }),
      
      session: (opts) => ({
        id: opts?.id || `session-${this.generateId()}`,
        userId: opts?.userId || `user-${this.generateId()}`,
        token: opts?.token || this.generateToken(),
        expiresAt: new Date(this.mockTime + 3600000), // 1 hour
        createdAt: new Date(this.mockTime),
      }),
      
      email: () => `test-${this.generateId()}@example.com`,
      
      uuid: () => this.generateId(),
      
      token: () => this.generateToken(),
      
      timestamp: () => this.mockTime,
      
      date: (opts) => new Date(opts?.offset ? this.mockTime + opts.offset : this.mockTime),
    };

    const generator = generators[dataType];
    if (!generator) {
      throw new Error(`Unknown test data type: ${dataType}. Available types: ${Object.keys(generators).join(', ')}`);
    }

    return generator(options);
  }

  /**
   * Take a snapshot of current state
   */
  snapshotState(name: string): void {
    const state = (this.actor as any).state;
    // Deep clone the state
    this.stateSnapshots.set(name, this.deepClone(state));
  }

  /**
   * Restore state from snapshot
   */
  restoreState(name: string): void {
    const snapshot = this.stateSnapshots.get(name);
    if (!snapshot) {
      throw new Error(`No snapshot found with name: ${name}. Available snapshots: ${Array.from(this.stateSnapshots.keys()).join(', ')}`);
    }
    (this.actor as any).state = this.deepClone(snapshot);
  }

  /**
   * List available snapshots
   */
  listSnapshots(): string[] {
    return Array.from(this.stateSnapshots.keys());
  }

  /**
   * Clear all snapshots
   */
  clearSnapshots(): void {
    this.stateSnapshots.clear();
  }

  /**
   * Advance mock time
   */
  advanceTime(ms: number): void {
    this.mockTime += ms;
    // Also update Date.now if possible
    if (typeof jest !== 'undefined' && jest.fn) {
      jest.advanceTimersByTime(ms);
    }
  }

  /**
   * Set mock time to specific value
   */
  setMockTime(timestamp: number): void {
    this.mockTime = timestamp;
  }

  /**
   * Get current mock time
   */
  getMockTime(): number {
    return this.mockTime;
  }

  /**
   * Inject error for next operation
   */
  async injectError(errorConfig: ErrorInjectionConfig): Promise<void> {
    const { operation, errorType, message, code } = errorConfig;
    
    // Store original method
    const originalMethod = (this.actor as any)[operation];
    
    // Replace with error-throwing version
    (this.actor as any)[operation] = async (...args: any[]) => {
      // Restore original method immediately
      (this.actor as any)[operation] = originalMethod;
      
      // Throw the configured error
      const error = new Error(message || `Injected ${errorType} error`);
      (error as any).code = code || `INJECTED_${errorType.toUpperCase()}`;
      throw error;
    };
  }

  /**
   * Record a test scenario
   */
  async recordScenario(name: string, scenario: () => Promise<void>): Promise<void> {
    const recording: TestScenario = {
      name,
      steps: [],
      startTime: this.mockTime,
      endTime: 0,
    };

    // Intercept actor methods to record steps
    const methodsToRecord = ['handle', 'query', 'tell', 'ask', 'publish'];
    const originalMethods: Record<string, any> = {};

    methodsToRecord.forEach(method => {
      originalMethods[method] = (this.actor as any)[method];
      (this.actor as any)[method] = async (...args: any[]) => {
        const startTime = Date.now();
        try {
          const result = await originalMethods[method].apply(this.actor, args);
          recording.steps.push({
            method,
            args: this.deepClone(args),
            result: this.deepClone(result),
            duration: Date.now() - startTime,
            timestamp: this.mockTime,
          });
          return result;
        } catch (error) {
          recording.steps.push({
            method,
            args: this.deepClone(args),
            error: {
              message: (error as Error).message,
              code: (error as any).code,
            },
            duration: Date.now() - startTime,
            timestamp: this.mockTime,
          });
          throw error;
        }
      };
    });

    try {
      await scenario();
      recording.endTime = this.mockTime;
      this.recordedScenarios.set(name, recording);
    } finally {
      // Restore original methods
      methodsToRecord.forEach(method => {
        (this.actor as any)[method] = originalMethods[method];
      });
    }
  }

  /**
   * Replay a recorded scenario
   */
  async replayScenario(name: string): Promise<void> {
    const scenario = this.recordedScenarios.get(name);
    if (!scenario) {
      throw new Error(`No scenario found with name: ${name}. Available scenarios: ${Array.from(this.recordedScenarios.keys()).join(', ')}`);
    }

    for (const step of scenario.steps) {
      const method = (this.actor as any)[step.method];
      if (step.error) {
        await expect(method.apply(this.actor, step.args)).rejects.toThrow(step.error.message);
      } else {
        const result = await method.apply(this.actor, step.args);
        expect(result).toEqual(step.result);
      }
    }
  }

  /**
   * Get recorded scenario
   */
  getScenario(name: string): TestScenario | undefined {
    return this.recordedScenarios.get(name);
  }

  /**
   * Profile performance of an operation
   */
  async profile<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    
    try {
      const result = await operation();
      
      const endTime = Date.now();
      const endMemory = process.memoryUsage();
      
      const metric: PerformanceMetric = {
        name,
        duration: endTime - startTime,
        memoryDelta: {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          external: endMemory.external - startMemory.external,
        },
        timestamp: this.mockTime,
      };
      
      if (!this.performanceMetrics.has(name)) {
        this.performanceMetrics.set(name, []);
      }
      this.performanceMetrics.get(name)!.push(metric);
      
      return result;
    } catch (error) {
      const endTime = Date.now();
      
      const metric: PerformanceMetric = {
        name,
        duration: endTime - startTime,
        memoryDelta: { heapUsed: 0, external: 0 },
        timestamp: this.mockTime,
        error: (error as Error).message,
      };
      
      if (!this.performanceMetrics.has(name)) {
        this.performanceMetrics.set(name, []);
      }
      this.performanceMetrics.get(name)!.push(metric);
      
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(name?: string): PerformanceMetric[] {
    if (name) {
      return this.performanceMetrics.get(name) || [];
    }
    
    const allMetrics: PerformanceMetric[] = [];
    this.performanceMetrics.forEach(metrics => {
      allMetrics.push(...metrics);
    });
    return allMetrics;
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(): string {
    const report: string[] = ['# Performance Report\n'];
    
    this.performanceMetrics.forEach((metrics, name) => {
      if (metrics.length === 0) return;
      
      const durations = metrics.map(m => m.duration);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const minDuration = Math.min(...durations);
      const maxDuration = Math.max(...durations);
      
      report.push(`## ${name}`);
      report.push(`- Executions: ${metrics.length}`);
      report.push(`- Average Duration: ${avgDuration.toFixed(2)}ms`);
      report.push(`- Min Duration: ${minDuration}ms`);
      report.push(`- Max Duration: ${maxDuration}ms`);
      
      const errors = metrics.filter(m => m.error);
      if (errors.length > 0) {
        report.push(`- Errors: ${errors.length} (${((errors.length / metrics.length) * 100).toFixed(1)}%)`);
      }
      
      report.push('');
    });
    
    return report.join('\n');
  }

  /**
   * Wait for a condition to be true
   */
  async waitFor(
    condition: () => boolean | Promise<boolean>,
    options: { timeout?: number; interval?: number; message?: string } = {}
  ): Promise<void> {
    const { timeout = 5000, interval = 100, message = 'Condition not met' } = options;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const result = await condition();
      if (result) return;
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Timeout waiting for condition: ${message}`);
  }

  /**
   * Create a test data builder
   */
  createBuilder<T>(defaultData: T): TestDataBuilder<T> {
    return new TestDataBuilder<T>(defaultData);
  }

  /**
   * Verify state matches expected structure
   */
  verifyState(expectedState: Partial<TState>, path: string = ''): void {
    const actualState = (this.actor as any).state;
    this.verifyObject(actualState, expectedState, path);
  }

  /**
   * Get AI-friendly test summary
   */
  getTestSummary(): string {
    return `
## Test Utilities Summary

### Available Operations:
- **Snapshots**: ${this.stateSnapshots.size} saved (${Array.from(this.stateSnapshots.keys()).join(', ')})
- **Scenarios**: ${this.recordedScenarios.size} recorded (${Array.from(this.recordedScenarios.keys()).join(', ')})
- **Mock Time**: ${new Date(this.mockTime).toISOString()}

### Performance Metrics:
${this.generatePerformanceReport()}

### Usage Examples:
\`\`\`typescript
// Take snapshot before test
testUtils.snapshotState('before-test');

// Generate test data
const user = testUtils.generateTestData('user', { name: 'John Doe' });

// Inject error for testing
await testUtils.injectError({
  operation: 'handle',
  errorType: 'validation',
  message: 'Invalid payload',
});

// Profile operation
await testUtils.profile('create-user', async () => {
  await actor.handle(createUserCommand);
});

// Restore state after test
testUtils.restoreState('before-test');
\`\`\`
    `.trim();
  }

  // Private helper methods
  
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private generateToken(): string {
    return Buffer.from(`${this.generateId()}-${Date.now()}`).toString('base64');
  }

  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime()) as any;
    if (obj instanceof Map) {
      const cloned = new Map();
      obj.forEach((value, key) => cloned.set(key, this.deepClone(value)));
      return cloned as any;
    }
    if (obj instanceof Set) {
      const cloned = new Set();
      obj.forEach(value => cloned.add(this.deepClone(value)));
      return cloned as any;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item)) as any;
    }
    
    const cloned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }
    return cloned;
  }

  private verifyObject(actual: any, expected: any, path: string): void {
    for (const key in expected) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (!(key in actual)) {
        throw new Error(`Missing property at ${currentPath}`);
      }
      
      if (typeof expected[key] === 'object' && expected[key] !== null) {
        this.verifyObject(actual[key], expected[key], currentPath);
      } else if (expected[key] !== undefined && actual[key] !== expected[key]) {
        throw new Error(`Mismatch at ${currentPath}: expected ${expected[key]}, got ${actual[key]}`);
      }
    }
  }
}

/**
 * Test data builder for fluent test data creation
 */
export class TestDataBuilder<T> {
  private data: T;

  constructor(defaultData: T) {
    this.data = { ...defaultData };
  }

  with<K extends keyof T>(key: K, value: T[K]): this {
    this.data[key] = value;
    return this;
  }

  withMany(updates: Partial<T>): this {
    Object.assign(this.data, updates);
    return this;
  }

  build(): T {
    return { ...this.data };
  }

  buildMany(count: number, modifier?: (data: T, index: number) => T): T[] {
    const results: T[] = [];
    for (let i = 0; i < count; i++) {
      const item = { ...this.data };
      results.push(modifier ? modifier(item, i) : item);
    }
    return results;
  }
}

// Type definitions

interface ErrorInjectionConfig {
  operation: string;
  errorType: string;
  message?: string;
  code?: string;
}

interface TestScenario {
  name: string;
  steps: TestStep[];
  startTime: number;
  endTime: number;
}

interface TestStep {
  method: string;
  args: any[];
  result?: any;
  error?: {
    message: string;
    code?: string;
  };
  duration: number;
  timestamp: number;
}

interface PerformanceMetric {
  name: string;
  duration: number;
  memoryDelta: {
    heapUsed: number;
    external: number;
  };
  timestamp: number;
  error?: string;
}

// Make expect available if not already (for non-Jest environments)
declare const expect: any;