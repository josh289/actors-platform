# Getting Started with Actor-Agent Development Platform

Welcome to the Actor-Agent Development Platform! This guide will help you build your first production-ready application in under 5 minutes.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- A Vercel account (for deployment)
- Basic knowledge of TypeScript and React

## Installation

### 1. Install the Relay CLI

The Relay CLI is your primary tool for working with the platform:

```bash
npm install -g @actors-platform/relay
```

Verify installation:
```bash
relay --version
```

### 2. Create Your First Project

```bash
relay init my-first-app
```

You'll be prompted to:
- Choose a project name
- Select core actors to include
- Pick your deployment target

### 3. Project Structure

After initialization, your project will have:

```
my-first-app/
├── src/
│   └── index.ts          # Application entry point
├── relay.config.json     # Actor configuration
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
└── .gitignore          # Git ignore file
```

## Understanding Actors

Actors are self-contained business components that:
- Handle specific domains (auth, billing, etc.)
- Manage their own state
- Communicate via events
- Export reusable UI components

### Core Actors Available

1. **user-auth** - Complete authentication system
   - Magic link login
   - Social authentication
   - Session management
   - Role-based access control

2. **stripe-billing** - Payment processing
   - Subscription management
   - Invoice generation
   - Payment webhooks
   - Customer portal

3. **notifications** - Multi-channel messaging
   - Email templates
   - SMS delivery
   - Push notifications
   - User preferences

4. **analytics** - Business intelligence
   - Event tracking
   - Metric calculation
   - Funnel analysis
   - Custom dashboards

## Building Your First Feature

### Example: User Authentication

1. **Add the authentication actor**:
```bash
relay add-actor user-auth
```

2. **Use the login component**:
```typescript
// src/pages/login.tsx
import { LoginForm } from '@actors-platform/user-auth/components';

export default function LoginPage() {
  const handleSuccess = (data) => {
    console.log('User logged in:', data);
    // Redirect to dashboard
  };

  return (
    <div>
      <h1>Welcome Back</h1>
      <LoginForm onSuccess={handleSuccess} />
    </div>
  );
}
```

3. **Protect routes with auth**:
```typescript
// src/pages/dashboard.tsx
import { AuthGuard } from '@actors-platform/user-auth/components';

export default function Dashboard() {
  return (
    <AuthGuard requiredPermission="read:dashboard">
      <h1>Dashboard</h1>
      {/* Your protected content */}
    </AuthGuard>
  );
}
```

### Example: Adding Payments

1. **Add Stripe billing**:
```bash
relay add-actor stripe-billing
relay configure stripe-billing --api-key sk_test_...
```

2. **Display pricing**:
```typescript
// src/pages/pricing.tsx
import { PricingTable } from '@actors-platform/stripe-billing/components';

export default function Pricing() {
  return (
    <PricingTable 
      plans={['basic', 'pro', 'enterprise']}
      onSelect={(plan) => {
        // Handle plan selection
      }}
    />
  );
}
```

## Actor Communication

### Command Pattern (Actions)
```typescript
// Send a command to an actor
await relay.command('notifications', {
  type: 'SEND_EMAIL',
  payload: {
    userId: 'user123',
    template: 'welcome',
    variables: {
      name: 'John Doe'
    }
  }
});
```

### Query Pattern (Data Fetching)
```typescript
// Query data from an actor
const user = await relay.query('user-auth', {
  type: 'GET_USER',
  payload: { userId: 'user123' }
});
```

### Event Subscriptions
```typescript
// Subscribe to actor events
relay.on('user-auth.USER_REGISTERED', async (event) => {
  console.log('New user registered:', event.payload);
  
  // Trigger welcome email
  await relay.command('notifications', {
    type: 'SEND_WELCOME_EMAIL',
    payload: { userId: event.payload.userId }
  });
});
```

## Development Workflow

### 1. Start Development Server
```bash
npm run dev
```

This starts:
- Local actor runtime
- Hot module reloading
- TypeScript watching
- Development dashboard at http://localhost:3000

### 2. Test Your Application
```bash
npm run test
```

The platform enforces:
- 90% test coverage minimum
- Integration tests for actors
- Component testing
- End-to-end scenarios

### 3. Build for Production
```bash
npm run build
```

This:
- Optimizes actor bundles
- Generates production configs
- Validates all schemas
- Creates deployment artifacts

## Deployment

### Deploy to Vercel

1. **Configure deployment**:
```bash
relay configure deployment --target vercel
```

2. **Set environment variables**:
```bash
relay secrets set DATABASE_URL postgres://...
relay secrets set STRIPE_SECRET_KEY sk_live_...
```

3. **Deploy**:
```bash
relay deploy --env production
```

### Deploy to Kubernetes

1. **Generate manifests**:
```bash
relay deploy --target k8s --generate-only
```

2. **Apply to cluster**:
```bash
kubectl apply -f ./k8s/
```

## Monitoring & Debugging

### View Actor Logs
```bash
relay logs user-auth --tail 100
```

### Monitor Performance
```bash
relay metrics --actor stripe-billing --period 1h
```

### Debug Events
```bash
relay events --filter "type:USER_*" --limit 50
```

## Next Steps

1. **Explore the Actor Marketplace**:
   ```bash
   relay marketplace browse
   ```

2. **Create a Custom Actor**:
   ```bash
   relay create-actor my-custom-actor
   ```

3. **Join the Community**:
   - Discord: [discord.gg/actors](https://discord.gg/actors)
   - Forum: [forum.actors.dev](https://forum.actors.dev)

## Common Patterns

### Composing Actors

```typescript
// Combine multiple actors for complex features
export async function processOrder(orderId: string) {
  // Verify payment
  const payment = await relay.query('stripe-billing', {
    type: 'GET_PAYMENT',
    payload: { orderId }
  });

  if (payment.status === 'succeeded') {
    // Send confirmation
    await relay.command('notifications', {
      type: 'SEND_ORDER_CONFIRMATION',
      payload: { orderId }
    });

    // Track analytics
    await relay.command('analytics', {
      type: 'TRACK_EVENT',
      payload: {
        name: 'order_completed',
        properties: { orderId, amount: payment.amount }
      }
    });
  }
}
```

### Error Handling

```typescript
try {
  const result = await relay.command('user-auth', {
    type: 'CREATE_USER',
    payload: { email, password }
  });
} catch (error) {
  if (error.code === 'USER_EXISTS') {
    // Handle duplicate user
  } else {
    // Handle other errors
  }
}
```

## Troubleshooting

### Common Issues

1. **Actor not found**:
   - Run `relay list` to see installed actors
   - Check `relay.config.json` for configuration

2. **Permission denied**:
   - Verify API keys are set correctly
   - Check actor permissions in config

3. **Build failures**:
   - Run `relay validate` to check configuration
   - Ensure all dependencies are installed

### Getting Help

- Documentation: [docs.actors.dev](https://docs.actors.dev)
- GitHub Issues: [github.com/actors-platform/actors](https://github.com/actors-platform/actors)
- Email Support: support@actors.dev

---

Congratulations! You're now ready to build production-ready applications with the Actor-Agent Development Platform. 🎉