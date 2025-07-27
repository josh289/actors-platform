import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  ActorConfig,
  ActorState,
  ActorContext,
  ActorResult,
  QueryResult,
  Event,
  Command,
  Query,
  Notification,
  EventHandler,
} from './types';
import { MonitoringCapabilities } from './monitoring';
import { SecurityCapabilities, SecurityEvent, SecurityEventData, SecurityEventQuery } from './security';
import { StateManagementHelpers } from './state-management';
import { CircuitBreaker } from './circuit-breaker';
import { RateLimiter, RateLimiterOptions } from './rate-limiter';
import { ComponentExportManager, ComponentExport, ComponentManifest } from './component-exports';
import { EventValidator } from './event-validator';
import { TestUtilities } from './test-utilities';
import { ActorError, StateValidationResult } from './actor-error';
import { IEventRegistry, ActorManifest } from './event-registry/types';
import { BaseMessage, MessageFactory, MessageResult } from './message';

/**
 * Enhanced Base Actor Class with Built-in Production Features
 * 
 * Core Features:
 * 1. Built-in monitoring and metrics
 * 2. Security event tracking
 * 3. Rate limiting primitives
 * 4. State management helpers
 * 5. Health checks
 * 6. Event validation
 * 7. Circuit breakers for external calls
 * 8. Component export management
 * 9. Testing utilities
 * 
 * Enhanced Features:
 * 10. AI-friendly error handling with structured context
 * 11. State validation and reconstruction with Zod schemas
 * 12. Lifecycle hooks (before/after command/query)
 * 13. Configuration management with validation
 * 14. Development mode with state tracking
 * 15. Enhanced test utilities with time travel
 * 16. Structured logging with context
 * 17. Error transformers for consistent error handling
 */
export abstract class Actor<TState extends ActorState = ActorState> {
  protected state: TState;
  protected context: ActorContext;
  private eventEmitter: EventEmitter;
  private eventHandlers: Map<string, EventHandler[]>;
  
  // Built-in production features
  protected monitoring: MonitoringCapabilities;
  protected security: SecurityCapabilities;
  protected stateHelpers: StateManagementHelpers<TState>;
  protected circuitBreakers: Map<string, CircuitBreaker>;
  protected rateLimiters: Map<string, RateLimiter>;
  protected componentExports: ComponentExportManager;
  protected eventValidator: EventValidator;
  protected testMode: boolean = false;
  
  // Enhanced features
  protected stateSchema?: z.ZodSchema<TState>;
  protected configSchema?: z.ZodSchema<any>;
  protected errorTransformers = new Map<string, (error: Error) => ActorError>();
  protected devMode = process.env.NODE_ENV === 'development';
  protected stateHistory: Array<{ timestamp: Date; operation: string; changes: any }> = [];
  protected logContext = new Map<string, any>();
  
  // Event Registry Integration
  protected static eventRegistry?: IEventRegistry;
  protected actorManifest?: ActorManifest;
  
  // Health check data
  private lastHealthCheck: Date;
  private healthStatus: HealthStatus = {
    healthy: true,
    checks: {},
    lastUpdated: new Date(),
  };
  
  // Timers for cleanup
  private timers: NodeJS.Timeout[] = [];

  constructor(context: ActorContext, initialState?: TState) {
    this.context = context;
    this.state = initialState || ({} as TState);
    this.eventEmitter = new EventEmitter();
    this.eventHandlers = new Map();
    this.lastHealthCheck = new Date();
    
    // Initialize built-in capabilities
    this.monitoring = new MonitoringCapabilities(this.context.config.name);
    this.security = new SecurityCapabilities();
    this.stateHelpers = new StateManagementHelpers<TState>();
    this.circuitBreakers = new Map();
    this.rateLimiters = new Map();
    this.componentExports = new ComponentExportManager();
    this.eventValidator = new EventValidator();
    
    // Set actor info for component exports
    this.componentExports.setActorInfo(this.context.config.name, this.context.config.version || '1.0.0');
    
    // Register default error transformers
    this.registerDefaultErrorTransformers();
    
    // Set up periodic health checks
    this.scheduleHealthChecks();
    
    // Set up metrics endpoint if enabled
    if (process.env.ENABLE_METRICS_ENDPOINT === 'true') {
      this.setupMetricsEndpoint();
    }
  }

  get config(): ActorConfig {
    return this.context.config;
  }

  get id(): string {
    return this.context.actorId;
  }

  /**
   * Set the global event registry for all actors
   */
  static setEventRegistry(registry: IEventRegistry): void {
    Actor.eventRegistry = registry;
    MessageFactory.setRegistry(registry);
  }

  /**
   * Get the global event registry
   */
  static getEventRegistry(): IEventRegistry | undefined {
    return Actor.eventRegistry;
  }

  /**
   * Declare the actor manifest (which events this actor handles/emits)
   * Subclasses should override this to declare their events
   */
  protected abstract getActorManifest(): ActorManifest;

  /**
   * Register event definitions with the registry
   * Subclasses can override this to register their event schemas
   */
  protected async registerEventDefinitions(): Promise<void> {
    // Default implementation does nothing
    // Subclasses should override to register their events
  }

  /**
   * Initialize actor with enhanced features
   */
  async initialize(): Promise<void> {
    this.setLogContext('operation', 'initialize');
    this.log.info(`Initializing actor ${this.config.name}`);
    
    try {
      // Load configuration
      await this.loadConfiguration();
      
      // Before state load hook
      await this.beforeStateLoad();
      
      // Load and validate state
      const savedState = await this.context.runtime.loadState(this.id);
      if (savedState) {
        this.state = await this.reconstructState(savedState);
      } else {
        this.state = await this.createDefaultState();
      }
      
      // After state load hook
      await this.afterStateLoad(this.state);

      // Initialize monitoring
      await this.monitoring.initialize();
      
      // Register actor with event registry if available
      if (Actor.eventRegistry) {
        try {
          // First register event definitions
          await this.registerEventDefinitions();
          
          // Then register the actor manifest
          this.actorManifest = this.getActorManifest();
          await Actor.eventRegistry.registerActor(this.actorManifest);
          this.log.info(`Actor ${this.config.name} registered with event registry`);
        } catch (error) {
          this.log.warn(`Failed to register actor with event registry: ${(error as Error).message}`);
          // Don't fail initialization if registry registration fails
        }
      }
      
      // Call subclass initialization
      await this.onInitialize();
      
      // Register default metrics
      this.registerDefaultMetrics();
      
      // Perform initial health check
      await this.performHealthCheck();
      
      this.log.info(`Actor ${this.config.name} initialized successfully`);
    } catch (error) {
      throw new ActorError(
        `Failed to initialize actor: ${(error as Error).message}`,
        'ACTOR_INIT_FAILED',
        {
          actor: this.config.name,
          state: 'initialization',
          fix: 'Check that createDefaultState() returns a valid state object and that any external dependencies are available',
          relatedFiles: [
            `src/actor.ts`,
            `src/state.ts`,
          ],
          helpfulCommands: [
            'npm test -- --testNamePattern="initialize"',
            'npm run typecheck',
          ],
          documentation: 'See actor initialization docs at /docs/actor-lifecycle.md',
          exampleCode: `
protected async createDefaultState(): Promise<MyState> {
  return {
    users: new Map(),
    sessions: new Map(),
    config: {
      sessionTimeout: 3600000,
    },
  };
}`,
        },
        500,
        'Service initialization failed'
      );
    } finally {
      this.clearLogContext();
    }
  }

  /**
   * Enhanced command handling with monitoring and validation
   */
  async handle(event: Command): Promise<ActorResult> {
    const startTime = Date.now();
    const correlationId = event.metadata?.correlationId || uuidv4();
    const timer = this.monitoring.startTimer(`command_${event.type}_duration`);
    
    this.setLogContext('operation', 'command');
    this.setLogContext('commandType', event.type);
    this.setLogContext('correlationId', correlationId);
    
    this.log.info(`Handling command ${event.type}`, {
      payload: event.payload,
    });

    try {
      // Before command hook
      await this.beforeCommand(event);
      
      // Validate event with registry if available, otherwise use local validator
      let validationResult: { valid: boolean; errors: string[] };
      if (Actor.eventRegistry) {
        const registryValidation = await Actor.eventRegistry.validatePayload(event.type, event.payload);
        validationResult = {
          valid: registryValidation.valid,
          errors: registryValidation.errors?.map(e => `${e.path}: ${e.message}`) || []
        };
      } else {
        validationResult = await this.eventValidator.validateCommand(event);
      }
      
      if (!validationResult.valid) {
        this.monitoring.incrementCounter(`command_${event.type}_validation_failed`);
        throw new ActorError(
          'Command validation failed',
          'COMMAND_VALIDATION_FAILED',
          {
            actor: this.config.name,
            command: event.type,
            fix: `Command payload validation failed:\n${validationResult.errors.join('\n')}`,
            relatedFiles: [
              'src/events.ts',
              'src/actor.ts',
            ],
            helpfulCommands: [
              `npm test -- --testNamePattern="${event.type}"`,
              'npm run validate:events',
            ],
            documentation: `See command schema for ${event.type}`,
            exampleCode: this.getCommandExample(event.type),
          },
          400,
          'Invalid request'
        );
      }
      
      // Check rate limits if configured
      if (this.rateLimiters.has(event.type)) {
        const rateLimiter = this.rateLimiters.get(event.type)!;
        const allowed = await rateLimiter.allow(event.metadata?.userId || 'anonymous');
        if (!allowed) {
          this.monitoring.incrementCounter(`command_${event.type}_rate_limited`);
          throw new ActorError(
            'Rate limit exceeded',
            'RATE_LIMIT_EXCEEDED',
            {
              actor: this.config.name,
              command: event.type,
              fix: 'Wait before retrying. Rate limits are configured per command.',
              helpfulCommands: [
                `await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute`,
              ],
              documentation: 'Rate limiting is configured in actor initialization',
            },
            429,
            'Too many requests. Please try again later.'
          );
        }
      }
      
      // Execute command
      const result = await this.onCommand(event);
      
      // After command hook
      await this.afterCommand(event, result);
      
      // Track state changes in dev mode
      if (this.devMode) {
        this.trackStateChanges('command', event.type);
      }
      
      // Record success metrics
      this.monitoring.incrementCounter(`command_${event.type}_success`);
      
      // Emit events if any (graceful degradation on failure)
      if (result.events && result.events.length > 0) {
        for (const emittedEvent of result.events) {
          try {
            await this.emit(emittedEvent);
          } catch (error) {
            this.log.warn(`Failed to emit event ${emittedEvent.type}`, error as Error);
            // Don't fail the command if event emission fails
          }
        }
      }

      // Save state (graceful degradation on failure)
      try {
        await this.saveState();
      } catch (error) {
        this.log.warn('Failed to save state after command', error as Error);
        // Don't fail the command if state save fails
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.monitoring.incrementCounter(`command_${event.type}_error`);
      
      // Transform error
      const transformedError = this.transformError(error as Error, {
        type: 'command',
        event,
      });
      
      // Call error hook
      await this.onError(transformedError, { type: 'command', event });
      
      // Track security events for certain error types
      if (this.isSecurityError(transformedError)) {
        this.trackSecurityEvent({
          type: 'command_security_error',
          severity: 'high',
          details: {
            command: event.type,
            error: transformedError.message,
          },
        });
      }
      
      this.log.error(`Command ${event.type} failed`, transformedError, {
        duration,
        aiContext: transformedError instanceof ActorError ? transformedError.toAIFormat() : undefined,
      });

      return {
        success: false,
        error: transformedError,
      };
    } finally {
      timer();
      this.clearLogContext();
    }
  }

  /**
   * Enhanced query handling with caching and monitoring
   */
  async query(query: Query): Promise<QueryResult> {
    const startTime = Date.now();
    const correlationId = query.metadata?.correlationId || uuidv4();
    const timer = this.monitoring.startTimer(`query_${query.type}_duration`);
    
    this.context.logger.debug(`Processing query ${query.type}`, {
      correlationId,
      payload: query.payload,
    });

    try {
      // Validate query with registry if available, otherwise use local validator
      let validationResult: { valid: boolean; errors: string[] };
      if (Actor.eventRegistry) {
        const registryValidation = await Actor.eventRegistry.validatePayload(query.type, query.payload);
        validationResult = {
          valid: registryValidation.valid,
          errors: registryValidation.errors?.map(e => `${e.path}: ${e.message}`) || []
        };
      } else {
        validationResult = await this.eventValidator.validateQuery(query);
      }
      
      if (!validationResult.valid) {
        this.monitoring.incrementCounter(`query_${query.type}_validation_failed`);
        return {
          success: false,
          error: new Error(`Validation failed: ${validationResult.errors.join(', ')}`),
        };
      }
      
      const result = await this.onQuery(query);
      
      this.monitoring.incrementCounter(`query_${query.type}_success`);
      
      const duration = Date.now() - startTime;
      this.context.logger.debug(`Query ${query.type} completed`, {
        correlationId,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.monitoring.incrementCounter(`query_${query.type}_error`);
      
      this.context.logger.error(`Query ${query.type} failed`, error as Error, {
        correlationId,
        duration,
      });

      return {
        success: false,
        error: error as Error,
      };
    } finally {
      timer();
    }
  }

  /**
   * Publish notification with monitoring
   */
  async publish(notification: Notification): Promise<void> {
    const enrichedNotification = {
      ...notification,
      metadata: {
        ...notification.metadata,
        source: this.config.name,
        timestamp: Date.now(),
        actorId: this.id,
      },
    };

    await this.context.runtime.publish(enrichedNotification);
    
    this.monitoring.incrementCounter(`notification_${notification.type}_published`);
    
    this.context.logger.debug(`Published notification ${notification.type}`, {
      payload: notification.payload,
    });
  }

  /**
   * Subscribe to events with automatic error handling
   */
  on(eventType: string, handler: EventHandler): void {
    const wrappedHandler = async (event: Event) => {
      const timer = this.monitoring.startTimer(`event_handler_${eventType}_duration`);
      try {
        await handler(event);
        this.monitoring.incrementCounter(`event_handler_${eventType}_success`);
      } catch (error) {
        this.monitoring.incrementCounter(`event_handler_${eventType}_error`);
        this.context.logger.error(`Event handler for ${eventType} failed`, error as Error);
        throw error;
      } finally {
        timer();
      }
    };
    
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    
    this.eventHandlers.get(eventType)!.push(wrappedHandler);
    this.context.runtime.subscribe(eventType, wrappedHandler);
  }

  /**
   * Enhanced ask pattern with circuit breaker
   */
  protected async ask<T = any>(actorName: string, event: Event): Promise<T> {
    const breaker = this.getOrCreateCircuitBreaker(actorName);
    
    return breaker.execute(async () => {
      const timer = this.monitoring.startTimer(`ask_${actorName}_duration`);
      try {
        const result = await this.context.runtime.ask<T>(actorName, {
          ...event,
          metadata: {
            ...event.metadata,
            source: this.config.name,
            sourceActorId: this.id,
          },
        });
        this.monitoring.incrementCounter(`ask_${actorName}_success`);
        return result;
      } catch (error) {
        this.monitoring.incrementCounter(`ask_${actorName}_error`);
        throw error;
      } finally {
        timer();
      }
    });
  }

  /**
   * Enhanced tell pattern with monitoring
   */
  protected async tell(actorName: string, event: Event): Promise<void> {
    const timer = this.monitoring.startTimer(`tell_${actorName}_duration`);
    try {
      await this.context.runtime.tell(actorName, {
        ...event,
        metadata: {
          ...event.metadata,
          source: this.config.name,
          sourceActorId: this.id,
        },
      });
      this.monitoring.incrementCounter(`tell_${actorName}_success`);
    } catch (error) {
      this.monitoring.incrementCounter(`tell_${actorName}_error`);
      throw error;
    } finally {
      timer();
    }
  }

  /**
   * Emit event with monitoring
   */
  protected async emit(event: Event): Promise<void> {
    const startTime = Date.now();
    const enrichedEvent = {
      ...event,
      metadata: {
        ...event.metadata,
        source: this.config.name,
        sourceActorId: this.id,
        timestamp: Date.now(),
      },
    };

    try {
      await this.context.runtime.publish(enrichedEvent);
      this.monitoring.incrementCounter(`event_${event.type}_emitted`);
      
      // Record metric with registry if available
      if (Actor.eventRegistry) {
        await Actor.eventRegistry.recordMetric({
          eventName: event.type,
          actorId: this.id,
          direction: 'produced',
          success: true,
          durationMs: Date.now() - startTime,
          correlationId: event.metadata?.correlationId,
        });
      }
    } catch (error) {
      // Record failure metric with registry if available
      if (Actor.eventRegistry) {
        await Actor.eventRegistry.recordMetric({
          eventName: event.type,
          actorId: this.id,
          direction: 'produced',
          success: false,
          durationMs: Date.now() - startTime,
          errorMessage: (error as Error).message,
          correlationId: event.metadata?.correlationId,
        });
      }
      throw error;
    }
  }

  /**
   * Process an incoming message using the BaseMessage system
   * This provides a unified interface for handling commands, queries, and notifications
   */
  async processMessage(message: BaseMessage): Promise<MessageResult> {
    try {
      // Check if this actor can handle the message
      const canHandle = await message.canBeHandledBy(this.config.name);
      if (!canHandle) {
        throw new ActorError(
          `Actor ${this.config.name} cannot handle message ${message.type}`,
          'MESSAGE_NOT_HANDLED',
          {
            actor: this.config.name,
            message: message.type,
            category: message.getCategory(),
            fix: 'Check actor manifest to ensure this message type is registered',
            helpfulCommands: [
              `await Actor.eventRegistry?.getConsumers('${message.type}')`,
            ],
          },
          400
        );
      }
      
      // Process the message through the appropriate handler
      return await message.process(this);
    } catch (error) {
      this.log.error(`Failed to process message ${message.type}:`, error as Error);
      throw error;
    }
  }

  /**
   * Helper method to process an event through the message system
   */
  async processEvent(event: Event): Promise<MessageResult> {
    const message = await BaseMessage.fromEvent(event);
    return this.processMessage(message);
  }

  /**
   * Save state with retry logic
   */
  protected async saveState(): Promise<void> {
    const breaker = this.getOrCreateCircuitBreaker('state_save');
    
    await breaker.execute(async () => {
      const timer = this.monitoring.startTimer('state_save_duration');
      try {
        await this.context.runtime.saveState(this.id, this.state);
        this.monitoring.incrementCounter('state_save_success');
      } catch (error) {
        this.monitoring.incrementCounter('state_save_error');
        throw error;
      } finally {
        timer();
      }
    });
  }

  /**
   * Get or create a circuit breaker for external calls
   */
  protected getOrCreateCircuitBreaker(name: string): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, new CircuitBreaker({
        name,
        failureThreshold: 5,
        resetTimeout: 60000, // 1 minute
        halfOpenRequests: 3,
      }));
    }
    return this.circuitBreakers.get(name)!;
  }

  /**
   * Create a rate limiter for a specific operation
   */
  protected createRateLimiter(name: string, options: RateLimiterOptions): RateLimiter {
    const limiter = new RateLimiter(options);
    this.rateLimiters.set(name, limiter);
    return limiter;
  }

  /**
   * Track a security event
   */
  protected trackSecurityEvent(event: SecurityEventData): void {
    this.security.trackEvent({
      ...event,
      actorId: this.id,
      actorName: this.config.name,
    });
    
    this.monitoring.incrementCounter(`security_event_${event.type}`, {
      severity: event.severity,
    });
  }

  /**
   * Register component export
   */
  protected registerComponentExport(component: ComponentExport): void {
    this.componentExports.register(component);
  }

  /**
   * Get component manifest
   */
  getComponentManifest(): ComponentManifest {
    return this.componentExports.getManifest();
  }

  /**
   * Perform health check
   */
  async performHealthCheck(): Promise<HealthStatus> {
    const checks: HealthCheckResult = {};
    
    // Basic health checks
    checks.state = {
      healthy: this.state !== null && this.state !== undefined,
      message: 'State is initialized',
    };
    
    checks.runtime = {
      healthy: this.context.runtime !== null,
      message: 'Runtime is available',
    };
    
    // Circuit breaker status
    const breakerStatuses: any = {};
    this.circuitBreakers.forEach((breaker, name) => {
      breakerStatuses[name] = breaker.getStatus();
    });
    checks.circuitBreakers = {
      healthy: Object.values(breakerStatuses).every((s: any) => s.state !== 'open'),
      message: `Circuit breakers: ${JSON.stringify(breakerStatuses)}`,
    };
    
    // Custom health checks from subclass
    const customChecks = await this.onHealthCheck();
    Object.assign(checks, customChecks);
    
    // Overall health
    const healthy = Object.values(checks).every(check => check.healthy);
    
    this.healthStatus = {
      healthy,
      checks,
      lastUpdated: new Date(),
    };
    
    this.lastHealthCheck = new Date();
    
    // Update metrics
    this.monitoring.setGauge('health_status', healthy ? 1 : 0);
    
    return this.healthStatus;
  }

  /**
   * Get current health status
   */
  getHealthStatus(): HealthStatus {
    return this.healthStatus;
  }

  /**
   * Get monitoring metrics
   */
  async getMetrics(): Promise<any> {
    return this.monitoring.getMetrics();
  }

  /**
   * Get security events
   */
  getSecurityEvents(options?: SecurityEventQuery): SecurityEvent[] {
    return this.security.getEvents(options);
  }

  /**
   * Enable test mode for testing utilities
   */
  enableTestMode(): void {
    this.testMode = true;
    this.monitoring.enableTestMode();
    this.security.enableTestMode();
  }

  /**
   * Get test utilities (only available in test mode)
   */
  getTestUtilities(): TestUtilities | null {
    if (!this.testMode) {
      return null;
    }
    return new TestUtilities(this);
  }

  /**
   * Schedule periodic health checks
   */
  private scheduleHealthChecks(): void {
    const timer = setInterval(async () => {
      await this.performHealthCheck();
    }, 60000); // Every minute
    this.timers.push(timer);
  }

  /**
   * Setup metrics endpoint
   */
  private setupMetricsEndpoint(): void {
    if (this.context.runtime.registerMetricsHandler) {
      this.context.runtime.registerMetricsHandler(async () => {
        return this.monitoring.getMetrics();
      });
    }
  }

  /**
   * Register default metrics
   */
  private registerDefaultMetrics(): void {
    // Command metrics
    this.monitoring.createCounter('commands_total', 'Total commands processed');
    this.monitoring.createCounter('commands_success', 'Successful commands');
    this.monitoring.createCounter('commands_error', 'Failed commands');
    this.monitoring.createHistogram('command_duration', 'Command processing duration');
    
    // Query metrics
    this.monitoring.createCounter('queries_total', 'Total queries processed');
    this.monitoring.createCounter('queries_success', 'Successful queries');
    this.monitoring.createCounter('queries_error', 'Failed queries');
    this.monitoring.createHistogram('query_duration', 'Query processing duration');
    
    // State metrics
    this.monitoring.createCounter('state_saves_total', 'Total state saves');
    this.monitoring.createCounter('state_saves_error', 'Failed state saves');
    this.monitoring.createHistogram('state_save_duration', 'State save duration');
    
    // Health metrics
    this.monitoring.createGauge('health_status', 'Actor health status (1=healthy, 0=unhealthy)');
    
    // Security metrics
    this.monitoring.createCounter('security_events_total', 'Total security events');
  }

  /**
   * Check if error is security-related
   */
  private isSecurityError(error: Error): boolean {
    const securityKeywords = [
      'unauthorized',
      'forbidden',
      'authentication',
      'permission',
      'access denied',
      'invalid token',
    ];
    
    const message = error.message.toLowerCase();
    return securityKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Shutdown with cleanup
   */
  async shutdown(): Promise<void> {
    this.context.logger.info(`Shutting down actor ${this.config.name}`);
    
    // Clear all timers
    this.timers.forEach(timer => clearInterval(timer));
    this.timers = [];
    
    // Perform final state save
    try {
      await this.saveState();
    } catch (error) {
      this.context.logger.error('Failed to save state during shutdown', error as Error);
    }
    
    // Export final metrics
    if (process.env.EXPORT_METRICS_ON_SHUTDOWN === 'true') {
      const metrics = await this.monitoring.getMetrics();
      this.context.logger.info('Final metrics', { metrics });
    }
    
    // Export security events
    if (process.env.EXPORT_SECURITY_EVENTS_ON_SHUTDOWN === 'true') {
      const events = this.security.getEvents();
      this.context.logger.info('Security events', { count: events.length });
    }
    
    // Call subclass shutdown
    await this.onShutdown();
    
    // Cleanup
    this.eventHandlers.clear();
    this.eventEmitter.removeAllListeners();
    this.circuitBreakers.forEach(breaker => breaker.reset());
    this.rateLimiters.clear();
    
    this.context.logger.info(`Actor ${this.config.name} shut down`);
  }

  // Enhanced Actor Methods

  /**
   * Create default state - override in subclasses if using state validation
   */
  protected async createDefaultState(): Promise<TState> {
    return this.state; // Default behavior - return current state
  }

  /**
   * Reconstruct state from saved data with validation
   */
  protected async reconstructState(rawState: any): Promise<TState> {
    this.setLogContext('operation', 'reconstructState');
    
    if (!rawState || typeof rawState !== 'object') {
      this.log.warn('Invalid state data, using default state', { rawState });
      return this.createDefaultState();
    }
    
    // First reconstruct complex types (Maps, Sets, etc)
    const reconstructed = this.reconstructComplexTypes(rawState);
    
    // If no schema, return reconstructed state
    if (!this.stateSchema) {
      return reconstructed;
    }
    
    // Validate reconstructed state with schema
    const validationResult = await this.validateState(reconstructed);
    
    if (!validationResult.valid) {
      const errorDetails = validationResult.errors!.map(e => 
        `  - ${e.path}: ${e.message} (expected ${e.expected}, got ${e.received})`
      ).join('\n');
      
      throw new ActorError(
        'State validation failed',
        'STATE_VALIDATION_FAILED',
        {
          actor: this.config.name,
          state: 'reconstruction',
          fix: `State structure doesn't match schema. Issues found:\n${errorDetails}`,
          relatedFiles: [
            'src/state.ts',
            'src/actor.ts',
          ],
          helpfulCommands: [
            'npm test -- --testNamePattern="state"',
            'npm run build',
          ],
          documentation: 'Define stateSchema in your actor for automatic validation',
          exampleCode: validationResult.errors?.[0]?.fix,
        },
        500,
        'Service state corrupted'
      );
    }
    
    return validationResult.data!;
  }

  /**
   * Validate state against schema
   */
  protected async validateState(state: any): Promise<StateValidationResult<TState>> {
    if (!this.stateSchema) {
      return { valid: true, data: state as TState };
    }
    
    try {
      const parsed = await this.stateSchema.parseAsync(state);
      return { valid: true, data: parsed };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
          expected: this.getExpectedType(e),
          received: typeof e.received === 'object' ? JSON.stringify(e.received) : String(e.received),
          fix: this.getSuggestedFix(e),
        }));
        
        return { valid: false, errors };
      }
      throw error;
    }
  }

  /**
   * Get expected type from Zod error
   */
  private getExpectedType(error: z.ZodIssue): string {
    if (error.code === 'invalid_type') {
      return error.expected;
    }
    return 'unknown';
  }

  /**
   * Get suggested fix for Zod error
   */
  private getSuggestedFix(error: z.ZodIssue): string {
    if (error.code === 'invalid_type') {
      if (error.expected === 'Map' && error.received === 'object') {
        return `Convert object to Map: new Map(Object.entries(${error.path.join('.')}))`;
      }
      if (error.expected === 'array' && error.received === 'object') {
        return `Convert object to array: Object.values(${error.path.join('.')})`;
      }
    }
    return `Check the type definition for ${error.path.join('.')}`;
  }

  /**
   * Reconstruct complex types like Maps and Sets
   */
  protected reconstructComplexTypes(rawState: any): TState {
    const reconstructed = { ...rawState };
    
    // Look for objects that should be Maps (have entries that look like [key, value])
    for (const [key, value] of Object.entries(reconstructed)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Check if it looks like a serialized Map
        const keys = Object.keys(value);
        if (keys.length > 0 && this.looksLikeMap(key)) {
          reconstructed[key] = new Map(Object.entries(value));
        }
      }
    }
    
    return reconstructed as TState;
  }

  /**
   * Heuristic to determine if a property name suggests it should be a Map
   */
  private looksLikeMap(key: string): boolean {
    const mapIndicators = ['map', 'Map', 'dict', 'Dict', 'lookup', 'Lookup', 'byId', 'ById', 'users', 'sessions', 'roles', 'permissions'];
    return mapIndicators.some(indicator => key.includes(indicator));
  }

  /**
   * Load and validate configuration
   */
  protected async loadConfiguration(): Promise<void> {
    const rawConfig = this.context.config.actorConfig || {};
    
    if (this.configSchema) {
      try {
        const parsed = await this.configSchema.parseAsync(rawConfig);
        // Merge validated config into context config
        Object.assign(this.context.config, parsed);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ActorError(
            'Invalid actor configuration',
            'CONFIG_VALIDATION_FAILED',
            {
              actor: this.config.name,
              state: 'configuration',
              fix: `Configuration validation failed:\n${error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`).join('\n')}`,
              relatedFiles: [`actor.config.json`],
              helpfulCommands: ['npm run validate:config'],
              documentation: 'See configuration schema in actor documentation',
            },
            500,
            'Service configuration invalid'
          );
        }
        throw error;
      }
    } else {
      // Merge raw config into context config
      Object.assign(this.context.config, rawConfig);
    }
  }

  /**
   * Transform errors to AI-friendly format
   */
  protected transformError(error: Error, context: { type: string; event: Event }): Error {
    // Check if already an ActorError
    if (error instanceof ActorError) {
      return error;
    }
    
    // Check registered transformers
    for (const [pattern, transformer] of this.errorTransformers) {
      if (error.message.toLowerCase().includes(pattern) || error.name.toLowerCase().includes(pattern)) {
        return transformer(error);
      }
    }
    
    // Default transformation
    return new ActorError(
      error.message,
      'UNKNOWN_ERROR',
      {
        actor: this.config.name,
        command: context.type === 'command' ? context.event.type : undefined,
        query: context.type === 'query' ? context.event.type : undefined,
        fix: 'Check the error message and stack trace. This is an unhandled error.',
        relatedFiles: [
          'src/actor.ts',
        ],
        helpfulCommands: [
          `grep -r "${error.message.substring(0, 20)}" src/`,
          'npm test',
          'npm run lint',
        ],
      },
      500,
      'An unexpected error occurred'
    );
  }

  /**
   * Register default error transformers
   */
  protected registerDefaultErrorTransformers(): void {
    // Database errors
    this.registerErrorTransformer('econnrefused', (error) => new ActorError(
      'Database connection failed',
      'DB_CONNECTION_FAILED',
      {
        actor: this.context.config.name,
        state: 'database',
        fix: 'Check that the database is running and accessible. Verify connection string.',
        helpfulCommands: [
          'docker ps | grep postgres',
          'docker logs postgres',
          'echo $DATABASE_URL',
        ],
        documentation: 'See database setup guide',
      },
      503,
      'Service temporarily unavailable'
    ));
    
    // Validation errors
    this.registerErrorTransformer('validation', (error) => new ActorError(
      error.message,
      'VALIDATION_ERROR',
      {
        actor: this.context.config.name,
        fix: 'Check the request payload against the schema',
        documentation: 'See API documentation for correct payload format',
      },
      400,
      'Invalid request data'
    ));
    
    // Not found errors
    this.registerErrorTransformer('not found', (error) => new ActorError(
      error.message,
      'NOT_FOUND',
      {
        actor: this.context.config.name,
        fix: 'Verify the resource exists before attempting this operation',
      },
      404,
      'Resource not found'
    ));
  }

  /**
   * Register error transformer
   */
  protected registerErrorTransformer(pattern: string, transformer: (error: Error) => ActorError): void {
    this.errorTransformers.set(pattern.toLowerCase(), transformer);
  }

  /**
   * Get command example for error messages
   */
  protected getCommandExample(commandType: string): string {
    return `
await actor.handle({
  type: '${commandType}',
  payload: {
    // Add required fields here
  },
});`;
  }

  /**
   * Track state changes for debugging
   */
  protected trackStateChanges(operation: string, details: string): void {
    if (!this.devMode) return;
    
    const snapshot = this.createStateSnapshot();
    this.stateHistory.push({
      timestamp: new Date(),
      operation: `${operation}: ${details}`,
      changes: snapshot,
    });
    
    // Keep only last 100 changes
    if (this.stateHistory.length > 100) {
      this.stateHistory = this.stateHistory.slice(-100);
    }
  }

  /**
   * Create a snapshot of current state
   */
  protected createStateSnapshot(): any {
    // Simple snapshot - override for more sophisticated diffing
    return {
      summary: `State snapshot at ${new Date().toISOString()}`,
      size: JSON.stringify(this.state).length,
    };
  }

  /**
   * Enhanced logging with context
   */
  protected log = {
    info: (message: string, data?: any) => {
      this.context.logger.info(message, {
        ...Object.fromEntries(this.logContext),
        ...data,
      });
    },
    warn: (message: string, error?: Error, data?: any) => {
      this.context.logger.warn(message, error || new Error(message), {
        ...Object.fromEntries(this.logContext),
        ...data,
      });
    },
    error: (message: string, error: Error, data?: any) => {
      this.context.logger.error(message, error, {
        ...Object.fromEntries(this.logContext),
        ...data,
      });
    },
    debug: (message: string, data?: any) => {
      this.context.logger.debug(message, {
        ...Object.fromEntries(this.logContext),
        ...data,
      });
    },
  };

  /**
   * Set logging context
   */
  protected setLogContext(key: string, value: any): void {
    this.logContext.set(key, value);
  }

  /**
   * Clear logging context
   */
  protected clearLogContext(): void {
    this.logContext.clear();
  }

  /**
   * Get introspection data for development
   */
  getIntrospection(): any {
    return {
      actor: this.config.name,
      version: this.config.version || '1.0.0',
      state: this.devMode ? this.state : '[hidden in production]',
      metrics: this.monitoring.getMetrics(),
      health: this.getHealthStatus(),
      componentManifest: this.getComponentManifest(),
      registeredCommands: Array.from(this.eventValidator.commands?.keys() || []),
      registeredQueries: Array.from(this.eventValidator.queries?.keys() || []),
      rateLimiters: Array.from(this.rateLimiters.keys()),
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([name, breaker]) => ({
        name,
        status: breaker.getStatus(),
      })),
      stateHistory: this.devMode ? this.stateHistory.slice(-10) : '[hidden in production]',
      errorTransformers: Array.from(this.errorTransformers.keys()),
    };
  }

  /**
   * Lifecycle hooks - override in subclasses
   */
  protected async beforeStateLoad(): Promise<void> {}
  protected async afterStateLoad(state: TState): Promise<void> {}
  protected async beforeCommand(command: Command): Promise<void> {}
  protected async afterCommand(command: Command, result: ActorResult): Promise<void> {}
  protected async beforeQuery(query: Query): Promise<void> {}
  protected async afterQuery(query: Query, result: QueryResult): Promise<void> {}
  protected async onError(error: Error, context: { type: string; event: Event }): Promise<void> {}
  protected async onConfigurationReload(): Promise<void> {}

  /**
   * Abstract methods to be implemented by subclasses
   */
  protected abstract onInitialize(): Promise<void>;
  protected abstract onCommand(command: Command): Promise<ActorResult>;
  protected abstract onQuery(query: Query): Promise<QueryResult>;
  
  /**
   * Optional methods that can be overridden
   */
  protected async onShutdown(): Promise<void> {
    // Override in subclasses if needed
  }
  
  protected async onHealthCheck(): Promise<HealthCheckResult> {
    // Override in subclasses to add custom health checks
    return {};
  }
}

// Type definitions for enhanced features
interface HealthStatus {
  healthy: boolean;
  checks: HealthCheckResult;
  lastUpdated: Date;
}

interface HealthCheckResult {
  [key: string]: {
    healthy: boolean;
    message: string;
  };
}

