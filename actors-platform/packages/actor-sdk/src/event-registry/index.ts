export * from './types';
export * from './postgres-registry';

// Re-export main interfaces for convenience
export type { 
  IEventRegistry,
  EventDefinition,
  EventCategory,
  EventConsumer,
  EventMetric,
  ActorManifest,
  ValidationResult,
  EventCatalogEntry,
  EventRegistryConfig,
} from './types';