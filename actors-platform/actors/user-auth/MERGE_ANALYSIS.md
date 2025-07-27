# Enhanced Actor Merge Analysis

## Overview

This document analyzes the effort required to merge the EnhancedActor with the existing Actor implementation and refactor the auth actor to use it.

## Current State

### Existing Actor Class
- Location: `/packages/actor-sdk/src/actor.ts`
- Features:
  - Basic monitoring and metrics
  - Security event tracking
  - Rate limiting
  - Circuit breakers
  - Component export management
  - Health checks
  - Test utilities

### Enhanced Actor Class
- Location: `/packages/actor-sdk/src/enhanced-actor.ts`
- New Features:
  - AI-friendly error handling (ActorError)
  - State validation and reconstruction
  - Lifecycle hooks (before/after command/query)
  - Configuration management with validation
  - Enhanced test utilities
  - Development mode with state tracking
  - Structured logging context
  - Error transformers

### Auth Actor Implementation
- Current: Extends `Actor` class
- Location: `/actors/user-auth/src/auth-actor.ts`
- Would benefit from:
  - State validation (Maps reconstruction issue we faced)
  - AI-friendly errors
  - Lifecycle hooks for logging
  - Configuration validation

## Merge Strategy

### Option 1: Replace Actor with EnhancedActor (Recommended)
**Effort: Medium (2-3 hours)**

1. **Merge Features into Actor Class**
   - Add new properties and methods from EnhancedActor to Actor
   - Keep backward compatibility
   - Make new features opt-in with sensible defaults

2. **Required Changes:**
   ```typescript
   // In existing Actor class
   export abstract class Actor<TState extends ActorState = ActorState> {
     // Add new optional properties
     protected stateSchema?: z.ZodSchema<TState>;
     protected configSchema?: z.ZodSchema<any>;
     protected errorTransformers = new Map<string, (error: Error) => ActorError>();
     
     // Add new abstract method with default implementation
     protected async createDefaultState(): Promise<TState> {
       return this.state; // Default behavior
     }
     
     // Add lifecycle hooks with empty defaults
     protected async beforeCommand(command: Command): Promise<void> {}
     protected async afterCommand(command: Command, result: ActorResult): Promise<void> {}
     // etc...
   }
   ```

3. **Migration Steps:**
   - Copy new methods from EnhancedActor to Actor
   - Add ActorError class export
   - Update initialize() to support state validation
   - Add error transformation in handle() and query()
   - Maintain backward compatibility

### Option 2: Create New Enhanced Base (Not Recommended)
**Effort: High (4-5 hours)**

1. Keep both Actor and EnhancedActor
2. Gradually migrate actors to use EnhancedActor
3. Maintain two implementations

### Option 3: Inheritance Chain (Not Recommended)
**Effort: Low initially, High maintenance**

```typescript
Actor -> EnhancedActor -> AuthActor
```

## Refactoring Auth Actor

### Required Changes (1-2 hours)

1. **Add State Schema**
   ```typescript
   protected stateSchema = AuthStateSchema;
   ```

2. **Replace State Initialization**
   ```typescript
   // Remove manual state reconstruction
   protected async createDefaultState(): Promise<AuthState> {
     return createDefaultAuthState();
   }
   ```

3. **Add Configuration Schema**
   ```typescript
   protected configSchema = z.object({
     jwtSecret: z.string().optional(),
     sessionTimeout: z.number().optional(),
     // etc...
   });
   ```

4. **Update Error Handling**
   ```typescript
   // Replace generic errors with ActorError
   throw new ActorError(
     'Account is locked',
     'ACCOUNT_LOCKED',
     {
       actor: this.actorConfig.name,
       fix: 'Wait 30 minutes before trying again',
       // ... context
     }
   );
   ```

5. **Add Lifecycle Hooks**
   ```typescript
   protected async afterStateLoad(state: AuthState): Promise<void> {
     this.initializeDefaultRolesAndPermissions();
   }
   ```

6. **Register Error Transformers**
   ```typescript
   constructor(context: ActorContext) {
     super(context);
     this.registerErrorTransformer('User not found', (error) => 
       new ActorError(...));
   }
   ```

## Implementation Plan

### Phase 1: Merge EnhancedActor into Actor (2-3 hours)
1. Create backup of current Actor class
2. Add new properties and methods
3. Update existing methods to support new features
4. Ensure backward compatibility
5. Test with existing actors

### Phase 2: Refactor Auth Actor (1-2 hours)
1. Update extends clause (if needed)
2. Add schemas
3. Convert errors to ActorError
4. Remove manual state fixes
5. Add lifecycle hooks
6. Test all functionality

### Phase 3: Update Tests (1 hour)
1. Update test utilities usage
2. Add tests for new features
3. Ensure existing tests pass

## Benefits After Merge

1. **Immediate Benefits**
   - Fix state initialization issues automatically
   - Better error messages for debugging
   - Cleaner code with lifecycle hooks

2. **Long-term Benefits**
   - Easier debugging for AI agents
   - Consistent error handling across actors
   - Better test coverage with enhanced utilities
   - Easier configuration management

## Risk Assessment

### Low Risk
- Changes are mostly additive
- Backward compatibility maintained
- Existing actors continue to work

### Mitigation
- Keep original Actor class as backup
- Test thoroughly with existing actors
- Roll out gradually if needed

## Recommendation

**Merge EnhancedActor into the existing Actor class** (Option 1)

This approach:
- Provides benefits to all actors immediately
- Maintains single source of truth
- Minimal refactoring required
- Low risk with high reward

Total effort: **4-6 hours** including testing

## Example Migration

### Before (Current Auth Actor)
```typescript
export class AuthActor extends Actor<AuthState> {
  async initialize(): Promise<void> {
    await super.initialize();
    
    // Manual state fixing
    if (!this.state.users instanceof Map) {
      this.state.users = new Map();
    }
    // ... more manual fixes
  }
  
  // Generic errors
  if (!user) {
    return {
      success: false,
      error: new Error('User not found'),
    };
  }
}
```

### After (With Enhanced Features)
```typescript
export class AuthActor extends Actor<AuthState> {
  protected stateSchema = AuthStateSchema;
  
  protected async createDefaultState(): Promise<AuthState> {
    return createDefaultAuthState();
  }
  
  // AI-friendly errors
  if (!user) {
    throw new ActorError(
      'User not found',
      'USER_NOT_FOUND',
      {
        actor: 'auth',
        fix: 'Check the user ID exists',
        helpfulCommands: ['await actor.query({ type: "LIST_USERS" })'],
      }
    );
  }
}
```

The merge would significantly improve code quality and debugging experience with minimal effort.