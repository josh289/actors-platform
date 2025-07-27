import { Actor } from './actor';
import { Command, Query, Event } from './types';
import { vi } from 'vitest';

/**
 * Testing utilities for actors
 */
export class TestUtilities {
  private actor: Actor<any>;

  constructor(actor: Actor<any>) {
    this.actor = actor;
  }

  /**
   * Get current state (only in test mode)
   */
  getState(): any {
    return (this.actor as any).state;
  }

  /**
   * Set state directly (only in test mode)
   */
  setState(state: any): void {
    (this.actor as any).state = state;
  }

  /**
   * Spy on method calls
   */
  spyOn(methodName: string): MethodSpy {
    const spy = new MethodSpy(this.actor, methodName);
    return spy;
  }

  /**
   * Mock external actor responses
   */
  mockActorResponse(actorName: string, response: any): void {
    const runtime = (this.actor as any).context.runtime;
    if (runtime.mockResponse) {
      runtime.mockResponse(actorName, response);
    }
  }

  /**
   * Get emitted events
   */
  getEmittedEvents(): Event[] {
    const runtime = (this.actor as any).context.runtime;
    if (runtime.getEmittedEvents) {
      return runtime.getEmittedEvents();
    }
    return [];
  }

  /**
   * Clear emitted events
   */
  clearEmittedEvents(): void {
    const runtime = (this.actor as any).context.runtime;
    if (runtime.clearEmittedEvents) {
      runtime.clearEmittedEvents();
    }
  }

  /**
   * Simulate command
   */
  async simulateCommand(command: Command): Promise<any> {
    return this.actor.handle(command);
  }

  /**
   * Simulate query
   */
  async simulateQuery(query: Query): Promise<any> {
    return this.actor.query(query);
  }

  /**
   * Get metrics snapshot
   */
  getMetricsSnapshot(): any {
    return (this.actor as any).monitoring.getMetricsJSON();
  }

  /**
   * Get security events
   */
  getSecurityEvents(): any[] {
    return (this.actor as any).security.getEvents();
  }

  /**
   * Trigger health check
   */
  async triggerHealthCheck(): Promise<any> {
    return this.actor.performHealthCheck();
  }

  /**
   * Fast forward time (for testing time-based features)
   */
  fastForwardTime(ms: number): void {
    // This would integrate with a time mocking library
    // For now, it's a placeholder
    console.log(`Fast forwarding time by ${ms}ms`);
  }

  /**
   * Create test context
   */
  static createTestContext(overrides?: Partial<any>): any {
    const emittedEvents: Event[] = [];
    const mockResponses = new Map<string, any>();

    return {
      actorId: 'test-actor-id',
      config: {
        name: 'test-actor',
        version: '1.0.0',
        ...overrides?.config,
      },
      logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      runtime: {
        ask: vi.fn(async (actorName: string, _event: Event) => {
          if (mockResponses.has(actorName)) {
            return mockResponses.get(actorName);
          }
          throw new Error(`No mock response for actor ${actorName}`);
        }),
        tell: vi.fn(),
        publish: vi.fn((event: Event) => {
          emittedEvents.push(event);
        }),
        subscribe: vi.fn(),
        loadState: vi.fn(),
        saveState: vi.fn(),
        mockResponse: (actorName: string, response: any) => {
          mockResponses.set(actorName, response);
        },
        getEmittedEvents: () => [...emittedEvents],
        clearEmittedEvents: () => {
          emittedEvents.length = 0;
        },
      },
      ...overrides,
    };
  }

  /**
   * Create test fixtures
   */
  static createFixtures<TState>(defaultState: TState): TestFixtures<TState> {
    return new TestFixtures(defaultState);
  }
}

/**
 * Method spy for testing
 */
class MethodSpy {
  private actor: any;
  private methodName: string;
  private originalMethod: Function;
  private calls: any[] = [];
  private mockImplementation?: Function;

  constructor(actor: any, methodName: string) {
    this.actor = actor;
    this.methodName = methodName;
    this.originalMethod = actor[methodName].bind(actor);

    // Replace method with spy
    actor[methodName] = async (...args: any[]) => {
      this.calls.push({
        args,
        timestamp: new Date(),
      });

      if (this.mockImplementation) {
        return this.mockImplementation(...args);
      }

      return this.originalMethod(...args);
    };
  }

  getCalls(): any[] {
    return [...this.calls];
  }

  getCallCount(): number {
    return this.calls.length;
  }

  wasCalledWith(...args: any[]): boolean {
    return this.calls.some(call => 
      JSON.stringify(call.args) === JSON.stringify(args)
    );
  }

  mockReturnValue(value: any): void {
    this.mockImplementation = async () => value;
  }

  mockImplementationFn(fn: Function): void {
    this.mockImplementation = fn;
  }

  restore(): void {
    this.actor[this.methodName] = this.originalMethod;
  }

  reset(): void {
    this.calls = [];
  }
}

/**
 * Test fixtures manager
 */
class TestFixtures<TState extends Record<string, any>> {
  private defaultState: TState;
  private fixtures: Map<string, any> = new Map();

  constructor(defaultState: TState) {
    this.defaultState = defaultState;
  }

  addFixture(name: string, data: any): void {
    this.fixtures.set(name, data);
  }

  getFixture(name: string): any {
    return this.fixtures.get(name);
  }

  createState(overrides?: Partial<TState>): TState {
    return {
      ...this.defaultState,
      ...overrides,
    };
  }

  createCommand(type: string, payload: any, metadata?: any): Command {
    return {
      type,
      payload,
      metadata: {
        correlationId: 'test-correlation-id',
        timestamp: Date.now(),
        ...metadata,
      },
    };
  }

  createQuery(type: string, payload: any, metadata?: any): Query {
    return {
      type,
      payload,
      metadata: {
        correlationId: 'test-correlation-id',
        timestamp: Date.now(),
        ...metadata,
      },
    };
  }

  createEvent(type: string, payload: any, metadata?: any): Event {
    return {
      type,
      payload,
      metadata: {
        correlationId: 'test-correlation-id',
        timestamp: Date.now(),
        ...metadata,
      },
    };
  }
}

/**
 * Test helpers
 */
export class TestHelpers {
  /**
   * Wait for condition to be true
   */
  static async waitFor(
    condition: () => boolean,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (!condition()) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Timeout waiting for condition');
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  /**
   * Create mock timer
   */
  static createMockTimer(): MockTimer {
    let currentTime = Date.now();
    
    return {
      now: () => currentTime,
      advance: (ms: number) => {
        currentTime += ms;
      },
      reset: () => {
        currentTime = Date.now();
      },
    };
  }

  /**
   * Assert event emitted
   */
  static assertEventEmitted(
    events: Event[],
    type: string,
    payload?: any
  ): void {
    const event = events.find(e => e.type === type);
    
    if (!event) {
      throw new Error(`Event ${type} was not emitted`);
    }
    
    if (payload && JSON.stringify(event.payload) !== JSON.stringify(payload)) {
      throw new Error(`Event ${type} payload mismatch`);
    }
  }

  /**
   * Create test scenarios
   */
  static createScenarios<TState extends Record<string, any>>(
    actor: Actor<TState>,
    fixtures: TestFixtures<TState>
  ): TestScenarios<TState> {
    return new TestScenarios(actor, fixtures);
  }
}

/**
 * Test scenarios runner
 */
class TestScenarios<TState extends Record<string, any>> {
  private actor: Actor<TState>;
  private fixtures: TestFixtures<TState>;

  constructor(_actor: Actor<TState>, _fixtures: TestFixtures<TState>) {
    this.actor = _actor;
    this.fixtures = _fixtures;
  }

  async runScenario(name: string, steps: TestStep[]): Promise<void> {
    console.log(`Running scenario: ${name}`);
    
    for (const step of steps) {
      console.log(`  Step: ${step.description}`);
      await step.action();
      
      if (step.assertion) {
        await step.assertion();
      }
    }
  }
}

// Type definitions
export interface TestStep {
  description: string;
  action: () => Promise<void>;
  assertion?: () => Promise<void>;
}

export interface MockTimer {
  now: () => number;
  advance: (ms: number) => void;
  reset: () => void;
}