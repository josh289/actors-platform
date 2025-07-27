# Actor Refactoring Guide: From Current to Relay Model

## Overview

This guide explains how to refactor existing verbose TypeScript actors (1000+ lines) to the streamlined Relay model (200 lines YAML + minimal TypeScript).

## Current vs Relay Model Comparison

### Current Model (BMAD Framework)
```typescript
// 1000+ lines of TypeScript per actor
- Complex state management
- Event definitions scattered
- Boilerplate for every handler
- Manual validation
- No centralized event catalog
```

### Relay Model
```yaml
# 50 lines of YAML + 200 lines TypeScript
- Declarative state schema
- Events in Postgres catalog
- Minimal handler code
- Automatic validation
- Single source of truth
```

## Refactoring Steps

### Step 1: Extract State Schema to YAML

**Current (TypeScript):**
```typescript
// src/state/index.ts (100+ lines)
export class BillingState {
  private customers: Map<string, Customer> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  
  getCustomer(id: string): Customer | undefined {
    return this.customers.get(id);
  }
  
  setCustomer(customer: Customer): void {
    this.customers.set(customer.id, customer);
  }
  // ... many more methods
}
```

**Relay (YAML):**
```yaml
# actor.yaml
state:
  customers:
    type: Map<string, Customer>
    schema:
      Customer:
        id: string
        email: string
        stripeCustomerId: string
        createdAt: timestamp
  subscriptions:
    type: Map<string, Subscription>
    schema:
      Subscription:
        id: string
        customerId: string
        status: string
        priceId: string
```

### Step 2: Move Events to Postgres Catalog

**Current (TypeScript):**
```typescript
// Scattered across multiple files
export const CREATE_CUSTOMER_SCHEMA = z.object({
  userId: z.string(),
  email: z.string().email()
});

export const CUSTOMER_CREATED_EVENT = {
  type: 'CUSTOMER_CREATED',
  schema: z.object({
    customerId: z.string(),
    email: z.string()
  })
};
```

**Relay (SQL):**
```sql
-- In Postgres event catalog
INSERT INTO event_definitions (event_name, description, producer_actor) 
VALUES ('CREATE_CUSTOMER', 'Create billing customer', 'billing');

INSERT INTO event_payload_schema (event_id, field_name, field_type, required)
VALUES 
  (event_id, 'userId', 'string', true),
  (event_id, 'email', 'string', true);
```

### Step 3: Simplify Event Handlers

**Current (TypeScript):**
```typescript
// handlers/commands/createCustomer.ts (50+ lines)
export async function handleCreateCustomer(
  event: Event,
  state: BillingState,
  deps: Dependencies
): Promise<Result> {
  // Manual validation
  const parsed = CREATE_CUSTOMER_SCHEMA.safeParse(event.payload);
  if (!parsed.success) {
    throw new ValidationError(parsed.error);
  }
  
  // Check if customer exists
  const existing = state.getCustomerByUserId(parsed.data.userId);
  if (existing) {
    throw new ConflictError('Customer already exists');
  }
  
  // Create in Stripe
  const stripeCustomer = await deps.stripe.customers.create({
    email: parsed.data.email,
    metadata: { userId: parsed.data.userId }
  });
  
  // Create customer
  const customer = {
    id: generateId(),
    userId: parsed.data.userId,
    email: parsed.data.email,
    stripeCustomerId: stripeCustomer.id,
    createdAt: new Date()
  };
  
  state.setCustomer(customer);
  
  // Publish event
  await deps.eventBus.publish({
    type: 'CUSTOMER_CREATED',
    payload: {
      customerId: customer.id,
      email: customer.email
    }
  });
  
  return { success: true, customerId: customer.id };
}
```

**Relay (YAML + TypeScript):**
```yaml
# actor.yaml
handles:
  CREATE_CUSTOMER:
    description: "Create billing customer"
    payload:
      userId: string
      email: string
    emits: CUSTOMER_CREATED
```

```typescript
// index.ts - Just the business logic
case 'CREATE_CUSTOMER': {
  const { userId, email } = event.payload;
  
  // Create in Stripe
  const stripeCustomer = await this.stripe.customers.create({
    email,
    metadata: { userId }
  });
  
  // Create customer
  const customer = {
    id: this.generateId(),
    userId,
    email,
    stripeCustomerId: stripeCustomer.id,
    createdAt: Date.now()
  };
  
  customers.set(customer.id, customer);
  
  // Framework handles event emission based on YAML
  return {
    success: true,
    state: { customers },
    response: { customerId: customer.id }
  };
}
```

### Step 4: Convert Component Exports

**Current (TypeScript):**
```typescript
// exports/web/BillingDashboard.tsx (200+ lines)
export const BillingDashboard: React.FC<Props> = ({ userId }) => {
  const [customer, setCustomer] = useState<Customer>();
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchCustomer(userId).then(setCustomer);
  }, [userId]);
  
  // ... complex component logic
};
```

**Relay (YAML reference):**
```yaml
# actor.yaml
ui_exports:
  web_components:
    - name: BillingDashboard
      type: page
      props:
        userId: string
      description: "Complete billing management dashboard"
```

Keep the component implementation but let the framework handle registration and routing.

## Migration Strategy

### Phase 1: Parallel Implementation (Week 1)
1. Keep existing actors running
2. Create Relay versions alongside
3. Implement adapter layer for compatibility

### Phase 2: Gradual Cutover (Week 2)
1. Route new events to Relay actors
2. Sync state between old and new
3. Monitor for discrepancies

### Phase 3: Complete Migration (Week 3)
1. Switch all traffic to Relay actors
2. Remove old implementations
3. Clean up adapter code

## Adapter Layer for Compatibility

Create an adapter to run both systems during migration:

```typescript
// adapters/actor-adapter.ts
export class ActorAdapter {
  constructor(
    private oldActor: LegacyActor,
    private newActor: RelayActor
  ) {}
  
  async handle(event: Event): Promise<Result> {
    // During migration, run both and compare
    if (process.env.RELAY_MIGRATION_MODE === 'shadow') {
      const oldResult = await this.oldActor.handle(event);
      const newResult = await this.newActor.handle(event);
      
      // Log discrepancies
      if (!this.resultsMatch(oldResult, newResult)) {
        console.error('Result mismatch', { event, oldResult, newResult });
      }
      
      return oldResult; // Use old during shadow mode
    }
    
    // After validation, use new
    return this.newActor.handle(event);
  }
}
```

## Breaking Changes

### 1. Event Naming
- Old: Mixed conventions
- New: Strict VERB_NOUN pattern
- **Migration**: Create event aliases during transition

### 2. State Access
- Old: Direct state manipulation
- New: Immutable state updates
- **Migration**: Use adapter methods

### 3. Validation
- Old: Manual Zod validation
- New: Automatic from Postgres schema
- **Migration**: Ensure schemas match

### 4. Error Handling
- Old: Custom error classes
- New: Standard error format
- **Migration**: Map errors in adapter

## Refactoring Checklist

For each actor:

- [ ] Extract state schema to YAML
- [ ] Move events to Postgres catalog
- [ ] Create actor.yaml configuration
- [ ] Simplify event handlers
- [ ] Remove validation boilerplate
- [ ] Update component exports
- [ ] Add to relay.yaml system config
- [ ] Create adapter for compatibility
- [ ] Write migration tests
- [ ] Deploy in shadow mode
- [ ] Monitor for discrepancies
- [ ] Switch to Relay implementation
- [ ] Remove legacy code

## Example: Billing Actor Refactoring

### Before (1000+ lines)
```
billing-actor/
├── src/
│   ├── index.ts (150 lines)
│   ├── state/ (300 lines)
│   ├── handlers/ (400 lines)
│   ├── schemas/ (200 lines)
│   └── utils/ (100 lines)
```

### After (300 lines)
```
billing/
├── actor.yaml (60 lines)
├── index.ts (240 lines)
└── components/ (unchanged)
```

## Benefits After Refactoring

1. **83% Less Code**: 300 lines vs 1000+
2. **Single Source of Truth**: Events in Postgres
3. **Automatic Validation**: No manual schemas
4. **Simplified Testing**: Framework handles mocking
5. **Better Documentation**: YAML is self-documenting

## Tools to Help Migration

### 1. Code Analyzer
```bash
# Analyze existing actor for migration
relay analyze-actor ./actors/billing --output migration-report.md
```

### 2. YAML Generator
```bash
# Generate actor.yaml from TypeScript
relay generate-yaml ./actors/billing/src --output actor.yaml
```

### 3. Event Migrator
```bash
# Extract events and add to Postgres
relay migrate-events ./actors/billing --catalog postgres://...
```

## Common Pitfalls

1. **Don't migrate all at once** - Use gradual rollout
2. **Maintain event compatibility** - Use versioning
3. **Test state migrations** - Ensure data integrity
4. **Monitor performance** - Relay should be faster
5. **Keep backups** - Enable quick rollback

## Support During Migration

- Use adapter layer for compatibility
- Run in shadow mode to validate
- Monitor metrics closely
- Keep old code until fully validated
- Document any custom patterns

The refactoring process typically takes 1-2 days per actor, with most time spent on testing and validation rather than code changes.