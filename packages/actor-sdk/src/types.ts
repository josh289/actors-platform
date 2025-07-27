import { z } from 'zod';

export interface ActorConfig {
  name: string;
  domain: string;
  version: string;
  description?: string;
  capabilities?: string[];
  dependencies?: string[];
}

export interface ActorState {
  [key: string]: any;
}

export interface ActorContext {
  actorId: string;
  config: ActorConfig;
  runtime: ActorRuntime;
  logger: Logger;
}

export interface ActorRuntime {
  loadState(actorId: string): Promise<ActorState>;
  saveState(actorId: string, state: ActorState): Promise<void>;
  publish(event: Event): Promise<void>;
  subscribe(pattern: string, handler: EventHandler): void;
  ask<T = any>(actorName: string, event: Event): Promise<T>;
  tell(actorName: string, event: Event): Promise<void>;
  registerMetricsHandler?: (handler: () => Promise<any>) => void;
}

export interface Event {
  type: string;
  payload: any;
  metadata?: EventMetadata;
}

export interface EventMetadata {
  correlationId?: string;
  causationId?: string;
  timestamp?: number;
  source?: string;
  sourceActorId?: string;
  userId?: string;
  sessionId?: string;
}

export type EventHandler = (event: Event) => Promise<void>;

export interface Command extends Event {
  type: string;
  payload: any;
}

export interface Query extends Event {
  type: string;
  payload: any;
}

export interface Notification extends Event {
  type: string;
  payload: any;
}

export interface ActorResult {
  success: boolean;
  data?: any;
  error?: Error;
  events?: Event[];
}

export interface QueryResult {
  success: boolean;
  data?: any;
  error?: Error;
}

export interface Logger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: Error, meta?: any): void;
}

export interface CircuitBreakerConfig {
  threshold: number;
  timeout: number;
  resetTimeout: number;
}

export interface RetryConfig {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelay: number;
  maxDelay: number;
}

export const ActorConfigSchema = z.object({
  name: z.string(),
  domain: z.string(),
  version: z.string(),
  description: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
});

export const EventSchema = z.object({
  type: z.string(),
  payload: z.any(),
  metadata: z.object({
    correlationId: z.string().optional(),
    causationId: z.string().optional(),
    timestamp: z.number().optional(),
    source: z.string().optional(),
    sourceActorId: z.string().optional(),
    userId: z.string().optional(),
    sessionId: z.string().optional(),
  }).optional(),
});