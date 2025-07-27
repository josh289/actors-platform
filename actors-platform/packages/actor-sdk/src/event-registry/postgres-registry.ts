import { Pool, PoolClient } from 'pg';
import Redis from 'ioredis';
import Ajv from 'ajv';
import { 
  IEventRegistry, 
  EventDefinition, 
  EventConsumer, 
  EventMetric,
  ActorManifest,
  EventSchemaVersion,
  ValidationResult,
  EventCatalogEntry,
  EventRegistryConfig,
  EventCategory,
  JSONSchema,
  EventDefinitionSchema,
  EventConsumerSchema,
  EventMetricSchema,
  ActorManifestSchema
} from './types';
import { ActorError } from '../actor-error';

/**
 * PostgreSQL-based Event Registry Implementation
 * 
 * Provides a centralized registry for all events in the actor system
 * with caching, validation, and metrics capabilities.
 */
export class PostgresEventRegistry implements IEventRegistry {
  private pool: Pool;
  private redis?: Redis;
  private ajv: Ajv;
  private config: EventRegistryConfig;
  private cachePrefix = 'event_registry:';
  
  constructor(config: EventRegistryConfig) {
    this.config = config;
    
    // Initialize PostgreSQL connection pool
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    // Initialize Redis if caching is enabled
    if (config.cacheEnabled !== false) {
      this.redis = new Redis({
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
      });
    }
    
    // Initialize AJV for JSON Schema validation
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: config.validationMode === 'strict',
    });
  }
  
  /**
   * Register a new event definition
   */
  async register(event: EventDefinition): Promise<void> {
    // Validate event definition
    const validation = EventDefinitionSchema.safeParse(event);
    if (!validation.success) {
      throw new ActorError(
        'Invalid event definition',
        'INVALID_EVENT_DEFINITION',
        {
          event: event.name,
          errors: validation.error.errors,
          fix: 'Ensure event definition matches the required schema',
          relatedFiles: ['src/event-registry/types.ts'],
        },
        400
      );
    }
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Insert event definition
      const result = await client.query(
        `INSERT INTO event_definitions 
         (name, category, description, payload_schema, producer_actor, version, deprecated, replaced_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (name) DO UPDATE SET
         description = EXCLUDED.description,
         payload_schema = EXCLUDED.payload_schema,
         updated_at = NOW()
         RETURNING id`,
        [
          event.name,
          event.category,
          event.description,
          JSON.stringify(event.payloadSchema),
          event.producerActor,
          event.version || 1,
          event.deprecated || false,
          event.replacedBy || null,
        ]
      );
      
      // Log to audit table
      await client.query(
        `INSERT INTO event_audit_log (event_name, action, new_value, changed_by)
         VALUES ($1, $2, $3, $4)`,
        [event.name, 'created', JSON.stringify(event), 'system']
      );
      
      await client.query('COMMIT');
      
      // Clear cache
      await this.clearCache(`event:${event.name}`);
      await this.clearCache('event:list');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw new ActorError(
        `Failed to register event: ${(error as Error).message}`,
        'EVENT_REGISTRATION_FAILED',
        {
          event: event.name,
          error: (error as Error).message,
          fix: 'Check database connection and schema',
        },
        500
      );
    } finally {
      client.release();
    }
  }
  
  /**
   * Update an existing event definition
   */
  async update(eventName: string, updates: Partial<EventDefinition>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get current definition
      const current = await this.getDefinition(eventName);
      if (!current) {
        throw new ActorError(
          `Event ${eventName} not found`,
          'EVENT_NOT_FOUND',
          {
            event: eventName,
            fix: 'Register the event before updating',
          },
          404
        );
      }
      
      // Build update query dynamically
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      
      if (updates.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        values.push(updates.description);
      }
      if (updates.payloadSchema !== undefined) {
        updateFields.push(`payload_schema = $${paramIndex++}`);
        values.push(JSON.stringify(updates.payloadSchema));
      }
      if (updates.deprecated !== undefined) {
        updateFields.push(`deprecated = $${paramIndex++}`);
        values.push(updates.deprecated);
      }
      if (updates.replacedBy !== undefined) {
        updateFields.push(`replaced_by = $${paramIndex++}`);
        values.push(updates.replacedBy);
      }
      
      if (updateFields.length > 0) {
        updateFields.push('updated_at = NOW()');
        values.push(eventName);
        
        await client.query(
          `UPDATE event_definitions SET ${updateFields.join(', ')} WHERE name = $${paramIndex}`,
          values
        );
        
        // Log to audit
        await client.query(
          `INSERT INTO event_audit_log (event_name, action, old_value, new_value, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [eventName, 'updated', JSON.stringify(current), JSON.stringify(updates), 'system']
        );
      }
      
      await client.query('COMMIT');
      
      // Clear cache
      await this.clearCache(`event:${eventName}`);
      await this.clearCache('event:list');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Deprecate an event
   */
  async deprecate(eventName: string, replacedBy?: string): Promise<void> {
    await this.update(eventName, { deprecated: true, replacedBy });
  }
  
  /**
   * Get event definition by name
   */
  async getDefinition(eventName: string): Promise<EventDefinition | null> {
    // Check cache first
    const cached = await this.getFromCache<EventDefinition>(`event:${eventName}`);
    if (cached) return cached;
    
    const result = await this.pool.query(
      `SELECT * FROM event_definitions WHERE name = $1`,
      [eventName]
    );
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    const definition: EventDefinition = {
      id: row.id,
      name: row.name,
      category: row.category,
      description: row.description,
      payloadSchema: row.payload_schema,
      producerActor: row.producer_actor,
      version: row.version,
      deprecated: row.deprecated,
      replacedBy: row.replaced_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    
    // Cache the result
    await this.setCache(`event:${eventName}`, definition);
    
    return definition;
  }
  
  /**
   * List events with optional filtering
   */
  async listEvents(filter?: { 
    category?: EventCategory; 
    producer?: string; 
    deprecated?: boolean 
  }): Promise<EventDefinition[]> {
    let query = 'SELECT * FROM event_definitions WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;
    
    if (filter?.category) {
      query += ` AND category = $${paramIndex++}`;
      params.push(filter.category);
    }
    if (filter?.producer) {
      query += ` AND producer_actor = $${paramIndex++}`;
      params.push(filter.producer);
    }
    if (filter?.deprecated !== undefined) {
      query += ` AND deprecated = $${paramIndex++}`;
      params.push(filter.deprecated);
    }
    
    query += ' ORDER BY name';
    
    const result = await this.pool.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      description: row.description,
      payloadSchema: row.payload_schema,
      producerActor: row.producer_actor,
      version: row.version,
      deprecated: row.deprecated,
      replacedBy: row.replaced_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
  
  /**
   * Add a consumer for an event
   */
  async addConsumer(
    eventName: string, 
    consumerActor: string, 
    options?: { required?: boolean; filter?: any }
  ): Promise<void> {
    // Validate event exists
    const event = await this.getDefinition(eventName);
    if (!event) {
      throw new ActorError(
        `Event ${eventName} not found`,
        'EVENT_NOT_FOUND',
        {
          event: eventName,
          fix: 'Register the event before adding consumers',
        },
        404
      );
    }
    
    const consumer: EventConsumer = {
      eventName,
      consumerActor,
      required: options?.required ?? true,
      filterExpression: options?.filter,
    };
    
    // Validate consumer
    const validation = EventConsumerSchema.safeParse(consumer);
    if (!validation.success) {
      throw new ActorError(
        'Invalid consumer configuration',
        'INVALID_CONSUMER',
        {
          event: eventName,
          consumer: consumerActor,
          errors: validation.error.errors,
        },
        400
      );
    }
    
    await this.pool.query(
      `INSERT INTO event_consumers (event_name, consumer_actor, required, filter_expression)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_name, consumer_actor) DO UPDATE SET
       required = EXCLUDED.required,
       filter_expression = EXCLUDED.filter_expression`,
      [eventName, consumerActor, consumer.required, JSON.stringify(consumer.filterExpression)]
    );
    
    // Clear cache
    await this.clearCache(`consumers:${eventName}`);
  }
  
  /**
   * Remove a consumer for an event
   */
  async removeConsumer(eventName: string, consumerActor: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM event_consumers WHERE event_name = $1 AND consumer_actor = $2`,
      [eventName, consumerActor]
    );
    
    // Clear cache
    await this.clearCache(`consumers:${eventName}`);
  }
  
  /**
   * Get all consumers for an event
   */
  async getConsumers(eventName: string): Promise<string[]> {
    // Check cache first
    const cached = await this.getFromCache<string[]>(`consumers:${eventName}`);
    if (cached) return cached;
    
    const result = await this.pool.query(
      `SELECT consumer_actor FROM event_consumers WHERE event_name = $1`,
      [eventName]
    );
    
    const consumers = result.rows.map(row => row.consumer_actor);
    
    // Cache the result
    await this.setCache(`consumers:${eventName}`, consumers);
    
    return consumers;
  }
  
  /**
   * Validate event payload against schema
   */
  async validatePayload(eventName: string, payload: any): Promise<ValidationResult> {
    const definition = await this.getDefinition(eventName);
    if (!definition) {
      return {
        valid: false,
        errors: [{ path: '', message: `Event ${eventName} not found` }],
      };
    }
    
    // Compile and cache JSON Schema
    const schemaKey = `schema:${eventName}`;
    let validate = this.ajv.getSchema(schemaKey);
    
    if (!validate) {
      validate = this.ajv.compile(definition.payloadSchema);
      this.ajv.addSchema(definition.payloadSchema, schemaKey);
    }
    
    const valid = validate(payload);
    
    if (!valid && validate.errors) {
      return {
        valid: false,
        errors: validate.errors.map(err => ({
          path: err.instancePath,
          message: err.message || 'Validation failed',
        })),
      };
    }
    
    return { valid: true };
  }
  
  /**
   * Record event metric
   */
  async recordMetric(metric: Omit<EventMetric, 'id' | 'timestamp'>): Promise<void> {
    if (!this.config.metricsEnabled) return;
    
    // Validate metric
    const validation = EventMetricSchema.safeParse(metric);
    if (!validation.success) return; // Silently ignore invalid metrics
    
    await this.pool.query(
      `INSERT INTO event_metrics 
       (event_name, actor_id, direction, success, duration_ms, error_message, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        metric.eventName,
        metric.actorId,
        metric.direction,
        metric.success,
        metric.durationMs || null,
        metric.errorMessage || null,
        metric.correlationId || null,
      ]
    );
  }
  
  /**
   * Get event metrics
   */
  async getMetrics(
    eventName: string, 
    timeRange?: { start: Date; end: Date }
  ): Promise<EventMetric[]> {
    let query = `SELECT * FROM event_metrics WHERE event_name = $1`;
    const params: any[] = [eventName];
    let paramIndex = 2;
    
    if (timeRange) {
      query += ` AND timestamp >= $${paramIndex++} AND timestamp <= $${paramIndex++}`;
      params.push(timeRange.start, timeRange.end);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT 1000';
    
    const result = await this.pool.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      eventName: row.event_name,
      actorId: row.actor_id,
      direction: row.direction,
      success: row.success,
      timestamp: row.timestamp,
      durationMs: row.duration_ms,
      errorMessage: row.error_message,
      correlationId: row.correlation_id,
    }));
  }
  
  /**
   * Register an actor manifest
   */
  async registerActor(manifest: ActorManifest): Promise<void> {
    // Validate manifest
    const validation = ActorManifestSchema.safeParse(manifest);
    if (!validation.success) {
      throw new ActorError(
        'Invalid actor manifest',
        'INVALID_ACTOR_MANIFEST',
        {
          actor: manifest.actorName,
          errors: validation.error.errors,
        },
        400
      );
    }
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Upsert actor manifest
      await client.query(
        `INSERT INTO actor_manifests (actor_name, description, version, health_endpoint)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (actor_name) DO UPDATE SET
         description = EXCLUDED.description,
         version = EXCLUDED.version,
         health_endpoint = EXCLUDED.health_endpoint,
         updated_at = NOW()`,
        [manifest.actorName, manifest.description, manifest.version, manifest.healthEndpoint]
      );
      
      // Update consumer relationships
      for (const eventName of manifest.consumes) {
        await this.addConsumer(eventName, manifest.actorName);
      }
      
      await client.query('COMMIT');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get actor manifest
   */
  async getActorManifest(actorName: string): Promise<ActorManifest | null> {
    const result = await this.pool.query(
      `SELECT * FROM actor_manifests WHERE actor_name = $1`,
      [actorName]
    );
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    
    // Get events this actor produces and consumes
    const { produces, consumes } = await this.discoverEvents(actorName);
    
    return {
      id: row.id,
      actorName: row.actor_name,
      description: row.description,
      version: row.version,
      healthEndpoint: row.health_endpoint,
      produces,
      consumes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  
  /**
   * Discover events for an actor
   */
  async discoverEvents(actorName: string): Promise<{ produces: string[]; consumes: string[] }> {
    // Get events this actor produces
    const producesResult = await this.pool.query(
      `SELECT name FROM event_definitions WHERE producer_actor = $1`,
      [actorName]
    );
    
    // Get events this actor consumes
    const consumesResult = await this.pool.query(
      `SELECT event_name FROM event_consumers WHERE consumer_actor = $1`,
      [actorName]
    );
    
    return {
      produces: producesResult.rows.map(row => row.name),
      consumes: consumesResult.rows.map(row => row.event_name),
    };
  }
  
  /**
   * Add schema version
   */
  async addSchemaVersion(eventName: string, version: EventSchemaVersion): Promise<void> {
    await this.pool.query(
      `INSERT INTO event_schema_versions 
       (event_name, version, payload_schema, migration_script, breaking_change, change_description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        eventName,
        version.version,
        JSON.stringify(version.payloadSchema),
        version.migrationScript || null,
        version.breakingChange,
        version.changeDescription || null,
        version.createdBy || 'system',
      ]
    );
  }
  
  /**
   * Get schema history
   */
  async getSchemaHistory(eventName: string): Promise<EventSchemaVersion[]> {
    const result = await this.pool.query(
      `SELECT * FROM event_schema_versions WHERE event_name = $1 ORDER BY version DESC`,
      [eventName]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      eventName: row.event_name,
      version: row.version,
      payloadSchema: row.payload_schema,
      migrationScript: row.migration_script,
      breakingChange: row.breaking_change,
      changeDescription: row.change_description,
      createdAt: row.created_at,
      createdBy: row.created_by,
    }));
  }
  
  /**
   * Generate TypeScript types from catalog
   */
  async generateTypes(): Promise<string> {
    const events = await this.listEvents();
    let output = `// Generated Event Types from Registry\n// Generated at: ${new Date().toISOString()}\n\n`;
    
    // Group events by category
    const byCategory = events.reduce((acc, event) => {
      if (!acc[event.category]) acc[event.category] = [];
      acc[event.category].push(event);
      return acc;
    }, {} as Record<EventCategory, EventDefinition[]>);
    
    // Generate enums
    output += `// Event Names by Category\n`;
    for (const [category, categoryEvents] of Object.entries(byCategory)) {
      const enumName = `${category.charAt(0).toUpperCase() + category.slice(1)}Events`;
      output += `export enum ${enumName} {\n`;
      for (const event of categoryEvents) {
        output += `  ${event.name} = '${event.name}',\n`;
      }
      output += `}\n\n`;
    }
    
    // Generate payload interfaces (simplified - would need proper JSON Schema to TS conversion)
    output += `// Event Payload Types\n`;
    for (const event of events) {
      const interfaceName = `${event.name}Payload`;
      output += `export interface ${interfaceName} ${JSON.stringify(event.payloadSchema, null, 2)}\n\n`;
    }
    
    return output;
  }
  
  /**
   * Export full catalog
   */
  async exportCatalog(): Promise<EventCatalogEntry[]> {
    const result = await this.pool.query(
      `SELECT * FROM event_catalog_view ORDER BY name`
    );
    
    return result.rows.map(row => ({
      name: row.name,
      category: row.category,
      description: row.description,
      producerActor: row.producer_actor,
      consumers: [], // Would need separate query
      version: row.version,
      deprecated: row.deprecated,
      replacedBy: row.replaced_by,
      metrics: {
        producedLast24h: parseInt(row.produced_last_24h || '0'),
        consumedLast24h: parseInt(row.consumed_last_24h || '0'),
        failureRate: 0, // Would need calculation
      },
    }));
  }
  
  /**
   * Visualize dependencies
   */
  async visualizeDependencies(): Promise<any> {
    const result = await this.pool.query(
      `SELECT * FROM actor_dependencies_view`
    );
    
    // Convert to graph structure
    const nodes = new Set<string>();
    const edges: Array<{ source: string; target: string; events: string[] }> = [];
    
    for (const row of result.rows) {
      nodes.add(row.source_actor);
      nodes.add(row.target_actor);
      edges.push({
        source: row.source_actor,
        target: row.target_actor,
        events: row.events.split(', '),
      });
    }
    
    return {
      nodes: Array.from(nodes).map(name => ({ id: name, label: name })),
      edges: edges.map((edge, index) => ({
        id: `edge-${index}`,
        ...edge,
      })),
    };
  }
  
  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      if (this.redis) {
        await this.redis.ping();
      }
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Cache helpers
   */
  private async getFromCache<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    
    try {
      const cached = await this.redis.get(this.cachePrefix + key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn(`Cache get error for ${key}:`, error);
    }
    
    return null;
  }
  
  private async setCache(key: string, value: any): Promise<void> {
    if (!this.redis) return;
    
    try {
      const ttl = this.config.cacheTTL || 300000; // 5 minutes default
      await this.redis.set(
        this.cachePrefix + key,
        JSON.stringify(value),
        'PX',
        ttl
      );
    } catch (error) {
      console.warn(`Cache set error for ${key}:`, error);
    }
  }
  
  private async clearCache(pattern: string): Promise<void> {
    if (!this.redis) return;
    
    try {
      const keys = await this.redis.keys(this.cachePrefix + pattern + '*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.warn(`Cache clear error for ${pattern}:`, error);
    }
  }
  
  /**
   * Cleanup resources
   */
  async close(): Promise<void> {
    await this.pool.end();
    if (this.redis) {
      this.redis.disconnect();
    }
  }
}