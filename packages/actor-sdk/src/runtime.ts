import { EventEmitter } from 'eventemitter3';
import { 
  ActorRuntime, 
  ActorState, 
  Event, 
  EventHandler,
  CircuitBreakerConfig,
  RetryConfig 
} from './types';
import { CircuitBreaker, RetryPolicy } from './patterns';

export interface RuntimeConfig {
  stateStore?: StateStore;
  eventBus?: EventBus;
  circuitBreaker?: CircuitBreakerConfig;
  retry?: RetryConfig;
  timeout?: number;
}

export interface StateStore {
  get(key: string): Promise<ActorState | null>;
  set(key: string, state: ActorState): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface EventBus {
  publish(event: Event): Promise<void>;
  subscribe(pattern: string, handler: EventHandler): void;
  unsubscribe(pattern: string, handler: EventHandler): void;
}

export class InMemoryStateStore implements StateStore {
  private store = new Map<string, ActorState>();

  async get(key: string): Promise<ActorState | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, state: ActorState): Promise<void> {
    this.store.set(key, state);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

export class InMemoryEventBus implements EventBus {
  private emitter = new EventEmitter();

  async publish(event: Event): Promise<void> {
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event);
  }

  subscribe(pattern: string, handler: EventHandler): void {
    this.emitter.on(pattern, handler);
  }

  unsubscribe(pattern: string, handler: EventHandler): void {
    this.emitter.off(pattern, handler);
  }
}

export class LocalActorRuntime implements ActorRuntime {
  private stateStore: StateStore;
  private eventBus: EventBus;
  private actors = new Map<string, any>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private retryPolicy?: RetryPolicy;
  private timeout: number;

  constructor(config?: RuntimeConfig) {
    this.stateStore = config?.stateStore || new InMemoryStateStore();
    this.eventBus = config?.eventBus || new InMemoryEventBus();
    this.timeout = config?.timeout || 5000;

    if (config?.retry) {
      this.retryPolicy = new RetryPolicy(config.retry);
    }

    if (config?.circuitBreaker) {
      // Circuit breakers will be created per actor
    }
  }

  async loadState(actorId: string): Promise<ActorState> {
    const state = await this.stateStore.get(actorId);
    return state || {};
  }

  async saveState(actorId: string, state: ActorState): Promise<void> {
    await this.stateStore.set(actorId, state);
  }

  async publish(event: Event): Promise<void> {
    await this.eventBus.publish(event);
  }

  subscribe(pattern: string, handler: EventHandler): void {
    this.eventBus.subscribe(pattern, handler);
  }

  async ask<T = any>(actorName: string, event: Event): Promise<T> {
    const actor = this.actors.get(actorName);
    if (!actor) {
      throw new Error(`Actor ${actorName} not found`);
    }

    const executeQuery = async () => {
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Ask timeout for actor ${actorName}`));
        }, this.timeout);

        actor.query(event)
          .then((result: any) => {
            clearTimeout(timer);
            if (result.success) {
              resolve(result.data);
            } else {
              reject(result.error);
            }
          })
          .catch((error: Error) => {
            clearTimeout(timer);
            reject(error);
          });
      });
    };

    // Apply retry policy if configured
    const operation = this.retryPolicy 
      ? () => this.retryPolicy!.execute(executeQuery)
      : executeQuery;

    // Apply circuit breaker if configured
    const circuitBreaker = this.getCircuitBreaker(actorName);
    if (circuitBreaker) {
      return circuitBreaker.execute(operation);
    }

    return operation();
  }

  async tell(actorName: string, event: Event): Promise<void> {
    const actor = this.actors.get(actorName);
    if (!actor) {
      throw new Error(`Actor ${actorName} not found`);
    }

    await actor.handle(event);
  }

  registerActor(name: string, actor: any): void {
    this.actors.set(name, actor);
  }

  unregisterActor(name: string): void {
    this.actors.delete(name);
    this.circuitBreakers.delete(name);
  }

  private getCircuitBreaker(actorName: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(actorName);
  }

  async shutdown(): Promise<void> {
    // Shutdown all actors
    for (const actor of this.actors.values()) {
      if (actor.shutdown) {
        await actor.shutdown();
      }
    }

    this.actors.clear();
    this.circuitBreakers.clear();
  }
}

export class VercelActorRuntime extends LocalActorRuntime {
  constructor(config?: RuntimeConfig) {
    super({
      ...config,
      stateStore: new VercelStateStore(),
      eventBus: new VercelEventBus(),
    });
  }
}

class VercelStateStore implements StateStore {
  async get(key: string): Promise<ActorState | null> {
    // In production, this would integrate with Vercel KV or similar
    const value = process.env[`ACTOR_STATE_${key}`];
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, state: ActorState): Promise<void> {
    // In production, this would integrate with Vercel KV or similar
    process.env[`ACTOR_STATE_${key}`] = JSON.stringify(state);
  }

  async delete(key: string): Promise<void> {
    delete process.env[`ACTOR_STATE_${key}`];
  }
}

class VercelEventBus implements EventBus {
  private localBus = new InMemoryEventBus();

  async publish(event: Event): Promise<void> {
    // In production, this would publish to a message queue
    await this.localBus.publish(event);
  }

  subscribe(pattern: string, handler: EventHandler): void {
    this.localBus.subscribe(pattern, handler);
  }

  unsubscribe(pattern: string, handler: EventHandler): void {
    this.localBus.unsubscribe(pattern, handler);
  }
}