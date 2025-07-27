import { EventBus } from './event-bus';
import { PostgresEventCatalog, Event } from '../services/event-catalog';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ActorConfig {
  name: string;
  version: string;
  config?: Record<string, any>;
  catalog: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
}

export interface Result {
  success: boolean;
  state?: any;
  events: Event[];
  response?: any;
}

export interface ActorDefinition {
  actor: {
    name: string;
    description: string;
    version: string;
    state?: Record<string, any>;
    handles?: Record<string, any>;
    queries?: Record<string, any>;
    subscribes?: Record<string, any>;
    dependencies?: Record<string, any>;
  };
}

export abstract class RelayActor {
  private catalog: PostgresEventCatalog;
  private definition: ActorDefinition;
  protected state: Map<string, any> = new Map();
  
  constructor(
    private config: ActorConfig,
    private eventBus: EventBus
  ) {
    this.catalog = new PostgresEventCatalog(config.catalog);
  }

  async initialize(): Promise<void> {
    // Load actor definition
    const definitionPath = path.join(
      process.cwd(),
      'actors',
      this.config.name,
      'actor.yaml'
    );
    
    const yamlContent = await fs.readFile(definitionPath, 'utf-8');
    this.definition = yaml.load(yamlContent) as ActorDefinition;

    // Initialize catalog connection
    await this.catalog.initialize();

    // Initialize state
    if (this.definition.actor.state) {
      for (const [key, schema] of Object.entries(this.definition.actor.state)) {
        this.state.set(key, new Map());
      }
    }

    // Register event handlers
    await this.registerHandlers();
  }

  async handle(event: Event): Promise<Result> {
    // 1. Validate event against Postgres catalog
    const isValid = await this.catalog.validateEvent(event);
    if (!isValid) {
      throw new Error(`Event ${event.type} not in catalog or invalid schema`);
    }

    // 2. Check if this actor handles this event
    const handler = this.getHandler(event.type);
    if (!handler) {
      throw new Error(`Actor ${this.config.name} does not handle event ${event.type}`);
    }

    // 3. Apply business rules validation
    if (handler.validates) {
      for (const rule of handler.validates) {
        if (!this.validateRule(rule, event.payload)) {
          throw new Error(`Validation failed: ${rule}`);
        }
      }
    }

    // 4. Process with handler
    const result = await this.processEvent(event, handler);

    // 5. Validate and emit resulting events
    for (const emittedEvent of result.events) {
      await this.catalog.validateEvent(emittedEvent);
      const consumers = await this.catalog.getConsumers(emittedEvent.type);
      
      // Route based on pattern
      for (const consumer of consumers) {
        switch (consumer.pattern) {
          case 'ask':
            // Synchronous request-response
            const response = await this.eventBus.ask(
              emittedEvent,
              consumer.consumer_actor,
              consumer.timeout_ms
            );
            // Handle response if needed
            break;
            
          case 'tell':
            // Asynchronous fire-and-forget
            await this.eventBus.tell(emittedEvent, consumer.consumer_actor);
            break;
            
          case 'publish':
            // Broadcast to all subscribers
            await this.eventBus.publish(emittedEvent);
            break;
        }
      }
    }

    // 6. Update state
    await this.updateState(result.state);

    return result;
  }

  async query(event: Event): Promise<any> {
    const queryDef = this.definition.actor.queries?.[event.type];
    if (!queryDef) {
      throw new Error(`Actor ${this.config.name} does not handle query ${event.type}`);
    }

    // Validate query payload
    const isValid = await this.catalog.validateEvent(event);
    if (!isValid) {
      throw new Error(`Query ${event.type} has invalid payload`);
    }

    // Execute query handler
    return this.executeQuery(event, queryDef);
  }

  private async registerHandlers(): Promise<void> {
    // Register command handlers
    if (this.definition.actor.handles) {
      for (const [eventType, handler] of Object.entries(this.definition.actor.handles)) {
        await this.eventBus.on(eventType, async (event: Event) => {
          return this.handle(event);
        });
      }
    }

    // Register query handlers
    if (this.definition.actor.queries) {
      for (const [queryType, _] of Object.entries(this.definition.actor.queries)) {
        await this.eventBus.on(queryType, async (event: Event) => {
          return this.query(event);
        });
      }
    }

    // Register subscriptions
    if (this.definition.actor.subscribes) {
      for (const [eventType, handler] of Object.entries(this.definition.actor.subscribes)) {
        await this.eventBus.subscribe(eventType, async (event: Event) => {
          await this.handleSubscription(event, handler);
        });
      }
    }
  }

  private getHandler(eventType: string): any {
    return this.definition.actor.handles?.[eventType];
  }

  private validateRule(rule: string, payload: any): boolean {
    // Simple rule evaluation - in production would use proper expression evaluator
    try {
      // Parse rules like "quantity > 0" or "cart.items.length > 0"
      const parts = rule.split(/\s+/);
      if (parts.length !== 3) return false;

      const [field, operator, value] = parts;
      const fieldValue = this.getFieldValue(payload, field);
      const compareValue = isNaN(Number(value)) ? value : Number(value);

      switch (operator) {
        case '>':
          return fieldValue > compareValue;
        case '<':
          return fieldValue < compareValue;
        case '>=':
          return fieldValue >= compareValue;
        case '<=':
          return fieldValue <= compareValue;
        case '==':
        case '===':
          return fieldValue === compareValue;
        case '!=':
        case '!==':
          return fieldValue !== compareValue;
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  private getFieldValue(obj: any, path: string): any {
    const parts = path.split('.');
    let value = obj;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  // Abstract methods to be implemented by specific actors
  protected abstract processEvent(event: Event, handler: any): Promise<Result>;
  protected abstract executeQuery(event: Event, queryDef: any): Promise<any>;
  protected abstract handleSubscription(event: Event, handler: any): Promise<void>;
  protected abstract updateState(newState: any): Promise<void>;

  // Helper methods for actors
  protected async emit(eventType: string, payload: any): Promise<void> {
    const event: Event = {
      id: this.generateId(),
      type: eventType,
      payload,
      timestamp: Date.now(),
      actor: this.config.name
    };

    await this.handle(event);
  }

  protected generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  protected getState(key: string): Map<string, any> | undefined {
    return this.state.get(key);
  }

  protected setState(key: string, value: Map<string, any>): void {
    this.state.set(key, value);
  }
}