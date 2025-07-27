import { v4 as uuidv4 } from 'uuid';
import { Event, EventMetadata, Command, Query, Notification } from './types';

export class EventBuilder {
  static command(type: string, payload: any, metadata?: Partial<EventMetadata>): Command {
    return {
      type,
      payload,
      metadata: {
        correlationId: uuidv4(),
        timestamp: Date.now(),
        ...metadata,
      },
    };
  }

  static query(type: string, payload: any, metadata?: Partial<EventMetadata>): Query {
    return {
      type,
      payload,
      metadata: {
        correlationId: uuidv4(),
        timestamp: Date.now(),
        ...metadata,
      },
    };
  }

  static notification(type: string, payload: any, metadata?: Partial<EventMetadata>): Notification {
    return {
      type,
      payload,
      metadata: {
        correlationId: uuidv4(),
        timestamp: Date.now(),
        ...metadata,
      },
    };
  }
}

export class EventPattern {
  private pattern: RegExp;

  constructor(pattern: string) {
    this.pattern = this.createRegExp(pattern);
  }

  matches(eventType: string): boolean {
    return this.pattern.test(eventType);
  }

  private createRegExp(pattern: string): RegExp {
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\./g, '\\.');
    
    return new RegExp(`^${regexPattern}$`);
  }
}

export class EventStore {
  private events: Event[] = [];
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  append(event: Event): void {
    this.events.push(event);
    
    if (this.events.length > this.maxSize) {
      this.events.shift();
    }
  }

  getEvents(filter?: (event: Event) => boolean): Event[] {
    if (filter) {
      return this.events.filter(filter);
    }
    return [...this.events];
  }

  getEventsByType(type: string): Event[] {
    return this.events.filter(event => event.type === type);
  }

  getEventsByCorrelationId(correlationId: string): Event[] {
    return this.events.filter(
      event => event.metadata?.correlationId === correlationId
    );
  }

  clear(): void {
    this.events = [];
  }

  get size(): number {
    return this.events.length;
  }
}