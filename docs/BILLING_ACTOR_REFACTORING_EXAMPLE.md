# Example: Refactoring Billing Actor to Relay Model

This is a concrete example showing how to refactor an existing 1000+ line billing actor to the Relay model.

## Before: Current Billing Actor Structure

```
current-billing-actor/
├── src/
│   ├── index.ts (150 lines - main actor class)
│   ├── state/
│   │   ├── BillingState.ts (120 lines - state management)
│   │   ├── types.ts (80 lines - interfaces)
│   │   └── index.ts (20 lines)
│   ├── handlers/
│   │   ├── commands/
│   │   │   ├── createCustomer.ts (85 lines)
│   │   │   ├── createSubscription.ts (110 lines)
│   │   │   ├── cancelSubscription.ts (75 lines)
│   │   │   ├── updatePaymentMethod.ts (90 lines)
│   │   │   └── processWebhook.ts (120 lines)
│   │   ├── queries/
│   │   │   ├── getCustomer.ts (45 lines)
│   │   │   ├── getSubscription.ts (40 lines)
│   │   │   └── listInvoices.ts (55 lines)
│   │   └── index.ts (30 lines)
│   ├── schemas/
│   │   ├── commands.ts (120 lines - Zod schemas)
│   │   ├── queries.ts (60 lines)
│   │   ├── events.ts (100 lines)
│   │   └── validation.ts (80 lines)
│   ├── integrations/
│   │   ├── stripe.ts (140 lines - Stripe wrapper)
│   │   └── webhooks.ts (90 lines)
│   └── utils/
│       ├── errors.ts (60 lines - custom errors)
│       └── helpers.ts (40 lines)
├── exports/
│   ├── web/ (300+ lines of components)
│   └── graphql/ (100 lines)
└── tests/ (500+ lines)

Total: ~2,200 lines of code
```

## After: Relay Billing Actor

### Step 1: Extract to actor.yaml (80 lines)

```yaml
# actors/billing/actor.yaml
actor:
  name: billing
  description: "Customer billing and subscription management"
  version: 1.0.0
  
  # All state in one place
  state:
    customers:
      type: Map<string, Customer>
      schema:
        Customer:
          id: string
          email: string
          stripeCustomerId: string
          defaultPaymentMethod: string
          subscriptions: array<string>
          totalRevenue: number
          createdAt: timestamp
          updatedAt: timestamp
          
    subscriptions:
      type: Map<string, Subscription>
      schema:
        Subscription:
          id: string
          customerId: string
          stripeSubscriptionId: string
          status: string
          planId: string
          currentPeriodStart: timestamp
          currentPeriodEnd: timestamp
          cancelAtPeriodEnd: boolean
          
    invoices:
      type: Map<string, Invoice>
      schema:
        Invoice:
          id: string
          customerId: string
          subscriptionId: string
          amount: number
          currency: string
          status: string
          dueDate: timestamp
          paidAt: timestamp

  # Replace all command handlers
  handles:
    CREATE_CUSTOMER:
      description: "Create billing customer profile"
      payload:
        userId: string
        email: string
        metadata: object
      emits: CUSTOMER_CREATED
      
    CREATE_SUBSCRIPTION:
      description: "Create new subscription"
      payload:
        customerId: string
        priceId: string
        trialDays: number
      validates:
        - trialDays >= 0
        - trialDays <= 30
      emits: SUBSCRIPTION_CREATED
      
    UPDATE_PAYMENT_METHOD:
      description: "Update default payment method"
      payload:
        customerId: string
        paymentMethodId: string
      emits: PAYMENT_METHOD_UPDATED
      
    CANCEL_SUBSCRIPTION:
      description: "Cancel subscription at period end"
      payload:
        subscriptionId: string
        immediately: boolean
      emits: SUBSCRIPTION_CANCELLED
      
    PROCESS_STRIPE_WEBHOOK:
      description: "Handle Stripe webhook events"
      payload:
        event: object
        signature: string
      emits: WEBHOOK_PROCESSED

  # Replace all query handlers
  queries:
    GET_CUSTOMER:
      description: "Get customer with subscriptions"
      payload:
        customerId: string
      returns: CustomerWithDetails
      
    GET_SUBSCRIPTION:
      description: "Get subscription details"
      payload:
        subscriptionId: string
      returns: Subscription
      
    LIST_INVOICES:
      description: "List customer invoices"
      payload:
        customerId: string
        limit: number
      returns: array<Invoice>

  # Event subscriptions
  subscribes:
    USER_REGISTERED:
      handler: createCustomerForUser
      description: "Auto-create customer for new users"
      
    PAYMENT_FAILED:
      handler: handleFailedPayment
      description: "Update subscription status"

  # Dependencies
  dependencies:
    user:
      events: [GET_USER]
      pattern: ask
      purpose: "Verify user exists"
      
    notification:
      events: [SEND_EMAIL]
      pattern: tell
      purpose: "Send billing emails"
      
    analytics:
      events: [TRACK_EVENT, TRACK_REVENUE]
      pattern: tell
      purpose: "Track billing metrics"
```

### Step 2: Simplified TypeScript Implementation (250 lines)

```typescript
// actors/billing/index.ts
import { RelayActor, Result } from '../../runtime/actor-base';
import { Event } from '../../services/event-catalog';
import Stripe from 'stripe';

// Types match YAML schemas exactly
interface Customer {
  id: string;
  email: string;
  stripeCustomerId: string;
  defaultPaymentMethod?: string;
  subscriptions: string[];
  totalRevenue: number;
  createdAt: number;
  updatedAt: number;
}

interface Subscription {
  id: string;
  customerId: string;
  stripeSubscriptionId: string;
  status: string;
  planId: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
}

interface Invoice {
  id: string;
  customerId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: string;
  dueDate: number;
  paidAt?: number;
}

export class BillingActor extends RelayActor {
  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2023-10-16'
  });

  protected async processEvent(event: Event, handler: any): Promise<Result> {
    const events: Event[] = [];
    const customers = this.getState('customers') || new Map<string, Customer>();
    const subscriptions = this.getState('subscriptions') || new Map<string, Subscription>();
    const invoices = this.getState('invoices') || new Map<string, Invoice>();

    switch (event.type) {
      case 'CREATE_CUSTOMER': {
        const { userId, email, metadata } = event.payload;
        
        // Check if already exists
        if (customers.has(userId)) {
          throw new Error('Customer already exists');
        }

        // Create in Stripe
        const stripeCustomer = await this.stripe.customers.create({
          email,
          metadata: { userId, ...metadata }
        });

        // Create local record
        const customer: Customer = {
          id: userId,
          email,
          stripeCustomerId: stripeCustomer.id,
          subscriptions: [],
          totalRevenue: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        customers.set(customer.id, customer);

        // Emit event
        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              customerId: customer.id,
              email,
              stripeCustomerId: stripeCustomer.id
            },
            timestamp: Date.now(),
            actor: 'billing'
          });
        }

        // Send welcome email
        events.push({
          id: this.generateId(),
          type: 'SEND_EMAIL',
          payload: {
            to: email,
            template: 'billing-welcome',
            data: { customerId: customer.id }
          },
          timestamp: Date.now(),
          actor: 'billing'
        });

        return {
          success: true,
          state: { customers, subscriptions, invoices },
          events,
          response: { customerId: customer.id }
        };
      }

      case 'CREATE_SUBSCRIPTION': {
        const { customerId, priceId, trialDays } = event.payload;
        const customer = customers.get(customerId);
        
        if (!customer) {
          throw new Error('Customer not found');
        }

        // Create in Stripe
        const stripeSubscription = await this.stripe.subscriptions.create({
          customer: customer.stripeCustomerId,
          items: [{ price: priceId }],
          trial_period_days: trialDays,
          payment_behavior: 'default_incomplete',
          expand: ['latest_invoice.payment_intent']
        });

        // Create local record
        const subscription: Subscription = {
          id: this.generateId(),
          customerId,
          stripeSubscriptionId: stripeSubscription.id,
          status: stripeSubscription.status,
          planId: priceId,
          currentPeriodStart: stripeSubscription.current_period_start * 1000,
          currentPeriodEnd: stripeSubscription.current_period_end * 1000,
          cancelAtPeriodEnd: false
        };

        subscriptions.set(subscription.id, subscription);
        customer.subscriptions.push(subscription.id);
        customer.updatedAt = Date.now();

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              subscriptionId: subscription.id,
              customerId,
              planId: priceId,
              status: subscription.status,
              trialDays
            },
            timestamp: Date.now(),
            actor: 'billing'
          });
        }

        // Track revenue event
        if (subscription.status === 'active') {
          events.push({
            id: this.generateId(),
            type: 'TRACK_REVENUE',
            payload: {
              customerId,
              amount: 0, // Will be updated when invoice paid
              type: 'subscription_created'
            },
            timestamp: Date.now(),
            actor: 'billing'
          });
        }

        return {
          success: true,
          state: { customers, subscriptions, invoices },
          events,
          response: {
            subscriptionId: subscription.id,
            clientSecret: (stripeSubscription.latest_invoice as any)?.payment_intent?.client_secret
          }
        };
      }

      case 'CANCEL_SUBSCRIPTION': {
        const { subscriptionId, immediately } = event.payload;
        const subscription = subscriptions.get(subscriptionId);
        
        if (!subscription) {
          throw new Error('Subscription not found');
        }

        // Cancel in Stripe
        const updated = await this.stripe.subscriptions.update(
          subscription.stripeSubscriptionId,
          immediately ? { cancel_at: null } : { cancel_at_period_end: true }
        );

        if (immediately) {
          await this.stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
          subscription.status = 'canceled';
        } else {
          subscription.cancelAtPeriodEnd = true;
        }

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              subscriptionId,
              customerId: subscription.customerId,
              immediately,
              effectiveDate: immediately ? Date.now() : subscription.currentPeriodEnd
            },
            timestamp: Date.now(),
            actor: 'billing'
          });
        }

        return {
          success: true,
          state: { customers, subscriptions, invoices },
          events
        };
      }

      // Other handlers follow same pattern...
      
      default:
        throw new Error(`Unknown event type: ${event.type}`);
    }
  }

  protected async executeQuery(event: Event, queryDef: any): Promise<any> {
    const customers = this.getState('customers') || new Map<string, Customer>();
    const subscriptions = this.getState('subscriptions') || new Map<string, Subscription>();
    const invoices = this.getState('invoices') || new Map<string, Invoice>();

    switch (event.type) {
      case 'GET_CUSTOMER': {
        const { customerId } = event.payload;
        const customer = customers.get(customerId);
        
        if (!customer) return null;

        // Enrich with subscriptions
        const customerSubs = customer.subscriptions
          .map(id => subscriptions.get(id))
          .filter(Boolean);

        return {
          ...customer,
          subscriptions: customerSubs,
          metrics: {
            activeSubscriptions: customerSubs.filter(s => s.status === 'active').length,
            totalRevenue: customer.totalRevenue
          }
        };
      }

      case 'LIST_INVOICES': {
        const { customerId, limit = 10 } = event.payload;
        
        const customerInvoices = Array.from(invoices.values())
          .filter(inv => inv.customerId === customerId)
          .sort((a, b) => b.dueDate - a.dueDate)
          .slice(0, limit);

        return customerInvoices;
      }

      default:
        throw new Error(`Unknown query type: ${event.type}`);
    }
  }

  protected async handleSubscription(event: Event, handler: any): Promise<void> {
    switch (event.type) {
      case 'USER_REGISTERED': {
        const { userId, email } = event.payload;
        
        // Auto-create billing customer
        await this.emit('CREATE_CUSTOMER', {
          userId,
          email,
          metadata: { source: 'auto_registration' }
        });
        break;
      }

      case 'PAYMENT_FAILED': {
        const { subscriptionId, attemptCount } = event.payload;
        const subscriptions = this.getState('subscriptions') || new Map();
        const subscription = subscriptions.get(subscriptionId);
        
        if (subscription) {
          subscription.status = attemptCount > 3 ? 'past_due' : 'active';
          this.setState('subscriptions', subscriptions);
        }
        break;
      }
    }
  }

  protected async updateState(newState: any): Promise<void> {
    if (newState.customers) this.setState('customers', newState.customers);
    if (newState.subscriptions) this.setState('subscriptions', newState.subscriptions);
    if (newState.invoices) this.setState('invoices', newState.invoices);
  }
}
```

### Step 3: Add Events to Postgres

```sql
-- Billing events
INSERT INTO event_definitions (event_name, description, producer_actor) VALUES
('CREATE_CUSTOMER', 'Create billing customer profile', 'billing'),
('CREATE_SUBSCRIPTION', 'Create new subscription', 'billing'),
('UPDATE_PAYMENT_METHOD', 'Update default payment method', 'billing'),
('CANCEL_SUBSCRIPTION', 'Cancel subscription', 'billing'),
('PROCESS_STRIPE_WEBHOOK', 'Process Stripe webhook', 'billing'),
('CUSTOMER_CREATED', 'Billing customer created', 'billing'),
('SUBSCRIPTION_CREATED', 'Subscription created', 'billing'),
('SUBSCRIPTION_CANCELLED', 'Subscription cancelled', 'billing'),
('PAYMENT_METHOD_UPDATED', 'Payment method updated', 'billing'),
('WEBHOOK_PROCESSED', 'Stripe webhook processed', 'billing');

-- Event consumers
INSERT INTO event_consumers (event_id, consumer_actor, pattern)
SELECT ed.id, consumer, pattern
FROM event_definitions ed
CROSS JOIN (VALUES
  ('CUSTOMER_CREATED', 'notification', 'publish'),
  ('CUSTOMER_CREATED', 'analytics', 'publish'),
  ('SUBSCRIPTION_CREATED', 'notification', 'publish'),
  ('SUBSCRIPTION_CREATED', 'analytics', 'publish'),
  ('SUBSCRIPTION_CANCELLED', 'notification', 'publish'),
  ('SUBSCRIPTION_CANCELLED', 'analytics', 'publish')
) AS mappings(event_name, consumer, pattern)
WHERE ed.event_name = mappings.event_name;
```

## What Was Eliminated

### 1. State Management Boilerplate (Saved 200 lines)
```typescript
// REMOVED: Complex state class with getters/setters
class BillingState {
  private customers = new Map();
  private subscriptions = new Map();
  
  getCustomer(id: string): Customer | undefined {
    return this.customers.get(id);
  }
  
  setCustomer(customer: Customer): void {
    this.customers.set(customer.id, customer);
    this.notifyListeners('customer:updated', customer);
  }
  // ... 50+ more methods
}

// REPLACED WITH: Simple Maps in actor
const customers = this.getState('customers') || new Map();
```

### 2. Manual Validation (Saved 180 lines)
```typescript
// REMOVED: Zod schemas and manual validation
const CreateCustomerSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  metadata: z.record(z.string()).optional()
});

const parsed = CreateCustomerSchema.safeParse(event.payload);
if (!parsed.success) {
  throw new ValidationError(parsed.error);
}

// REPLACED WITH: Postgres validates automatically
```

### 3. Error Classes (Saved 60 lines)
```typescript
// REMOVED: Custom error hierarchy
class BillingError extends Error {}
class CustomerNotFoundError extends BillingError {}
class SubscriptionError extends BillingError {}
class PaymentError extends BillingError {}

// REPLACED WITH: Standard errors
throw new Error('Customer not found');
```

### 4. Event Type Definitions (Saved 100 lines)
```typescript
// REMOVED: TypeScript event definitions
export const CUSTOMER_CREATED = 'CUSTOMER_CREATED';
export interface CustomerCreatedEvent {
  type: typeof CUSTOMER_CREATED;
  payload: {
    customerId: string;
    email: string;
    stripeCustomerId: string;
  };
}

// REPLACED WITH: Events in Postgres catalog
```

## Final Result

- **Before**: 2,200 lines across 20+ files
- **After**: 330 lines in 3 files
- **Reduction**: 85% less code
- **Development time**: 3 hours to refactor
- **Benefits**:
  - Single source of truth for events
  - Automatic validation
  - Clear actor boundaries
  - Simplified testing
  - Self-documenting YAML

The refactored actor is easier to understand, modify, and maintain while providing the same functionality with better consistency.