# Base Actor Enhancement Recommendations

Based on learnings from implementing the authentication actor, here are recommended enhancements for the base Actor class:

## 1. State Management Enhancements

### State Validation and Reconstruction
```typescript
export abstract class Actor<TState extends ActorState = ActorState> {
  // Add state schema validation
  protected abstract stateSchema?: z.ZodSchema<TState>;
  
  // Enhanced initialize with state validation
  async initialize(): Promise<void> {
    const savedState = await this.context.runtime.loadState(this.id);
    
    if (savedState) {
      // Validate and reconstruct state
      this.state = await this.reconstructState(savedState);
    } else {
      this.state = await this.createDefaultState();
    }
  }
  
  // Helper to reconstruct complex types like Maps
  protected async reconstructState(rawState: any): Promise<TState> {
    if (this.stateSchema) {
      // Use zod to parse and validate
      const parsed = await this.stateSchema.safeParseAsync(rawState);
      if (!parsed.success) {
        this.context.logger.warn('State validation failed, using default', parsed.error);
        return this.createDefaultState();
      }
      return parsed.data;
    }
    return rawState as TState;
  }
  
  // Abstract method for default state
  protected abstract createDefaultState(): TState | Promise<TState>;
}
```

## 2. Enhanced Error Handling

### Error Context and Transformation
```typescript
export class ActorError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any,
    public userMessage?: string
  ) {
    super(message);
  }
}

export abstract class Actor<TState extends ActorState = ActorState> {
  // Error transformation map
  protected errorTransformers = new Map<string, (error: Error) => ActorError>();
  
  // Register error transformers
  protected registerErrorTransformer(pattern: string, transformer: (error: Error) => ActorError) {
    this.errorTransformers.set(pattern, transformer);
  }
  
  // Transform errors before returning
  protected transformError(error: Error): Error {
    for (const [pattern, transformer] of this.errorTransformers) {
      if (error.message.includes(pattern)) {
        return transformer(error);
      }
    }
    return error;
  }
}
```

## 3. Testing Utilities

### Built-in Test Helpers
```typescript
export abstract class Actor<TState extends ActorState = ActorState> {
  // Test mode enhancements
  enableTestMode(): void {
    this.testMode = true;
    // Disable rate limiting
    this.rateLimiters.clear();
    // Use in-memory state
    this.useInMemoryState = true;
    // Speed up timers
    this.timerSpeedMultiplier = 100;
  }
  
  // Test data generators
  getTestUtilities(): TestUtilities {
    return {
      createMockCommand: (type: string, payload: any) => ({
        type,
        payload,
        metadata: {
          correlationId: 'test-correlation',
          timestamp: Date.now(),
          source: 'test',
        },
      }),
      
      createMockQuery: (type: string, payload: any) => ({
        type,
        payload,
        metadata: {
          correlationId: 'test-correlation',
          timestamp: Date.now(),
        },
      }),
      
      // State snapshot for testing
      snapshotState: () => structuredClone(this.state),
      restoreState: (snapshot: TState) => { this.state = snapshot; },
      
      // Time manipulation
      advanceTime: (ms: number) => {
        if (this.testMode) {
          this.mockTime += ms;
        }
      },
    };
  }
}
```

## 4. Development Experience

### Better Debugging and Introspection
```typescript
export abstract class Actor<TState extends ActorState = ActorState> {
  // Development mode with enhanced logging
  protected devMode = process.env.NODE_ENV === 'development';
  
  // State change tracking
  private stateHistory: Array<{ timestamp: Date; changes: any }> = [];
  
  // Track state mutations in dev mode
  protected trackStateChange(path: string, oldValue: any, newValue: any) {
    if (this.devMode) {
      this.stateHistory.push({
        timestamp: new Date(),
        changes: { path, oldValue, newValue },
      });
    }
  }
  
  // Introspection API
  getIntrospection() {
    return {
      state: this.devMode ? this.state : 'hidden',
      metrics: this.monitoring.getMetrics(),
      health: this.getHealthStatus(),
      componentManifest: this.getComponentManifest(),
      registeredCommands: Array.from(this.eventValidator.commands.keys()),
      registeredQueries: Array.from(this.eventValidator.queries.keys()),
      stateHistory: this.devMode ? this.stateHistory.slice(-100) : [],
    };
  }
}
```

## 5. Lifecycle Hooks

### More Granular Lifecycle Control
```typescript
export abstract class Actor<TState extends ActorState = ActorState> {
  // Lifecycle hooks
  protected async beforeStateLoad(): Promise<void> {}
  protected async afterStateLoad(state: TState): Promise<void> {}
  protected async beforeCommand(command: Command): Promise<void> {}
  protected async afterCommand(command: Command, result: ActorResult): Promise<void> {}
  protected async beforeQuery(query: Query): Promise<void> {}
  protected async afterQuery(query: Query, result: QueryResult): Promise<void> {}
  protected async onError(error: Error, context: { type: string; event: Event }): Promise<void> {}
  
  // State migration support
  protected async migrateState(state: any, fromVersion: string): Promise<TState> {
    // Override in subclasses for state migrations
    return state as TState;
  }
}
```

## 6. Dependency Injection

### Better External Service Management
```typescript
export interface ActorDependencies {
  services?: Map<string, any>;
  repositories?: Map<string, any>;
  clients?: Map<string, any>;
}

export abstract class Actor<TState extends ActorState = ActorState> {
  protected dependencies: ActorDependencies;
  
  constructor(context: ActorContext, initialState?: TState, dependencies?: ActorDependencies) {
    super(context, initialState);
    this.dependencies = dependencies || { services: new Map(), repositories: new Map(), clients: new Map() };
  }
  
  // Dependency registration
  protected registerService<T>(name: string, service: T): void {
    this.dependencies.services?.set(name, service);
  }
  
  protected getService<T>(name: string): T | undefined {
    return this.dependencies.services?.get(name) as T;
  }
}
```

## 7. Event Sourcing Support

### Optional Event Sourcing Pattern
```typescript
export abstract class Actor<TState extends ActorState = ActorState> {
  // Event sourcing configuration
  protected eventSourcingEnabled = false;
  protected eventStore: Event[] = [];
  
  // Apply event to state
  protected abstract applyEvent?(event: Event, state: TState): TState;
  
  // Rebuild state from events
  protected async rebuildStateFromEvents(): Promise<TState> {
    let state = await this.createDefaultState();
    
    for (const event of this.eventStore) {
      if (this.applyEvent) {
        state = this.applyEvent(event, state);
      }
    }
    
    return state;
  }
}
```

## 8. Monitoring Enhancements

### Structured Logging and Tracing
```typescript
export abstract class Actor<TState extends ActorState = ActorState> {
  // Structured logging context
  private logContext: Map<string, any> = new Map();
  
  // Add context to all logs
  protected setLogContext(key: string, value: any) {
    this.logContext.set(key, value);
  }
  
  // Enhanced logging with context
  protected log = {
    info: (message: string, data?: any) => {
      this.context.logger.info(message, {
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
  };
  
  // Distributed tracing support
  protected startSpan(name: string): Span {
    // Integration with OpenTelemetry or similar
    return new Span(name, this.context.traceId);
  }
}
```

## 9. Configuration Management

### Flexible Configuration with Validation
```typescript
export abstract class Actor<TState extends ActorState = ActorState> {
  // Configuration schema
  protected abstract configSchema?: z.ZodSchema<any>;
  
  // Validated configuration
  protected config: any;
  
  // Load and validate configuration
  protected async loadConfiguration(): Promise<void> {
    const rawConfig = this.context.config.actorConfig || {};
    
    if (this.configSchema) {
      const parsed = await this.configSchema.safeParseAsync(rawConfig);
      if (!parsed.success) {
        throw new Error(`Invalid configuration: ${parsed.error.message}`);
      }
      this.config = parsed.data;
    } else {
      this.config = rawConfig;
    }
  }
  
  // Hot reload configuration
  protected async reloadConfiguration(): Promise<void> {
    await this.loadConfiguration();
    await this.onConfigurationReload?.();
  }
  
  protected abstract onConfigurationReload?(): Promise<void>;
}
```

## 10. Graceful Degradation

### Built-in Fallback Mechanisms
```typescript
export abstract class Actor<TState extends ActorState = ActorState> {
  // Fallback strategies
  protected fallbackStrategies = new Map<string, () => Promise<any>>();
  
  // Execute with fallback
  protected async executeWithFallback<T>(
    operation: () => Promise<T>,
    fallbackKey: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.context.logger.warn(`Operation failed, using fallback: ${fallbackKey}`, error as Error);
      
      const fallback = this.fallbackStrategies.get(fallbackKey);
      if (fallback) {
        return await fallback() as T;
      }
      
      throw error;
    }
  }
}
```

## Implementation Priority

1. **High Priority**
   - State validation and reconstruction
   - Enhanced error handling
   - Testing utilities
   - Lifecycle hooks

2. **Medium Priority**
   - Development experience improvements
   - Dependency injection
   - Configuration management

3. **Low Priority**
   - Event sourcing support
   - Advanced monitoring
   - Graceful degradation patterns

These enhancements would make the base Actor class more robust and developer-friendly, reducing the likelihood of the issues we encountered during implementation.