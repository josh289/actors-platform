# Base Actor Enhancements

## Overview

Based on learnings from building the user-auth actor, we've enhanced the base Actor class with production-ready features that all actors can leverage out of the box.

## Key Enhancements

### 1. Built-in Monitoring and Metrics
- Prometheus-compatible metrics collection
- Automatic command/query timing
- Success/failure rate tracking
- Custom metric registration
- Metrics endpoint support

```typescript
// Automatically tracked
this.monitoring.incrementCounter('command_CREATE_USER_success');
this.monitoring.startTimer('query_GET_USER_duration');

// Custom metrics
this.monitoring.createCounter('custom_metric', 'Description');
this.monitoring.createHistogram('operation_duration', 'Operation duration');
this.monitoring.createGauge('active_connections', 'Active connections');
```

### 2. Security Event Tracking
- Centralized security event logging
- Severity levels (low, medium, high, critical)
- Anomaly detection
- Attack detection

```typescript
this.trackSecurityEvent({
  type: 'invalid_token_attempt',
  severity: 'medium',
  userId: null,
  details: { email }
});

// Check security status
const anomalies = this.security.getAnomalies();
const underAttack = this.security.isUnderAttack();
```

### 3. Rate Limiting
- Built-in rate limiting for commands
- Configurable windows and limits
- Multiple rate limiting strategies

```typescript
this.createRateLimiter(AuthCommands.SEND_MAGIC_LINK, {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 3,
  keyGenerator: (identifier) => identifier
});
```

### 4. Circuit Breakers
- Automatic circuit breakers for external calls
- Prevents cascading failures
- Self-healing with half-open state

```typescript
// Automatically wrapped in circuit breaker
await this.ask('external-service', command);
await this.tell('another-actor', event);
```

### 5. Event Validation
- Command and query validation
- Schema registration
- Automatic format checking (VERB_NOUN, GET_NOUN, NOUN_VERB_PAST)

```typescript
this.eventValidator.registerCommandSchema(AuthCommands.SEND_MAGIC_LINK, {
  required: ['email'],
  properties: {
    email: { type: 'string', pattern: '^[^@]+@[^@]+\\.[^@]+$' }
  }
});
```

### 6. State Management Helpers
- State cloning and merging
- State snapshots and history
- State validation
- Debounced updates

```typescript
const snapshot = this.stateHelpers.getSnapshot(this.state);
const diff = this.stateHelpers.getStateDiff(oldState, newState);
const history = this.stateHelpers.createHistoryTracker();
```

### 7. Health Checks
- Automatic health monitoring
- Custom health check support
- Circuit breaker status included
- Scheduled health checks

```typescript
protected async onHealthCheck(): Promise<any> {
  return {
    database: {
      healthy: await this.checkDatabase(),
      message: 'Database connection OK'
    }
  };
}
```

### 8. Component Export Management
- Centralized component registration
- Automatic manifest generation
- Type definitions export
- Validation support

```typescript
this.registerComponentExport({
  name: 'LoginForm',
  type: 'web',
  category: 'widget',
  component: LoginForm,
  props: loginFormSchema
});
```

### 9. Testing Utilities
- Test mode support
- State inspection and manipulation
- Method spying
- Mock responses

```typescript
actor.enableTestMode();
const utils = actor.getTestUtilities();
utils.setState(testState);
const spy = utils.spyOn('sendMagicLink');
```

### 10. Enhanced Error Handling
- Automatic security error detection
- Standardized error responses
- Error metric tracking
- Correlation ID tracking

## Usage Example

Here's how the refactored AuthActor leverages these features:

```typescript
export class AuthActor extends Actor<AuthState> {
  private jwtManager: JWTManager;
  
  constructor(context: ActorContext) {
    super(context, createDefaultAuthState());
    
    // Initialize custom infrastructure
    this.jwtManager = new JWTManager({ ... });
    
    // Set up rate limiting
    this.setupRateLimiting();
    
    // Register validation schemas
    this.registerEventSchemas();
    
    // Register component exports
    this.registerComponents();
  }

  protected async onInitialize(): Promise<void> {
    // Custom initialization
    this.registerCustomMetrics();
  }

  protected async onCommand(command: Command): Promise<ActorResult> {
    // Command handling with automatic monitoring
  }

  protected async onHealthCheck(): Promise<any> {
    // Custom health checks
    return {
      jwt: {
        healthy: this.jwtManager.getRotationStatus().totalSecrets > 0,
        message: `JWT secrets: ${this.jwtManager.getRotationStatus().totalSecrets}`
      }
    };
  }
}
```

## Benefits

1. **Reduced Boilerplate**: No need to implement monitoring, security, rate limiting, etc. in each actor
2. **Consistent Behavior**: All actors have the same production features
3. **Better Observability**: Built-in metrics and health checks
4. **Improved Security**: Automatic security event tracking and anomaly detection
5. **Resilience**: Circuit breakers prevent cascading failures
6. **Developer Experience**: Testing utilities and validation make development easier

## Migration Guide

To use the enhanced base actor:

1. Extend from the enhanced `Actor` class (already merged into `@actors-platform/sdk`)
2. Move infrastructure out of state into private properties
3. Use built-in monitoring instead of custom metrics
4. Register event schemas for validation
5. Implement `onHealthCheck()` for custom health checks
6. Use `trackSecurityEvent()` for security logging
7. Create rate limiters in constructor
8. Register component exports

## Environment Variables

```bash
# Enable metrics endpoint
ENABLE_METRICS_ENDPOINT=true
METRICS_PORT=9090

# Security monitoring
SECURITY_WEBHOOK_URL=https://security.example.com/events
SECURITY_WEBHOOK_TOKEN=secret

# Export on shutdown
EXPORT_METRICS_ON_SHUTDOWN=true
EXPORT_SECURITY_EVENTS_ON_SHUTDOWN=true
```

## Conclusion

These enhancements make the Actor framework production-ready out of the box. Every actor now has enterprise-grade monitoring, security, and resilience features without any additional implementation effort.