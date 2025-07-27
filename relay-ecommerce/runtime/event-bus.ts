import { Event } from '../services/event-catalog';
import { createClient, RedisClientType } from 'redis';
import { EventEmitter } from 'events';

export interface EventBusConfig {
  provider: 'redis' | 'memory';
  redis?: {
    host: string;
    port: number;
    password?: string;
    cluster?: boolean;
    nodes?: Array<{ host: string; port?: number }>;
  };
  patterns: {
    ask: {
      timeout: number;
      retries: number;
    };
    tell: {
      delivery: 'at_least_once' | 'at_most_once';
    };
    publish: {
      delivery: 'best_effort' | 'guaranteed';
    };
  };
  persistence?: {
    events: string;
    failed: string;
    metrics: string;
  };
}

export type EventHandler = (event: Event) => Promise<any>;
export type SubscriptionHandler = (event: Event) => Promise<void>;

export class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();
  private subscriptions: Map<string, SubscriptionHandler[]> = new Map();
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  
  private redis?: RedisClientType;
  private subscriber?: RedisClientType;
  private localEmitter: EventEmitter = new EventEmitter();

  constructor(private config: EventBusConfig) {}

  async initialize(): Promise<void> {
    if (this.config.provider === 'redis' && this.config.redis) {
      // Initialize Redis clients
      this.redis = createClient({
        socket: {
          host: this.config.redis.host,
          port: this.config.redis.port
        },
        password: this.config.redis.password
      });

      this.subscriber = this.redis.duplicate();

      await this.redis.connect();
      await this.subscriber.connect();

      // Subscribe to response channel for ask pattern
      await this.subscriber.subscribe('event:response:*', (message, channel) => {
        const correlationId = channel.split(':')[2];
        this.handleResponse(correlationId, JSON.parse(message));
      });

      console.log('EventBus connected to Redis');
    } else {
      console.log('EventBus using in-memory provider');
    }
  }

  // Register handler for commands/queries (ask pattern)
  async on(eventType: string, handler: EventHandler): Promise<void> {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
      
      if (this.redis) {
        // Subscribe to this event type in Redis
        await this.subscriber!.subscribe(`event:${eventType}`, async (message) => {
          const event = JSON.parse(message);
          await this.handleEvent(event);
        });
      }
    }
    
    this.handlers.get(eventType)!.push(handler);
  }

  // Subscribe to notifications (publish pattern)
  async subscribe(eventType: string, handler: SubscriptionHandler): Promise<void> {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
      
      if (this.redis) {
        // Subscribe to broadcast channel
        await this.subscriber!.subscribe(`broadcast:${eventType}`, async (message) => {
          const event = JSON.parse(message);
          await this.handleBroadcast(event);
        });
      }
    }
    
    this.subscriptions.get(eventType)!.push(handler);
  }

  // Ask pattern - synchronous request/response
  async ask(event: Event, target: string, timeout: number): Promise<any> {
    const correlationId = this.generateCorrelationId();
    event.correlationId = correlationId;

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timer = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`Request timeout for ${event.type} to ${target}`));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(correlationId, { resolve, reject, timeout: timer });

      // Send event
      if (this.redis) {
        this.redis.publish(`actor:${target}:${event.type}`, JSON.stringify(event));
      } else {
        // In-memory handling
        this.localEmitter.emit(`actor:${target}:${event.type}`, event);
      }
    });
  }

  // Tell pattern - asynchronous fire-and-forget
  async tell(event: Event, target: string): Promise<void> {
    if (this.redis) {
      await this.redis.publish(`actor:${target}:${event.type}`, JSON.stringify(event));
      
      // Store for at-least-once delivery if configured
      if (this.config.patterns.tell.delivery === 'at_least_once') {
        await this.redis.set(
          `pending:${event.id}`,
          JSON.stringify({ event, target }),
          { EX: 3600 } // 1 hour TTL
        );
      }
    } else {
      // In-memory handling
      setImmediate(() => {
        this.localEmitter.emit(`actor:${target}:${event.type}`, event);
      });
    }
  }

  // Publish pattern - broadcast to all subscribers
  async publish(event: Event): Promise<void> {
    if (this.redis) {
      await this.redis.publish(`broadcast:${event.type}`, JSON.stringify(event));
      
      // Store event if persistence is configured
      if (this.config.persistence?.events) {
        await this.redis.set(
          `event:${event.id}`,
          JSON.stringify(event),
          { EX: this.parseDuration(this.config.persistence.events) }
        );
      }
    } else {
      // In-memory broadcast
      const handlers = this.subscriptions.get(event.type) || [];
      
      for (const handler of handlers) {
        setImmediate(async () => {
          try {
            await handler(event);
          } catch (error) {
            console.error(`Subscription handler error for ${event.type}:`, error);
          }
        });
      }
    }
  }

  // Handle incoming events
  private async handleEvent(event: Event): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];
    
    for (const handler of handlers) {
      try {
        const result = await handler(event);
        
        // If this was an ask pattern request, send response
        if (event.correlationId) {
          await this.sendResponse(event.correlationId, result);
        }
      } catch (error) {
        console.error(`Handler error for ${event.type}:`, error);
        
        if (event.correlationId) {
          await this.sendResponse(event.correlationId, {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }
  }

  // Handle broadcast events
  private async handleBroadcast(event: Event): Promise<void> {
    const handlers = this.subscriptions.get(event.type) || [];
    
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`Broadcast handler error for ${event.type}:`, error);
      }
    }
  }

  // Send response for ask pattern
  private async sendResponse(correlationId: string, response: any): Promise<void> {
    if (this.redis) {
      await this.redis.publish(
        `event:response:${correlationId}`,
        JSON.stringify(response)
      );
    } else {
      // In-memory response
      this.handleResponse(correlationId, response);
    }
  }

  // Handle response for ask pattern
  private handleResponse(correlationId: string, response: any): void {
    const pending = this.pendingRequests.get(correlationId);
    
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(correlationId);
      
      if (response.error) {
        pending.reject(new Error(response.error));
      } else {
        pending.resolve(response);
      }
    }
  }

  // Generate unique correlation ID
  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Parse duration strings like "7_days" to seconds
  private parseDuration(duration: string): number {
    const match = duration.match(/(\d+)_?(days?|hours?|minutes?|seconds?)/);
    if (!match) return 86400; // Default 1 day

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'day':
      case 'days':
        return value * 86400;
      case 'hour':
      case 'hours':
        return value * 3600;
      case 'minute':
      case 'minutes':
        return value * 60;
      case 'second':
      case 'seconds':
        return value;
      default:
        return 86400;
    }
  }

  // Clean up
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      await this.subscriber?.quit();
    }
    
    // Clear all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('EventBus shutting down'));
    }
    
    this.pendingRequests.clear();
    this.handlers.clear();
    this.subscriptions.clear();
  }
}