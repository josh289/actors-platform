import { z } from 'zod';

/**
 * Event Registry Types and Interfaces
 * 
 * These types define the structure for the global event catalog
 * that manages all events in the actor system.
 */

// Event categories following actor pattern
export type EventCategory = 'command' | 'query' | 'notification';

// Event definition stored in the registry
export interface EventDefinition {
  id?: string;
  name: string;
  category: EventCategory;
  description: string;
  payloadSchema: JSONSchema; // JSON Schema for validation
  producerActor: string;
  version: number;
  deprecated?: boolean;
  replacedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// JSON Schema type (simplified)
export interface JSONSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: any;
}

// Event consumer configuration
export interface EventConsumer {
  id?: string;
  eventName: string;
  consumerActor: string;
  required: boolean;
  filterExpression?: any; // Optional filter for conditional consumption
  addedAt?: Date;
}

// Event metadata
export interface EventMetadata {
  eventName: string;
  key: string;
  value: string;
}

// Event metrics for monitoring
export interface EventMetric {
  id?: string;
  eventName: string;
  actorId: string;
  direction: 'produced' | 'consumed';
  success: boolean;
  timestamp: Date;
  durationMs?: number;
  errorMessage?: string;
  correlationId?: string;
}

// Actor manifest - what an actor produces and consumes
export interface ActorManifest {
  id?: string;
  actorName: string;
  description?: string;
  version?: string;
  healthEndpoint?: string;
  produces: string[]; // Event names this actor produces
  consumes: string[]; // Event names this actor consumes
  createdAt?: Date;
  updatedAt?: Date;
}

// Event dependency relationship
export interface EventDependency {
  id?: string;
  sourceEvent: string;
  targetEvent: string;
  dependencyType: 'triggers' | 'requires' | 'optional';
  description?: string;
}

// Schema version for event evolution
export interface EventSchemaVersion {
  id?: string;
  eventName: string;
  version: number;
  payloadSchema: JSONSchema;
  migrationScript?: string;
  breakingChange: boolean;
  changeDescription?: string;
  createdAt?: Date;
  createdBy?: string;
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    path: string;
    message: string;
  }>;
}

// Event catalog view
export interface EventCatalogEntry {
  name: string;
  category: EventCategory;
  description: string;
  producerActor: string;
  consumers: string[];
  version: number;
  deprecated: boolean;
  replacedBy?: string;
  metrics?: {
    producedLast24h: number;
    consumedLast24h: number;
    failureRate: number;
  };
}

// Registry configuration
export interface EventRegistryConfig {
  databaseUrl: string;
  cacheEnabled?: boolean;
  cacheTTL?: number; // Cache TTL in milliseconds
  metricsEnabled?: boolean;
  validationMode?: 'strict' | 'loose';
}

// Event Registry Interface
export interface IEventRegistry {
  // Event definition management
  register(event: EventDefinition): Promise<void>;
  update(eventName: string, updates: Partial<EventDefinition>): Promise<void>;
  deprecate(eventName: string, replacedBy?: string): Promise<void>;
  getDefinition(eventName: string): Promise<EventDefinition | null>;
  listEvents(filter?: { category?: EventCategory; producer?: string; deprecated?: boolean }): Promise<EventDefinition[]>;
  
  // Consumer management
  addConsumer(eventName: string, consumerActor: string, options?: { required?: boolean; filter?: any }): Promise<void>;
  removeConsumer(eventName: string, consumerActor: string): Promise<void>;
  getConsumers(eventName: string): Promise<string[]>;
  
  // Validation
  validatePayload(eventName: string, payload: any): Promise<ValidationResult>;
  
  // Metrics
  recordMetric(metric: Omit<EventMetric, 'id' | 'timestamp'>): Promise<void>;
  getMetrics(eventName: string, timeRange?: { start: Date; end: Date }): Promise<EventMetric[]>;
  
  // Actor management
  registerActor(manifest: ActorManifest): Promise<void>;
  getActorManifest(actorName: string): Promise<ActorManifest | null>;
  discoverEvents(actorName: string): Promise<{ produces: string[]; consumes: string[] }>;
  
  // Schema evolution
  addSchemaVersion(eventName: string, version: EventSchemaVersion): Promise<void>;
  getSchemaHistory(eventName: string): Promise<EventSchemaVersion[]>;
  
  // Utilities
  generateTypes(): Promise<string>;
  exportCatalog(): Promise<EventCatalogEntry[]>;
  visualizeDependencies(): Promise<any>; // Returns graph data structure
  healthCheck(): Promise<boolean>;
}

// Zod schemas for validation
export const EventCategorySchema = z.enum(['command', 'query', 'notification']);

export const EventDefinitionSchema = z.object({
  name: z.string().min(1).max(255),
  category: EventCategorySchema,
  description: z.string(),
  payloadSchema: z.object({}).passthrough(), // JSON Schema
  producerActor: z.string(),
  version: z.number().int().positive().default(1),
  deprecated: z.boolean().optional(),
  replacedBy: z.string().optional(),
});

export const EventConsumerSchema = z.object({
  eventName: z.string(),
  consumerActor: z.string(),
  required: z.boolean().default(true),
  filterExpression: z.any().optional(),
});

export const EventMetricSchema = z.object({
  eventName: z.string(),
  actorId: z.string(),
  direction: z.enum(['produced', 'consumed']),
  success: z.boolean(),
  durationMs: z.number().int().positive().optional(),
  errorMessage: z.string().optional(),
  correlationId: z.string().optional(),
});

export const ActorManifestSchema = z.object({
  actorName: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  healthEndpoint: z.string().url().optional(),
  produces: z.array(z.string()),
  consumes: z.array(z.string()),
});