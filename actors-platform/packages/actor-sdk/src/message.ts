import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { Actor } from './actor';
import { ActorResult, QueryResult, Event, EventMetadata } from './types';
import { IEventRegistry, EventCategory, ValidationResult } from './event-registry/types';
import { ActorError } from './actor-error';

/**
 * Base Message Class
 * 
 * Provides a unified message system for all actor communication.
 * All messages are validated against the global event registry.
 */

export interface MessageMetadata extends EventMetadata {
  id: string;
  category: EventCategory;
  producedBy?: string;
  targetActor?: string;
  retryCount?: number;
  maxRetries?: number;
}

export interface MessageResult {
  success: boolean;
  data?: any;
  error?: Error;
  events?: Event[]; // Events emitted as a result of processing
  metadata?: {
    processingTime: number;
    retries?: number;
  };
}

export abstract class BaseMessage {
  public readonly id: string;
  public readonly type: string;
  public readonly payload: any;
  public readonly metadata: MessageMetadata;
  
  protected static registry: IEventRegistry | null = null;
  
  constructor(type: string, payload: any, metadata?: Partial<MessageMetadata>) {
    this.id = metadata?.id || uuidv4();
    this.type = type;
    this.payload = payload;
    this.metadata = {
      id: this.id,
      category: this.getCategory(),
      timestamp: Date.now(),
      ...metadata,
    };
  }
  
  /**
   * Set the global event registry
   */
  static setRegistry(registry: IEventRegistry): void {
    BaseMessage.registry = registry;
  }
  
  /**
   * Get the event category for this message type
   */
  abstract getCategory(): EventCategory;
  
  /**
   * Process this message with the given actor
   */
  abstract process(actor: Actor): Promise<MessageResult>;
  
  /**
   * Validate the message against the event registry
   */
  async validate(): Promise<ValidationResult> {
    if (!BaseMessage.registry) {
      return { 
        valid: true, 
        errors: [] 
      }; // Skip validation if no registry
    }
    
    return await BaseMessage.registry.validatePayload(this.type, this.payload);
  }
  
  /**
   * Check if this actor can handle this message
   */
  async canBeHandledBy(actorName: string): Promise<boolean> {
    if (!BaseMessage.registry) {
      return true; // Allow all if no registry
    }
    
    const consumers = await BaseMessage.registry.getConsumers(this.type);
    return consumers.includes(actorName);
  }
  
  /**
   * Create a message from an event
   */
  static async fromEvent(event: Event): Promise<BaseMessage> {
    // Determine category from registry or event metadata
    let category: EventCategory = 'notification'; // default
    
    if (BaseMessage.registry) {
      const definition = await BaseMessage.registry.getDefinition(event.type);
      if (definition) {
        category = definition.category;
      }
    } else if (event.metadata?.category) {
      category = event.metadata.category as EventCategory;
    }
    
    // Create appropriate message type based on category
    switch (category) {
      case 'command':
        return new CommandMessage(event.type, event.payload, event.metadata);
      case 'query':
        return new QueryMessage(event.type, event.payload, event.metadata);
      case 'notification':
        return new NotificationMessage(event.type, event.payload, event.metadata);
      default:
        throw new ActorError(
          `Unknown event category: ${category}`,
          'UNKNOWN_EVENT_CATEGORY',
          {
            event: event.type,
            category,
            fix: 'Ensure event is registered in the event registry with a valid category',
            relatedFiles: ['src/event-registry/types.ts'],
          },
          400
        );
    }
  }
  
  /**
   * Convert to Event for actor processing
   */
  toEvent(): Event {
    return {
      type: this.type,
      payload: this.payload,
      metadata: this.metadata,
    };
  }
}

/**
 * Command Message
 * 
 * Represents an action that changes state.
 * Commands are processed asynchronously and may emit events.
 */
export class CommandMessage extends BaseMessage {
  getCategory(): EventCategory {
    return 'command';
  }
  
  async process(actor: Actor): Promise<MessageResult> {
    const startTime = Date.now();
    
    try {
      // Validate actor can handle this command
      const canHandle = await this.canBeHandledBy(actor.config.name);
      if (!canHandle) {
        throw new ActorError(
          `Actor ${actor.config.name} cannot handle command ${this.type}`,
          'COMMAND_NOT_HANDLED',
          {
            actor: actor.config.name,
            command: this.type,
            fix: 'Check actor manifest to ensure this command is in the handles list',
            helpfulCommands: [
              `await registry.getConsumers('${this.type}')`,
            ],
          },
          400
        );
      }
      
      // Validate payload
      const validation = await this.validate();
      if (!validation.valid) {
        throw new ActorError(
          `Invalid payload for command ${this.type}`,
          'INVALID_COMMAND_PAYLOAD',
          {
            actor: actor.config.name,
            command: this.type,
            errors: validation.errors,
            fix: 'Ensure payload matches the schema defined in event registry',
          },
          400
        );
      }
      
      // Process command through actor
      const result = await actor.handle(this.toEvent());
      
      // Record metrics
      if (BaseMessage.registry) {
        await BaseMessage.registry.recordMetric({
          eventName: this.type,
          actorId: actor.id,
          direction: 'consumed',
          success: result.success,
          durationMs: Date.now() - startTime,
          errorMessage: result.error?.message,
          correlationId: this.metadata.correlationId,
        });
      }
      
      return {
        success: result.success,
        data: result.data,
        error: result.error,
        events: result.events,
        metadata: {
          processingTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      // Record failure metric
      if (BaseMessage.registry) {
        await BaseMessage.registry.recordMetric({
          eventName: this.type,
          actorId: actor.id,
          direction: 'consumed',
          success: false,
          durationMs: Date.now() - startTime,
          errorMessage: (error as Error).message,
          correlationId: this.metadata.correlationId,
        });
      }
      
      throw error;
    }
  }
}

/**
 * Query Message
 * 
 * Represents a read-only request for information.
 * Queries do not change state and do not emit events.
 */
export class QueryMessage extends BaseMessage {
  getCategory(): EventCategory {
    return 'query';
  }
  
  async process(actor: Actor): Promise<MessageResult> {
    const startTime = Date.now();
    
    try {
      // Validate actor can handle this query
      const canHandle = await this.canBeHandledBy(actor.config.name);
      if (!canHandle) {
        throw new ActorError(
          `Actor ${actor.config.name} cannot handle query ${this.type}`,
          'QUERY_NOT_HANDLED',
          {
            actor: actor.config.name,
            query: this.type,
            fix: 'Check actor manifest to ensure this query is in the handles list',
          },
          400
        );
      }
      
      // Validate payload
      const validation = await this.validate();
      if (!validation.valid) {
        throw new ActorError(
          `Invalid payload for query ${this.type}`,
          'INVALID_QUERY_PAYLOAD',
          {
            actor: actor.config.name,
            query: this.type,
            errors: validation.errors,
            fix: 'Ensure payload matches the schema defined in event registry',
          },
          400
        );
      }
      
      // Process query through actor
      const result = await actor.query(this.toEvent());
      
      // Record metrics
      if (BaseMessage.registry) {
        await BaseMessage.registry.recordMetric({
          eventName: this.type,
          actorId: actor.id,
          direction: 'consumed',
          success: result.success,
          durationMs: Date.now() - startTime,
          errorMessage: result.error?.message,
          correlationId: this.metadata.correlationId,
        });
      }
      
      return {
        success: result.success,
        data: result.data,
        error: result.error,
        events: [], // Queries don't emit events
        metadata: {
          processingTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      // Record failure metric
      if (BaseMessage.registry) {
        await BaseMessage.registry.recordMetric({
          eventName: this.type,
          actorId: actor.id,
          direction: 'consumed',
          success: false,
          durationMs: Date.now() - startTime,
          errorMessage: (error as Error).message,
          correlationId: this.metadata.correlationId,
        });
      }
      
      throw error;
    }
  }
}

/**
 * Notification Message
 * 
 * Represents an event that has occurred.
 * Notifications are processed asynchronously and may trigger other events.
 */
export class NotificationMessage extends BaseMessage {
  getCategory(): EventCategory {
    return 'notification';
  }
  
  async process(actor: Actor): Promise<MessageResult> {
    const startTime = Date.now();
    
    try {
      // Validate actor can handle this notification
      const canHandle = await this.canBeHandledBy(actor.config.name);
      if (!canHandle) {
        // For notifications, we might want to silently ignore rather than error
        return {
          success: true,
          data: { ignored: true, reason: 'Actor does not handle this notification' },
          events: [],
          metadata: {
            processingTime: Date.now() - startTime,
          },
        };
      }
      
      // Validate payload
      const validation = await this.validate();
      if (!validation.valid) {
        // Log warning but don't fail - notifications are often fire-and-forget
        console.warn(`Invalid payload for notification ${this.type}:`, validation.errors);
      }
      
      // Process notification through actor's event handler
      // Actors can optionally implement onNotification for special handling
      let result: ActorResult;
      if (typeof (actor as any).onNotification === 'function') {
        result = await (actor as any).onNotification(this.toEvent());
      } else {
        // Default: process as a command but without expecting a response
        result = await actor.handle(this.toEvent());
      }
      
      // Record metrics
      if (BaseMessage.registry) {
        await BaseMessage.registry.recordMetric({
          eventName: this.type,
          actorId: actor.id,
          direction: 'consumed',
          success: result.success,
          durationMs: Date.now() - startTime,
          errorMessage: result.error?.message,
          correlationId: this.metadata.correlationId,
        });
      }
      
      return {
        success: result.success,
        data: result.data,
        error: result.error,
        events: result.events,
        metadata: {
          processingTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      // Record failure metric
      if (BaseMessage.registry) {
        await BaseMessage.registry.recordMetric({
          eventName: this.type,
          actorId: actor.id,
          direction: 'consumed',
          success: false,
          durationMs: Date.now() - startTime,
          errorMessage: (error as Error).message,
          correlationId: this.metadata.correlationId,
        });
      }
      
      // For notifications, we might want to log and continue rather than fail
      console.error(`Failed to process notification ${this.type}:`, error);
      
      return {
        success: false,
        error: error as Error,
        events: [],
        metadata: {
          processingTime: Date.now() - startTime,
        },
      };
    }
  }
}

/**
 * Message Factory
 */
export class MessageFactory {
  private static registry: IEventRegistry | null = null;
  
  static setRegistry(registry: IEventRegistry): void {
    MessageFactory.registry = registry;
    BaseMessage.setRegistry(registry);
  }
  
  static createCommand(type: string, payload: any, metadata?: Partial<MessageMetadata>): CommandMessage {
    return new CommandMessage(type, payload, metadata);
  }
  
  static createQuery(type: string, payload: any, metadata?: Partial<MessageMetadata>): QueryMessage {
    return new QueryMessage(type, payload, metadata);
  }
  
  static createNotification(type: string, payload: any, metadata?: Partial<MessageMetadata>): NotificationMessage {
    return new NotificationMessage(type, payload, metadata);
  }
  
  static async fromEvent(event: Event): Promise<BaseMessage> {
    return BaseMessage.fromEvent(event);
  }
}