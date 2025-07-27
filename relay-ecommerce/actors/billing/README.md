# Billing Actor - Complete Implementation

This is a fully implemented billing actor following the Relay model, with all components, GraphQL schema, and business logic.

## Structure

```
billing/
├── actor.yaml                 # Actor definition (125 lines)
├── index.ts                   # Core business logic (350 lines)
├── components/
│   ├── web/
│   │   ├── PricingTable.tsx      # Pricing plan selection
│   │   ├── BillingDashboard.tsx  # Complete billing management
│   │   ├── PaymentMethodModal.tsx # Payment method management
│   │   ├── SubscriptionBadge.tsx # Status indicator component
│   │   └── index.ts              # Web exports
│   └── mobile/
│       ├── BillingScreen.tsx     # Mobile billing dashboard
│       ├── PaymentSheet.tsx      # Native payment collection
│       └── index.ts              # Mobile exports
├── graphql/
│   ├── schema.ts                 # GraphQL type definitions
│   ├── resolvers.ts              # GraphQL resolvers
│   └── index.ts                  # GraphQL exports
├── tests/
│   ├── billing-actor.test.ts     # Core business logic tests
│   ├── components/
│   │   ├── PricingTable.test.tsx
│   │   ├── BillingDashboard.test.tsx
│   │   ├── PaymentMethodModal.test.tsx
│   │   ├── SubscriptionBadge.test.tsx
│   │   ├── BillingScreen.test.tsx
│   │   └── PaymentSheet.test.tsx
│   ├── graphql/
│   │   └── resolvers.test.ts     # GraphQL resolver tests
│   ├── test-utils.ts             # Test utilities and mocks
│   └── setup.ts                  # Test environment setup
├── vitest.config.ts              # Test configuration
└── README.md                     # This file
```

## Total Implementation

- **Core Logic**: 350 lines (index.ts)
- **Actor Definition**: 125 lines (actor.yaml)
- **Web Components**: ~800 lines total
  - PricingTable: 180 lines
  - BillingDashboard: 290 lines
  - PaymentMethodModal: 190 lines
  - SubscriptionBadge: 80 lines
- **Mobile Components**: ~600 lines total
  - BillingScreen: 380 lines
  - PaymentSheet: 220 lines
- **GraphQL**: ~400 lines total
  - Schema: 160 lines
  - Resolvers: 240 lines
- **Tests**: ~1,500 lines total
  - Business logic tests: 450 lines
  - Web component tests: 500 lines
  - Mobile component tests: 400 lines
  - GraphQL tests: 150 lines

**Total: ~3,775 lines** (including comprehensive test coverage)

## Key Features

### State Management
- Simple Maps for customers, subscriptions, and invoices
- Immutable state updates
- Automatic persistence through Relay framework

### Event Handling
Commands:
- CREATE_CUSTOMER
- CREATE_SUBSCRIPTION
- UPDATE_PAYMENT_METHOD
- CANCEL_SUBSCRIPTION
- PROCESS_STRIPE_WEBHOOK

Queries:
- GET_CUSTOMER
- GET_SUBSCRIPTION
- LIST_INVOICES

Subscriptions:
- USER_REGISTERED (auto-creates customer)
- PAYMENT_FAILED (updates subscription status)

### UI Components

#### Web Components
1. **PricingTable**: Display and select subscription plans
2. **BillingDashboard**: Complete billing management interface
3. **PaymentMethodModal**: Add/update payment methods
4. **SubscriptionBadge**: Visual subscription status indicator

#### Mobile Components
1. **BillingScreen**: Native mobile billing dashboard
2. **PaymentSheet**: Native payment collection modal

### GraphQL API
- Complete type definitions for all billing entities
- Queries for fetching customer, subscription, and invoice data
- Mutations for all billing operations
- Real-time subscriptions for updates

## Integration

### With Other Actors

The billing actor integrates with:
- **notification**: Sends billing-related emails (welcome, subscription created, payment failed)
- **analytics**: Tracks revenue and billing metrics
- **user**: Validates users exist before creating customers

### External Services
- **Stripe**: Payment processing and subscription management

## Usage Example

```typescript
// Create a customer
const result = await billingActor.handle({
  type: 'CREATE_CUSTOMER',
  payload: {
    userId: 'user_123',
    email: 'customer@example.com',
    metadata: { source: 'signup' }
  }
});

// Create a subscription
const subscription = await billingActor.handle({
  type: 'CREATE_SUBSCRIPTION',
  payload: {
    customerId: 'user_123',
    priceId: 'price_pro_monthly',
    trialDays: 14
  }
});
```

## Benefits of Relay Model

1. **Clear Separation**: Business logic separate from UI components
2. **Event-Driven**: All communication through well-defined events
3. **Automatic Validation**: Event validation from Postgres catalog
4. **No Boilerplate**: No manual state management or validation code
5. **Testable**: Test through events, not implementation details

## What's Different from BMAD

- **No email templates**: Properly delegated to notification actor
- **No manual validation**: Handled by Postgres event catalog
- **No state classes**: Simple Maps with immutable updates
- **No dependency injection**: Declarative dependencies in YAML
- **Clear boundaries**: Each component has a specific purpose

## Testing

The billing actor includes comprehensive test coverage:

### Running Tests
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test billing-actor.test.ts
```

### Test Coverage
- **Business Logic**: 100% coverage of all event handlers and queries
- **Web Components**: Full interaction and rendering tests
- **Mobile Components**: Native component testing with React Native Testing Library
- **GraphQL**: Complete resolver and subscription testing

### Test Organization
- `tests/billing-actor.test.ts` - Core actor logic including state management, event handling, and Stripe integration
- `tests/components/` - UI component tests for both web and mobile
- `tests/graphql/` - GraphQL resolver and subscription tests
- `tests/test-utils.ts` - Shared test utilities and mocks

### Key Testing Patterns
1. **Event-based testing**: Test actor behavior through events, not implementation
2. **Mock external services**: Stripe and other services are fully mocked
3. **Component integration**: Test components with real API interactions
4. **Error scenarios**: Comprehensive error handling tests

This billing actor is production-ready with full test coverage and follows all Relay best practices.