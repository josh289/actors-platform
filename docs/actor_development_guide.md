# Actor Development Guide: Build Production Actors

## Actor Anatomy Following Official Specification

### Standard File Structure
```
my-actor/
├── src/
│   ├── index.ts           # Actor definition with proper event schemas
│   ├── handlers/          # Event handlers (commands, queries)
│   │   ├── commands/      # State-changing operations
│   │   ├── queries/       # State-reading operations
│   │   └── webhooks/      # External event handlers
│   ├── state/            # State management and schemas
│   ├── integrations/     # Third-party API clients
│   ├── events/           # Event publishing utilities
│   └── utils/            # Helper functions
├── exports/
│   ├── web/              # React components for web
│   │   ├── widgets/      # Embeddable components
│   │   ├── pages/        # Full page components
│   │   ├── modals/       # Overlay components
│   │   └── micro/        # Atomic components
│   ├── mobile/           # React Native components
│   │   ├── screens/      # Full screen components
│   │   ├── widgets/      # Reusable components
│   │   └── modals/       # Modal/sheet components
│   └── schema.graphql    # GraphQL schema contributions
├── tests/
│   ├── unit/             # Handler unit tests
│   ├── integration/      # Actor communication tests
│   ├── components/       # UI component tests
│   └── fixtures/         # Test data and mocks
├── docs/
│   ├── README.md         # Actor documentation
│   ├── api.md           # Event and query reference
│   ├── components.md    # UI component docs
│   └── examples/         # Usage examples
├── package.json          # Dependencies & metadata
├── actor.config.ts       # Official actor configuration
└── vercel.json          # Deployment configuration
```

## Creating Actors Following the Specification

### 1. Initialize Actor with Proper Structure
```bash
# Create new actor following official template
relay create-actor payment-processor --template billing

# Or start from official specification
relay create-actor my-actor --spec standard
cd my-actor
```

### 2. Define Actor Schema (Following Official Format)
```typescript
// src/index.ts
import { createActor, z } from '@actor-platform/sdk';

// State Schema - What this actor owns
const StateSchema = z.object({
  customers: z.record(z.object({
    id: z.string(),
    email: z.string(),
    stripeCustomerId: z.string(),
    subscriptions: z.array(z.string()),
    totalRevenue: z.number().default(0),
    createdAt: z.date(),
    updatedAt: z.date()
  })),
  
  subscriptions: z.record(z.object({
    id: z.string(),
    customerId: z.string(),
    status: z.enum(['active', 'canceled', 'past_due', 'trialing']),
    priceId: z.string(),
    currentPeriodStart: z.date(),
    currentPeriodEnd: z.date(),
    cancelAtPeriodEnd: z.boolean().default(false),
    trialEnd: z.date().optional()
  })),
  
  invoices: z.record(z.object({
    id: z.string(),
    customerId: z.string(),
    subscriptionId: z.string(),
    amount: z.number(),
    currency: z.string(),
    status: z.enum(['draft', 'open', 'paid', 'void']),
    dueDate: z.date(),
    paidAt: z.date().optional()
  }))
});

// Event Schemas - Commands, Queries, Notifications
const CommandSchemas = {
  CREATE_CUSTOMER: z.object({
    userId: z.string(),
    email: z.string().email(),
    metadata: z.record(z.string()).optional()
  }),
  
  CREATE_SUBSCRIPTION: z.object({
    customerId: z.string(),
    priceId: z.string(),
    trialDays: z.number().min(0).max(365).optional(),
    couponId: z.string().optional()
  }),
  
  CANCEL_SUBSCRIPTION: z.object({
    subscriptionId: z.string(),
    immediately: z.boolean().default(false),
    reason: z.string().optional()
  }),
  
  PROCESS_WEBHOOK: z.object({
    event: z.any(), // Stripe webhook event
    signature: z.string()
  })
};

const QuerySchemas = {
  GET_CUSTOMER: z.object({
    customerId: z.string()
  }),
  
  GET_SUBSCRIPTION: z.object({
    subscriptionId: z.string()
  }),
  
  GET_CUSTOMER_SUBSCRIPTIONS: z.object({
    customerId: z.string(),
    status: z.enum(['active', 'canceled', 'past_due', 'trialing']).optional()
  })
};

// Actor Definition Following Official Spec
export const billingActor = createActor({
  // Basic Identity
  name: 'billing',
  domain: 'Financial Operations',
  purpose: 'Manages customer billing, subscriptions, and payment processing',
  version: '1.0.0',
  
  // State and Event Schemas
  state: StateSchema,
  commands: CommandSchemas,
  queries: QuerySchemas,
  
  // Configuration Schema
  config: z.object({
    stripeSecretKey: z.string(),
    stripeWebhookSecret: z.string(),
    defaultCurrency: z.string().default('usd'),
    trialPeriodDays: z.number().default(7)
  }),
  
  // Actor Capabilities
  capabilities: [
    'subscription-management',
    'payment-processing', 
    'customer-portal',
    'invoice-generation',
    'webhook-handling'
  ],
  
  // Handler Mappings
  handlers: {
    // Commands (State Changes)
    CREATE_CUSTOMER: './handlers/commands/create-customer',
    CREATE_SUBSCRIPTION: './handlers/commands/create-subscription',
    CANCEL_SUBSCRIPTION: './handlers/commands/cancel-subscription',
    PROCESS_WEBHOOK: './handlers/webhooks/stripe-webhook',
    
    // Queries (State Reads)
    GET_CUSTOMER: './handlers/queries/get-customer',
    GET_SUBSCRIPTION: './handlers/queries/get-subscription',
    GET_CUSTOMER_SUBSCRIPTIONS: './handlers/queries/get-customer-subscriptions'
  },
  
  // Outgoing Dependencies (ask/tell patterns)
  dependencies: {
    user: {
      patterns: ['ask'], // We ask user actor for user data
      events: ['GET_USER']
    },
    notification: {
      patterns: ['tell'], // We tell notification to send emails
      events: ['SEND_EMAIL', 'SEND_SMS']
    },
    analytics: {
      patterns: ['tell'], // We tell analytics about events
      events: ['TRACK_EVENT', 'TRACK_REVENUE']
    }
  },
  
  // Published Notifications (publish pattern)
  notifications: [
    'CUSTOMER_CREATED',
    'SUBSCRIPTION_CREATED', 
    'SUBSCRIPTION_CANCELED',
    'PAYMENT_SUCCEEDED',
    'PAYMENT_FAILED'
  ],
  
  // API Endpoint Mapping
  api: {
    '/customer': { 
      POST: { handler: 'CREATE_CUSTOMER', auth: 'required' },
      GET: { handler: 'GET_CUSTOMER', auth: 'required' }
    },
    '/subscription': { 
      POST: { handler: 'CREATE_SUBSCRIPTION', auth: 'required' }
    },
    '/subscription/:id': { 
      GET: { handler: 'GET_SUBSCRIPTION', auth: 'required' },
      DELETE: { handler: 'CANCEL_SUBSCRIPTION', auth: 'required' }
    },
    '/webhook/stripe': { 
      POST: { handler: 'PROCESS_WEBHOOK', auth: 'webhook' }
    }
  },
  
  // Component Exports
  exports: {
    web: './exports/web/index.ts',
    mobile: './exports/mobile/index.ts',
    schema: './exports/schema.graphql'
  }
});
```

### 3. Implement Command Handlers (State Changes)
```typescript
// src/handlers/commands/create-customer.ts
import { CommandHandler } from '@actor-platform/sdk';
import { StripeIntegration } from '../../integrations/stripe';

export const createCustomer: CommandHandler<'CREATE_CUSTOMER'> = async (context) => {
  const { event, state, config, dependencies } = context;
  
  try {
    // Validate user exists using dependency
    const userResult = await dependencies.user.ask('GET_USER', {
      userId: event.payload.userId
    });
    
    if (!userResult.success) {
      return {
        success: false,
        error: 'User not found',
        state // Don't change state on error
      };
    }
    
    // Create customer in Stripe
    const stripe = new StripeIntegration(config.stripeSecretKey);
    const customer = await stripe.createCustomer({
      email: event.payload.email,
      metadata: {
        userId: event.payload.userId,
        ...event.payload.metadata
      }
    });
    
    // Update actor state
    const newState = {
      ...state,
      customers: {
        ...state.customers,
        [customer.id]: {
          id: customer.id,
          email: customer.email,
          stripeCustomerId: customer.id,
          subscriptions: [],
          totalRevenue: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }
    };
    
    // Track analytics
    await dependencies.analytics.tell('TRACK_EVENT', {
      userId: event.payload.userId,
      event: 'customer_created',
      properties: {
        customerId: customer.id,
        email: customer.email
      }
    });
    
    // Return success with published events
    return {
      success: true,
      data: { 
        customerId: customer.id,
        email: customer.email
      },
      state: newState,
      
      // Events to publish (notifications)
      events: [{
        type: 'CUSTOMER_CREATED',
        payload: { 
          customerId: customer.id, 
          userId: event.payload.userId,
          email: customer.email,
          timestamp: Date.now()
        }
      }]
    };
    
  } catch (error) {
    // Log error for monitoring
    console.error('Failed to create customer:', error);
    
    return {
      success: false,
      error: error.message,
      state // Don't change state on error
    };
  }
};
```

### 4. Implement Query Handlers (State Reads)
```typescript
// src/handlers/queries/get-customer.ts
import { QueryHandler } from '@actor-platform/sdk';

export const getCustomer: QueryHandler<'GET_CUSTOMER'> = async (context) => {
  const { event, state } = context;
  
  const customer = state.customers[event.payload.customerId];
  
  if (!customer) {
    return {
      success: false,
      error: 'Customer not found'
    };
  }
  
  // Enrich with subscription data
  const subscriptions = customer.subscriptions
    .map(subId => state.subscriptions[subId])
    .filter(Boolean);
  
  return {
    success: true,
    data: {
      ...customer,
      subscriptions,
      metrics: {
        activeSubscriptions: subscriptions.filter(s => s.status === 'active').length,
        totalRevenue: customer.totalRevenue
      }
    }
  };
};
```

### 5. Build UI Components Following Export Standards

#### Web Components
```typescript
// exports/web/widgets/PricingTable.tsx
import React from 'react';
import { useBillingActor } from '@actor-platform/react';

interface Plan {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
}

interface PricingTableProps {
  plans: Plan[];
  currentPlan?: string;
  onSelectPlan: (planId: string) => void;
  loading?: boolean;
}

export function PricingTable({ 
  plans, 
  currentPlan, 
  onSelectPlan, 
  loading = false 
}: PricingTableProps) {
  const { createSubscription } = useBillingActor();
  
  const handleSelectPlan = async (planId: string) => {
    try {
      const result = await createSubscription({
        priceId: planId,
        // Additional options...
      });
      
      if (result.success) {
        onSelectPlan(planId);
      }
    } catch (error) {
      console.error('Failed to create subscription:', error);
    }
  };
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
      {plans.map((plan) => (
        <div 
          key={plan.id}
          className={`
            border rounded-lg p-6 relative
            ${currentPlan === plan.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}
          `}
        >
          {currentPlan === plan.id && (
            <div className="absolute top-0 right-4 transform -translate-y-1/2">
              <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm">
                Current Plan
              </span>
            </div>
          )}
          
          <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
          <div className="mb-4">
            <span className="text-3xl font-bold">${plan.price}</span>
            <span className="text-gray-600">/{plan.interval}</span>
          </div>
          
          <ul className="space-y-2 mb-6">
            {plan.features.map((feature, index) => (
              <li key={index} className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                {feature}
              </li>
            ))}
          </ul>
          
          <button
            onClick={() => handleSelectPlan(plan.id)}
            disabled={loading || currentPlan === plan.id}
            className={`
              w-full py-2 px-4 rounded font-medium
              ${currentPlan === plan.id 
                ? 'bg-gray-100 text-gray-500 cursor-not-allowed' 
                : 'bg-blue-600 text-white hover:bg-blue-700'
              }
            `}
          >
            {loading ? 'Processing...' : 
             currentPlan === plan.id ? 'Current Plan' : 'Select Plan'}
          </button>
        </div>
      ))}
    </div>
  );
}
```

```typescript
// exports/web/pages/BillingPage.tsx
import React from 'react';
import { PricingTable } from '../widgets/PricingTable';
import { SubscriptionDetails } from '../widgets/SubscriptionDetails';
import { InvoiceHistory } from '../widgets/InvoiceHistory';

interface BillingPageProps {
  customerId: string;
}

export function BillingPage({ customerId }: BillingPageProps) {
  const { customer, subscriptions, loading } = useBillingActor({
    customerId
  });
  
  if (loading) return <div>Loading billing information...</div>;
  
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <h1 className="text-3xl font-bold">Billing & Subscriptions</h1>
      
      {subscriptions.length > 0 ? (
        <>
          <SubscriptionDetails 
            subscription={subscriptions[0]} 
            customer={customer}
          />
          <InvoiceHistory customerId={customerId} />
        </>
      ) : (
        <PricingTable 
          plans={AVAILABLE_PLANS}
          onSelectPlan={(planId) => {
            // Handle plan selection
          }}
        />
      )}
    </div>
  );
}
```

#### Mobile Components
```typescript
// exports/mobile/screens/BillingScreen.tsx
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useBillingActor } from '@actor-platform/react-native';

interface BillingScreenProps {
  navigation: any;
  customerId: string;
}

export function BillingScreen({ navigation, customerId }: BillingScreenProps) {
  const { customer, subscriptions, loading } = useBillingActor({
    customerId
  });
  
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Loading billing information...</Text>
      </View>
    );
  }
  
  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>
        Billing
      </Text>
      
      {/* Subscription details */}
      {subscriptions.map(subscription => (
        <SubscriptionCard 
          key={subscription.id}
          subscription={subscription}
          onManage={() => navigation.navigate('SubscriptionDetails', {
            subscriptionId: subscription.id
          })}
        />
      ))}
    </ScrollView>
  );
}
```

### 6. Define GraphQL Schema Contributions
```graphql
# exports/schema.graphql

# Types this actor contributes
type Customer {
  id: ID!
  email: String!
  stripeCustomerId: String!
  subscriptions: [Subscription!]!
  totalRevenue: Float!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Subscription {
  id: ID!
  customerId: ID!
  status: SubscriptionStatus!
  priceId: String!
  currentPeriodStart: DateTime!
  currentPeriodEnd: DateTime!
  cancelAtPeriodEnd: Boolean!
  trialEnd: DateTime
}

type Invoice {
  id: ID!
  customerId: ID!
  subscriptionId: ID!
  amount: Float!
  currency: String!
  status: InvoiceStatus!
  dueDate: DateTime!
  paidAt: DateTime
}

enum SubscriptionStatus {
  ACTIVE
  CANCELED  
  PAST_DUE
  TRIALING
}

enum InvoiceStatus {
  DRAFT
  OPEN
  PAID
  VOID
}

# Extend main Query type
extend type Query {
  # Billing-specific queries
  customer(id: ID!): Customer
  subscription(id: ID!): Subscription
  customerSubscriptions(customerId: ID!, status: SubscriptionStatus): [Subscription!]!
  customerInvoices(customerId: ID!, limit: Int): [Invoice!]!
}

# Extend main Mutation type  
extend type Mutation {
  # Billing-specific mutations
  createCustomer(userId: ID!, email: String!, metadata: JSON): CreateCustomerResult!
  createSubscription(input: CreateSubscriptionInput!): CreateSubscriptionResult!
  cancelSubscription(id: ID!, immediately: Boolean): Subscription!
  updatePaymentMethod(customerId: ID!, paymentMethodId: String!): Customer!
}

# Extend main Subscription type
extend type Subscription {
  # Real-time subscription updates
  subscriptionUpdated(customerId: ID!): Subscription!
  customerUpdated(customerId: ID!): Customer!
}

# Input types
input CreateSubscriptionInput {
  customerId: ID!
  priceId: String!
  trialDays: Int
  couponId: String
}

# Result types
type CreateCustomerResult {
  success: Boolean!
  customer: Customer
  error: String
}

type CreateSubscriptionResult {
  success: Boolean!
  subscription: Subscription
  checkoutUrl: String
  error: String
}
```

## Advanced Actor Patterns

### 1. State Management with Migrations
```typescript
// src/state/migrations.ts
import { StateMigration } from '@actor-platform/sdk';

export const stateMigrations: StateMigration[] = [
  {
    version: '1.0.0',
    up: (state: any) => {
      // Initial state structure
      return {
        customers: {},
        subscriptions: {},
        invoices: {}
      };
    }
  },
  {
    version: '1.1.0', 
    up: (state: any) => {
      // Add totalRevenue field to customers
      const customers = { ...state.customers };
      Object.values(customers).forEach((customer: any) => {
        if (!customer.totalRevenue) {
          customer.totalRevenue = 0;
        }
      });
      
      return {
        ...state,
        customers
      };
    }
  }
];
```

### 2. Event Sourcing Pattern
```typescript
// src/events/event-store.ts
import { EventStore } from '@actor-platform/sdk';

export class BillingEventStore extends EventStore {
  async appendEvent(streamId: string, event: DomainEvent) {
    // Store event in append-only log
    await this.store.append(streamId, {
      eventId: generateId(),
      eventType: event.type,
      eventData: event.payload,
      metadata: {
        timestamp: Date.now(),
        version: this.getNextVersion(streamId)
      }
    });
    
    // Update read model
    await this.updateReadModel(streamId, event);
  }
  
  async replayEvents(streamId: string): Promise<any> {
    const events = await this.store.getEvents(streamId);
    let state = this.getInitialState();
    
    for (const event of events) {
      state = this.applyEvent(state, event);
    }
    
    return state;
  }
}
```

### 3. Circuit Breaker for External Services
```typescript
// src/integrations/stripe.ts
import { CircuitBreaker } from '@actor-platform/sdk';

export class StripeIntegration {
  private stripe: Stripe;
  private circuitBreaker: CircuitBreaker;
  
  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      timeout: 10000,
      resetTimeout: 30000
    });
  }
  
  async createCustomer(data: CustomerData) {
    return await this.circuitBreaker.execute(async () => {
      return await this.stripe.customers.create(data);
    });
  }
  
  async createSubscription(data: SubscriptionData) {
    return await this.circuitBreaker.execute(async () => {
      return await this.stripe.subscriptions.create(data);
    });
  }
}
```

## Testing Actors Following Standards

### 1. Unit Tests (Handler Isolation)
```typescript
// tests/unit/commands/create-customer.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTestContext } from '@actor-platform/testing';
import { createCustomer } from '../../../src/handlers/commands/create-customer';

describe('createCustomer command handler', () => {
  it('should create customer successfully', async () => {
    // Setup test context with mocked dependencies
    const context = createTestContext({
      event: {
        type: 'CREATE_CUSTOMER',
        payload: { 
          userId: 'user_123',
          email: 'test@example.com' 
        }
      },
      state: { 
        customers: {}, 
        subscriptions: {}, 
        invoices: {} 
      },
      config: { 
        stripeSecretKey: 'sk_test_123',
        stripeWebhookSecret: 'whsec_test',
        defaultCurrency: 'usd'
      },
      dependencies: {
        user: {
          ask: vi.fn().mockResolvedValue({
            success: true,
            data: { id: 'user_123', email: 'test@example.com' }
          })
        },
        analytics: {
          tell: vi.fn().mockResolvedValue({ success: true })
        }
      }
    });
    
    // Mock Stripe
    const mockStripeCustomer = {
      id: 'cus_test123',
      email: 'test@example.com'
    };
    
    vi.mock('../../../src/integrations/stripe', () => ({
      StripeIntegration: vi.fn().mockImplementation(() => ({
        createCustomer: vi.fn().mockResolvedValue(mockStripeCustomer)
      }))
    }));
    
    // Execute handler
    const result = await createCustomer(context);
    
    // Assertions
    expect(result.success).toBe(true);
    expect(result.data.customerId).toBe('cus_test123');
    expect(result.state.customers['cus_test123']).toBeDefined();
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('CUSTOMER_CREATED');
    
    // Verify dependency calls
    expect(context.dependencies.user.ask).toHaveBeenCalledWith('GET_USER', {
      userId: 'user_123'
    });
    expect(context.dependencies.analytics.tell).toHaveBeenCalledWith('TRACK_EVENT', {
      userId: 'user_123',
      event: 'customer_created',
      properties: {
        customerId: 'cus_test123',
        email: 'test@example.com'
      }
    });
  });
  
  it('should handle user not found error', async () => {
    const context = createTestContext({
      event: {
        type: 'CREATE_CUSTOMER',
        payload: { 
          userId: 'invalid_user',
          email: 'test@example.com' 
        }
      },
      state: { customers: {}, subscriptions: {}, invoices: {} },
      dependencies: {
        user: {
          ask: vi.fn().mockResolvedValue({
            success: false,
            error: 'User not found'
          })
        }
      }
    });
    
    const result = await createCustomer(context);
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('User not found');
    expect(result.state).toEqual(context.state); // State unchanged
  });
});
```

### 2. Integration Tests (Actor Communication)
```typescript
// tests/integration/billing-user-flow.test.ts
import { describe, it, expect } from 'vitest';
import { createActorSystem } from '@actor-platform/testing';
import { billingActor } from '../../src';
import { userActor } from '@actors/user';
import { notificationActor } from '@actors/notification';

describe('Billing + User + Notification Integration', () => {
  const actorSystem = createActorSystem({
    actors: [billingActor, userActor, notificationActor],
    environment: 'test'
  });
  
  it('should handle complete customer creation flow', async () => {
    // 1. Create user first
    const userResult = await actorSystem.send('user', {
      type: 'SEND_MAGIC_LINK',
      payload: { email: 'test@example.com' }
    });
    
    expect(userResult.success).toBe(true);
    const userId = userResult.data.userId;
    
    // 2. Create billing customer
    const customerResult = await actorSystem.send('billing', {
      type: 'CREATE_CUSTOMER',
      payload: { userId, email: 'test@example.com' }
    });
    
    expect(customerResult.success).toBe(true);
    const customerId = customerResult.data.customerId;
    
    // 3. Verify event was published and received by notification actor
    await actorSystem.waitForEvent('CUSTOMER_CREATED');
    
    // 4. Check notification was sent
    const messages = await actorSystem.query('notification', {
      type: 'GET_MESSAGES',
      payload: { recipient: 'test@example.com' }
    });
    
    expect(messages.data).toHaveLength(1);
    expect(messages.data[0].template).toBe('customer_welcome');
    
    // 5. Verify analytics tracking
    const analytics = await actorSystem.query('analytics', {
      type: 'GET_EVENTS',
      payload: { userId, event: 'customer_created' }
    });
    
    expect(analytics.data).toHaveLength(1);
  });
  
  it('should handle subscription creation with trial', async () => {
    // Setup existing customer
    const customerId = 'cus_test123';
    await actorSystem.setState('billing', {
      customers: {
        [customerId]: {
          id: customerId,
          email: 'test@example.com',
          subscriptions: [],
          totalRevenue: 0
        }
      }
    });
    
    // Create subscription
    const result = await actorSystem.send('billing', {
      type: 'CREATE_SUBSCRIPTION',
      payload: {
        customerId,
        priceId: 'price_test123',
        trialDays: 7
      }
    });
    
    expect(result.success).toBe(true);
    expect(result.data.subscriptionId).toBeDefined();
    
    // Verify state update
    const state = await actorSystem.getState('billing');
    const subscription = Object.values(state.subscriptions)[0];
    expect(subscription.status).toBe('trialing');
    expect(subscription.trialEnd).toBeDefined();
  });
});
```

### 3. Component Tests
```typescript
// tests/components/PricingTable.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PricingTable } from '../../exports/web/widgets/PricingTable';
import { BillingActorProvider } from '@actor-platform/react';

const mockPlans = [
  {
    id: 'starter',
    name: 'Starter',
    price: 29,
    interval: 'month',
    features: ['10 projects', 'Basic support']
  },
  {
    id: 'pro',
    name: 'Professional',
    price: 99,
    interval: 'month', 
    features: ['Unlimited projects', 'Priority support']
  }
];

describe('PricingTable Component', () => {
  it('should render all plans correctly', () => {
    render(
      <BillingActorProvider>
        <PricingTable 
          plans={mockPlans}
          onSelectPlan={vi.fn()}
        />
      </BillingActorProvider>
    );
    
    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Professional')).toBeInTheDocument();
    expect(screen.getByText('$29')).toBeInTheDocument();
    expect(screen.getByText('$99')).toBeInTheDocument();
  });
  
  it('should handle plan selection', async () => {
    const onSelectPlan = vi.fn();
    
    render(
      <BillingActorProvider>
        <PricingTable 
          plans={mockPlans}
          onSelectPlan={onSelectPlan}
        />
      </BillingActorProvider>
    );
    
    const selectButton = screen.getAllByText('Select Plan')[0];
    fireEvent.click(selectButton);
    
    await waitFor(() => {
      expect(onSelectPlan).toHaveBeenCalledWith('starter');
    });
  });
  
  it('should show current plan correctly', () => {
    render(
      <BillingActorProvider>
        <PricingTable 
          plans={mockPlans}
          currentPlan="pro"
          onSelectPlan={vi.fn()}
        />
      </BillingActorProvider>
    );
    
    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    const currentPlanButton = screen.getByRole('button', { name: /current plan/i });
    expect(currentPlanButton).toBeDisabled();
  });
});
```

## Actor Configuration for Marketplace

### Actor Configuration File
```typescript
// actor.config.ts
import { defineConfig } from '@actor-platform/sdk';

export default defineConfig({
  // Basic Identity
  name: 'billing',
  version: '1.0.0',
  
  // Marketplace Metadata
  metadata: {
    displayName: 'Billing & Subscriptions',
    description: 'Complete subscription billing and payment processing with Stripe integration',
    category: 'payments',
    tags: ['stripe', 'billing', 'subscriptions', 'saas', 'payments'],
    author: 'Actor Platform',
    license: 'MIT',
    repository: 'https://github.com/actor-platform/billing-actor',
    homepage: 'https://actors.dev/billing',
    documentation: 'https://docs.actors.dev/actors/billing'
  },
  
  // Pricing Model for Marketplace
  pricing: {
    model: 'subscription',
    plans: [
      {
        name: 'Starter',
        price: 0,
        interval: 'month',
        limits: { 
          customers: 100, 
          transactions: 1000,
          revenue: 10000 // $10k MRR limit
        },
        features: [
          'Basic subscription billing',
          'Stripe integration',
          'Customer portal',
          'Email notifications'
        ]
      },
      {
        name: 'Professional',
        price: 29,
        interval: 'month',
        limits: { 
          customers: 10000, 
          transactions: 50000,
          revenue: 1000000 // $1M MRR limit
        },
        features: [
          'Everything in Starter',
          'Usage-based billing',
          'Advanced analytics',
          'Webhook support',
          'Priority support'
        ]
      },
      {
        name: 'Enterprise',
        price: 99,
        interval: 'month',
        limits: { 
          customers: -1, // Unlimited
          transactions: -1,
          revenue: -1
        },
        features: [
          'Everything in Professional',
          'Custom integrations',
          'SLA guarantee',
          'Dedicated support',
          'On-premise deployment'
        ]
      }
    ]
  },
  
  // Required Environment Variables
  environment: {
    STRIPE_SECRET_KEY: {
      description: 'Stripe secret key for payment processing',
      required: true,
      type: 'secret',
      validation: /^sk_(test|live)_/
    },
    STRIPE_WEBHOOK_SECRET: {
      description: 'Stripe webhook endpoint secret for event verification',
      required: true,
      type: 'secret',
      validation: /^whsec_/
    },
    DEFAULT_CURRENCY: {
      description: 'Default currency for transactions',
      required: false,
      type: 'string',
      default: 'usd'
    }
  },
  
  // Dependencies and Capabilities
  dependencies: {
    required: [], // No hard dependencies
    optional: ['user', 'notification', 'analytics'],
    external: ['stripe.com']
  },
  
  // NPM Dependencies
  npmDependencies: {
    stripe: '^14.0.0',
    zod: '^3.22.0'
  },
  
  // Deployment Configuration
  deployment: {
    vercel: {
      functions: ['api/billing'],
      environment: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
      regions: ['iad1', 'sfo1', 'fra1'], // US East, US West, Europe
      timeout: 30000 // 30 seconds for payment processing
    },
    kubernetes: {
      replicas: 3,
      resources: {
        requests: { cpu: '100m', memory: '128Mi' },
        limits: { cpu: '500m', memory: '512Mi' }
      },
      autoscaling: {
        minReplicas: 2,
        maxReplicas: 10,
        targetCPU: 70
      }
    }
  },
  
  // Quality Metrics
  quality: {
    testCoverage: 95,
    performanceBenchmarks: {
      p95ResponseTime: '200ms',
      throughput: '1000 rps',
      availability: '99.9%'
    },
    securityAudit: {
      lastAuditDate: '2024-01-15',
      auditor: 'Security Co',
      score: 'A+'
    }
  }
});
```

## Deployment

### 1. Vercel Configuration
```json
// vercel.json
{
  "functions": {
    "app/api/actors/billing/route.js": {
      "maxDuration": 30
    }
  },
  "env": {
    "STRIPE_SECRET_KEY": "@billing_stripe_secret_key",
    "STRIPE_WEBHOOK_SECRET": "@billing_stripe_webhook_secret",
    "DEFAULT_CURRENCY": "usd"
  },
  "rewrites": [
    {
      "source": "/api/billing/:path*",
      "destination": "/api/actors/billing/:path*"
    }
  ],
  "headers": [
    {
      "source": "/api/billing/webhook/stripe",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    }
  ]
}
```

### 2. Deploy Actor
```bash
# Validate actor configuration
relay validate

# Run quality checks
relay check --coverage 90 --performance --security

# Build and package
relay build

# Deploy to Vercel
relay deploy --target vercel --env production

# Or deploy to specific domain
relay deploy --target vercel --domain billing.myapp.com

# Monitor deployment
relay status --deployment-id dep_123
```

### 3. Publish to Marketplace
```bash
# Package for marketplace
relay package --include-tests --include-docs

# Validate marketplace requirements
relay marketplace validate

# Publish to marketplace
relay marketplace publish --tier silver

# Update marketplace listing
relay marketplace update --description "Updated with new features"
```

This comprehensive development guide follows the official Actor Definition Guide specifications and provides everything needed to build production-ready actors for the SMB/startup PoC.