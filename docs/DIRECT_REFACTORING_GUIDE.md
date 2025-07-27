# Direct Actor Refactoring to Relay Model

This guide shows how to directly convert existing actors to the Relay model without compatibility layers.

## Refactoring Process

### Step 1: Create actor.yaml

Take your existing TypeScript actor and extract its core definition into YAML:

```yaml
# actors/billing/actor.yaml
actor:
  name: billing
  description: "Customer billing and subscription management"
  version: 1.0.0
  
  # Extract state from your TypeScript classes
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
          planId: string
          currentPeriodEnd: timestamp

  # Convert your command handlers to handles section
  handles:
    CREATE_CUSTOMER:
      description: "Create billing customer"
      payload:
        userId: string
        email: string
      emits: CUSTOMER_CREATED
      
    CREATE_SUBSCRIPTION:
      description: "Create subscription"
      payload:
        customerId: string
        planId: string
      validates:
        - planId in ['basic', 'pro', 'enterprise']
      emits: SUBSCRIPTION_CREATED
      
    CANCEL_SUBSCRIPTION:
      description: "Cancel subscription"
      payload:
        subscriptionId: string
      emits: SUBSCRIPTION_CANCELLED

  # Convert your query handlers
  queries:
    GET_CUSTOMER:
      description: "Get customer by ID"
      payload:
        customerId: string
      returns: Customer
      
    GET_ACTIVE_SUBSCRIPTIONS:
      description: "Get customer's active subscriptions"
      payload:
        customerId: string
      returns: array<Subscription>

  # List events you subscribe to
  subscribes:
    USER_REGISTERED:
      handler: createCustomerForUser
      description: "Auto-create customer for new users"
      
    PAYMENT_FAILED:
      handler: handleFailedPayment
      description: "Update subscription on payment failure"

  # Declare dependencies
  dependencies:
    notification:
      events: [SEND_EMAIL]
      pattern: tell
      purpose: "Send billing notifications"
      
    analytics:
      events: [TRACK_EVENT]
      pattern: tell
      purpose: "Track billing metrics"
```

### Step 2: Create Minimal TypeScript Implementation

Replace your 1000+ line TypeScript file with a focused implementation:

```typescript
// actors/billing/index.ts
import { RelayActor, Result } from '../../runtime/actor-base';
import { Event } from '../../services/event-catalog';
import Stripe from 'stripe';

interface Customer {
  id: string;
  email: string;
  stripeCustomerId: string;
  createdAt: number;
}

interface Subscription {
  id: string;
  customerId: string;
  status: string;
  planId: string;
  currentPeriodEnd: number;
}

export class BillingActor extends RelayActor {
  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  protected async processEvent(event: Event, handler: any): Promise<Result> {
    const events: Event[] = [];
    const customers = this.getState('customers') || new Map<string, Customer>();
    const subscriptions = this.getState('subscriptions') || new Map<string, Subscription>();

    switch (event.type) {
      case 'CREATE_CUSTOMER': {
        const { userId, email } = event.payload;
        
        // Create Stripe customer
        const stripeCustomer = await this.stripe.customers.create({ 
          email,
          metadata: { userId }
        });

        // Create local customer
        const customer: Customer = {
          id: userId, // Use userId as customer ID
          email,
          stripeCustomerId: stripeCustomer.id,
          createdAt: Date.now()
        };

        customers.set(customer.id, customer);

        // Emit event (framework handles based on YAML)
        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: { customerId: customer.id, email },
            timestamp: Date.now(),
            actor: 'billing'
          });
        }

        return {
          success: true,
          state: { customers, subscriptions },
          events,
          response: { customerId: customer.id }
        };
      }

      case 'CREATE_SUBSCRIPTION': {
        const { customerId, planId } = event.payload;
        const customer = customers.get(customerId);
        
        if (!customer) {
          throw new Error('Customer not found');
        }

        // Create Stripe subscription
        const stripeSubscription = await this.stripe.subscriptions.create({
          customer: customer.stripeCustomerId,
          items: [{ price: this.getPriceId(planId) }]
        });

        // Create local subscription
        const subscription: Subscription = {
          id: stripeSubscription.id,
          customerId,
          status: stripeSubscription.status,
          planId,
          currentPeriodEnd: stripeSubscription.current_period_end * 1000
        };

        subscriptions.set(subscription.id, subscription);

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: { 
              subscriptionId: subscription.id,
              customerId,
              planId,
              status: subscription.status
            },
            timestamp: Date.now(),
            actor: 'billing'
          });
        }

        return {
          success: true,
          state: { customers, subscriptions },
          events,
          response: { subscriptionId: subscription.id }
        };
      }

      case 'CANCEL_SUBSCRIPTION': {
        const { subscriptionId } = event.payload;
        const subscription = subscriptions.get(subscriptionId);
        
        if (!subscription) {
          throw new Error('Subscription not found');
        }

        // Cancel in Stripe
        await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });

        subscription.status = 'canceling';

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: { subscriptionId, customerId: subscription.customerId },
            timestamp: Date.now(),
            actor: 'billing'
          });
        }

        return {
          success: true,
          state: { customers, subscriptions },
          events
        };
      }

      default:
        throw new Error(`Unknown event type: ${event.type}`);
    }
  }

  protected async executeQuery(event: Event, queryDef: any): Promise<any> {
    const customers = this.getState('customers') || new Map<string, Customer>();
    const subscriptions = this.getState('subscriptions') || new Map<string, Subscription>();

    switch (event.type) {
      case 'GET_CUSTOMER': {
        const { customerId } = event.payload;
        return customers.get(customerId) || null;
      }

      case 'GET_ACTIVE_SUBSCRIPTIONS': {
        const { customerId } = event.payload;
        return Array.from(subscriptions.values())
          .filter(s => s.customerId === customerId && s.status === 'active');
      }

      default:
        throw new Error(`Unknown query type: ${event.type}`);
    }
  }

  protected async handleSubscription(event: Event, handler: any): Promise<void> {
    switch (event.type) {
      case 'USER_REGISTERED': {
        const { userId, email } = event.payload;
        await this.emit('CREATE_CUSTOMER', { userId, email });
        break;
      }

      case 'PAYMENT_FAILED': {
        const { subscriptionId } = event.payload;
        const subscriptions = this.getState('subscriptions') || new Map();
        const subscription = subscriptions.get(subscriptionId);
        
        if (subscription) {
          subscription.status = 'past_due';
          this.setState('subscriptions', subscriptions);
        }
        break;
      }
    }
  }

  protected async updateState(newState: any): Promise<void> {
    if (newState.customers) this.setState('customers', newState.customers);
    if (newState.subscriptions) this.setState('subscriptions', newState.subscriptions);
  }

  private getPriceId(planId: string): string {
    const prices: Record<string, string> = {
      'basic': process.env.STRIPE_BASIC_PRICE_ID!,
      'pro': process.env.STRIPE_PRO_PRICE_ID!,
      'enterprise': process.env.STRIPE_ENTERPRISE_PRICE_ID!
    };
    return prices[planId] || prices.basic;
  }
}
```

### Step 3: Add Events to Postgres Catalog

```sql
-- Add billing events to catalog
INSERT INTO event_definitions (event_name, description, producer_actor) VALUES
('CREATE_CUSTOMER', 'Create billing customer', 'billing'),
('CREATE_SUBSCRIPTION', 'Create new subscription', 'billing'),
('CANCEL_SUBSCRIPTION', 'Cancel existing subscription', 'billing'),
('CUSTOMER_CREATED', 'Billing customer created', 'billing'),
('SUBSCRIPTION_CREATED', 'New subscription created', 'billing'),
('SUBSCRIPTION_CANCELLED', 'Subscription cancelled', 'billing');

-- Add event consumers
INSERT INTO event_consumers (event_id, consumer_actor, pattern)
SELECT ed.id, 'notification', 'publish'
FROM event_definitions ed
WHERE ed.event_name IN ('CUSTOMER_CREATED', 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_CANCELLED');

-- Add payload schemas
INSERT INTO event_payload_schema (event_id, field_name, field_type, required)
SELECT ed.id, field_name, field_type, true
FROM event_definitions ed
CROSS JOIN (VALUES
  ('CREATE_CUSTOMER', 'userId', 'string'),
  ('CREATE_CUSTOMER', 'email', 'string'),
  ('CREATE_SUBSCRIPTION', 'customerId', 'string'),
  ('CREATE_SUBSCRIPTION', 'planId', 'string'),
  ('CANCEL_SUBSCRIPTION', 'subscriptionId', 'string')
) AS fields(event_name, field_name, field_type)
WHERE ed.event_name = fields.event_name;
```

### Step 4: Update System Configuration

Add the refactored actor to relay.yaml:

```yaml
actors:
  billing:
    source: ./actors/billing
    version: 1.0.0
    instances: 2
    config:
      provider: stripe
      trialDays: 14
      plans:
        - id: basic
          price: 9.99
        - id: pro
          price: 29.99
        - id: enterprise
          price: 99.99
```

### Step 5: Create API Endpoint

```typescript
// api/actors/billing/index.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { BillingActor } from '../../../actors/billing';
import { EventBus } from '../../../runtime/event-bus';
import { Event } from '../../../services/event-catalog';

let actor: BillingActor;
let eventBus: EventBus;

async function initializeActor() {
  if (!actor) {
    eventBus = new EventBus({
      provider: process.env.REDIS_HOST ? 'redis' : 'memory',
      patterns: {
        ask: { timeout: 5000, retries: 2 },
        tell: { delivery: 'at_least_once' },
        publish: { delivery: 'best_effort' }
      }
    });

    await eventBus.initialize();

    actor = new BillingActor(
      {
        name: 'billing',
        version: '1.0.0',
        catalog: {
          host: process.env.POSTGRES_HOST!,
          port: parseInt(process.env.POSTGRES_PORT || '5432'),
          database: process.env.POSTGRES_DATABASE || 'event_catalog',
          user: process.env.POSTGRES_USER!,
          password: process.env.POSTGRES_PASSWORD!
        }
      },
      eventBus
    );

    await actor.initialize();
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await initializeActor();

    const { event_type, payload } = req.body;
    const event: Event = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: event_type,
      payload,
      timestamp: Date.now(),
      actor: 'api'
    };

    const isQuery = event_type.startsWith('GET_');
    
    if (isQuery) {
      const result = await actor.query(event);
      return res.status(200).json({ success: true, data: result });
    } else {
      const result = await actor.handle(event);
      return res.status(200).json({
        success: result.success,
        data: result.response,
        events: result.events.map(e => ({ type: e.type, timestamp: e.timestamp }))
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
```

## What Gets Removed

When refactoring, DELETE these parts from your old actor:

1. **All validation schemas** - Now in Postgres
2. **State management classes** - Replaced by simple Maps
3. **Event type definitions** - Now in catalog
4. **Dependency injection** - Now declarative
5. **Complex error classes** - Use standard errors
6. **Manual event publishing** - Framework handles it
7. **GraphQL schema files** - Auto-generated
8. **Extensive test mocks** - Test through events

## Before and After

### Before: 1000+ lines across many files
```
billing-actor/
├── src/
│   ├── index.ts (150 lines)
│   ├── state/
│   │   ├── CustomerState.ts (120 lines)
│   │   ├── SubscriptionState.ts (100 lines)
│   │   └── index.ts (50 lines)
│   ├── handlers/
│   │   ├── commands/
│   │   │   ├── createCustomer.ts (80 lines)
│   │   │   ├── createSubscription.ts (90 lines)
│   │   │   └── cancelSubscription.ts (70 lines)
│   │   └── queries/
│   │       ├── getCustomer.ts (40 lines)
│   │       └── getSubscriptions.ts (45 lines)
│   ├── schemas/
│   │   ├── commands.ts (100 lines)
│   │   ├── queries.ts (80 lines)
│   │   └── events.ts (120 lines)
│   └── utils/ (100 lines)
```

### After: ~300 lines total
```
billing/
├── actor.yaml (80 lines)
├── index.ts (220 lines)
└── api/index.ts (60 lines)
```

## Quick Refactoring Checklist

For each actor:

1. [ ] Create actor.yaml with state, handlers, queries, subscriptions
2. [ ] Create minimal index.ts with just business logic
3. [ ] Add events to Postgres catalog
4. [ ] Add actor to relay.yaml
5. [ ] Create API endpoint
6. [ ] Delete all the old code
7. [ ] Test with new event-based approach

The entire refactoring can be done in 2-4 hours per actor, with most time spent understanding the existing business logic to preserve it correctly.