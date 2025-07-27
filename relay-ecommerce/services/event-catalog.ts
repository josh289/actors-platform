import { Pool, PoolClient } from 'pg';
import { z } from 'zod';

// Event type definitions
export interface EventDefinition {
  event_name: string;
  description: string;
  producer_actor: string;
  schema_version: string;
  consumers: Array<{
    actor: string;
    pattern: 'ask' | 'tell' | 'publish';
    timeout_ms: number;
  }>;
  payload_schema: Record<string, {
    type: string;
    required: boolean;
    description: string;
    validation?: any;
  }>;
}

export interface Event {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
  actor: string;
  correlationId?: string;
}

export interface Consumer {
  consumer_actor: string;
  pattern: 'ask' | 'tell' | 'publish';
  timeout_ms: number;
}

// Postgres Event Catalog Service
export class PostgresEventCatalog {
  private pool: Pool;
  private cache: Map<string, { data: EventDefinition; timestamp: number }> = new Map();
  private cacheTTL: number = 300000; // 5 minutes

  constructor(connectionConfig: any) {
    this.pool = new Pool(connectionConfig);
  }

  async initialize(): Promise<void> {
    // Test connection
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      console.log('Connected to Postgres event catalog');
    } finally {
      client.release();
    }
  }

  async getEvent(eventName: string): Promise<EventDefinition | null> {
    // Check cache first
    const cached = this.cache.get(eventName);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM event_catalog WHERE event_name = $1',
        [eventName]
      );
      
      if (result.rows.length === 0) {
        return null;
      }

      const eventDef = result.rows[0] as EventDefinition;
      
      // Cache the result
      this.cache.set(eventName, {
        data: eventDef,
        timestamp: Date.now()
      });

      return eventDef;
    } finally {
      client.release();
    }
  }

  async validateEvent(event: Event): Promise<boolean> {
    const definition = await this.getEvent(event.type);
    
    if (!definition) {
      throw new Error(`Event ${event.type} not found in catalog`);
    }

    // Validate payload against schema
    return this.validatePayload(event.payload, definition.payload_schema);
  }

  private validatePayload(
    payload: any,
    schema: Record<string, any>
  ): boolean {
    // Build Zod schema from database schema
    const zodSchema: Record<string, any> = {};
    
    for (const [field, config] of Object.entries(schema)) {
      let fieldSchema;
      
      switch (config.type) {
        case 'string':
          fieldSchema = z.string();
          break;
        case 'number':
          fieldSchema = z.number();
          break;
        case 'boolean':
          fieldSchema = z.boolean();
          break;
        case 'array':
          fieldSchema = z.array(z.any());
          break;
        case 'object':
          fieldSchema = z.object({});
          break;
        default:
          fieldSchema = z.any();
      }

      if (!config.required) {
        fieldSchema = fieldSchema.optional();
      }

      zodSchema[field] = fieldSchema;
    }

    const validator = z.object(zodSchema);
    
    try {
      validator.parse(payload);
      return true;
    } catch (error) {
      console.error('Payload validation failed:', error);
      return false;
    }
  }

  async getConsumers(eventName: string): Promise<Consumer[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT ec.consumer_actor, ec.pattern, ec.timeout_ms
        FROM event_consumers ec
        JOIN event_definitions ed ON ec.event_id = ed.id
        WHERE ed.event_name = $1
      `, [eventName]);
      
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getAllEvents(): Promise<EventDefinition[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM event_catalog ORDER BY event_name');
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getActorEvents(actorName: string): Promise<EventDefinition[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM event_catalog WHERE producer_actor = $1 ORDER BY event_name',
        [actorName]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getFlow(flowName: string): Promise<any> {
    const client = await this.pool.connect();
    try {
      const flowResult = await client.query(
        'SELECT * FROM system_flows WHERE flow_name = $1',
        [flowName]
      );
      
      if (flowResult.rows.length === 0) {
        return null;
      }

      const flow = flowResult.rows[0];
      
      const stepsResult = await client.query(`
        SELECT fs.step_number, fs.description, ed.event_name, ed.producer_actor
        FROM flow_steps fs
        JOIN event_definitions ed ON fs.event_id = ed.id
        WHERE fs.flow_id = $1
        ORDER BY fs.step_number
      `, [flow.id]);

      return {
        ...flow,
        steps: stepsResult.rows
      };
    } finally {
      client.release();
    }
  }

  async addEvent(eventDef: {
    event_name: string;
    description: string;
    producer_actor: string;
    consumers?: Array<{ actor: string; pattern: string; timeout_ms?: number }>;
    payload_schema?: Record<string, any>;
  }): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Insert event definition
      const eventResult = await client.query(`
        INSERT INTO event_definitions (event_name, description, producer_actor)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [eventDef.event_name, eventDef.description, eventDef.producer_actor]);
      
      const eventId = eventResult.rows[0].id;

      // Insert consumers if provided
      if (eventDef.consumers) {
        for (const consumer of eventDef.consumers) {
          await client.query(`
            INSERT INTO event_consumers (event_id, consumer_actor, pattern, timeout_ms)
            VALUES ($1, $2, $3, $4)
          `, [eventId, consumer.actor, consumer.pattern, consumer.timeout_ms || 5000]);
        }
      }

      // Insert payload schema if provided
      if (eventDef.payload_schema) {
        let fieldOrder = 0;
        for (const [fieldName, fieldConfig] of Object.entries(eventDef.payload_schema)) {
          await client.query(`
            INSERT INTO event_payload_schema 
            (event_id, field_name, field_type, required, description, validation_rules, field_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            eventId,
            fieldName,
            fieldConfig.type,
            fieldConfig.required !== false,
            fieldConfig.description || null,
            fieldConfig.validation ? JSON.stringify(fieldConfig.validation) : null,
            fieldOrder++
          ]);
        }
      }

      await client.query('COMMIT');
      
      // Clear cache for this event
      this.cache.delete(eventDef.event_name);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async validateActorEvents(actorName: string, events: string[]): Promise<{
    valid: boolean;
    missing: string[];
    extra: string[];
  }> {
    const catalogEvents = await this.getActorEvents(actorName);
    const catalogEventNames = new Set(catalogEvents.map(e => e.event_name));
    const actorEventNames = new Set(events);

    const missing = Array.from(catalogEventNames).filter(e => !actorEventNames.has(e));
    const extra = Array.from(actorEventNames).filter(e => !catalogEventNames.has(e));

    return {
      valid: missing.length === 0 && extra.length === 0,
      missing,
      extra
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}