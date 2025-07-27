# Relay E-commerce Implementation

This is a production-ready e-commerce platform built using the Relay methodology with Postgres event catalog integration.

## Overview

The system implements a complete e-commerce platform with:
- **Event-driven architecture** using actors
- **Postgres event catalog** as the single source of truth
- **YAML-based actor definitions** (200 lines vs 10,000+ lines of boilerplate)
- **Vercel deployment** ready
- **Real-time event validation** against the catalog

## Architecture

### Core Components

1. **Event Catalog (Postgres)**
   - Single source of truth for all events
   - Schema validation
   - Event routing configuration
   - System flow definitions

2. **Actor Runtime**
   - Validates events against catalog
   - Routes events based on patterns (ask/tell/publish)
   - Manages actor state
   - Handles dependencies

3. **Event Bus (Redis)**
   - Handles inter-actor communication
   - Supports synchronous (ask) and asynchronous (tell/publish) patterns
   - Provides at-least-once delivery guarantees

### Actors

- **user** - Authentication and user management
- **cart** - Shopping cart operations
- **inventory** - Stock management
- **payment** - Payment processing
- **order** - Order lifecycle
- **shipping** - Fulfillment and delivery
- **billing** - Subscriptions and invoicing
- **notification** - Email/SMS/Push notifications
- **analytics** - Event tracking and metrics

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Vercel CLI

### Environment Variables

Create a `.env` file:

```bash
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=event_catalog
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# External Services
STRIPE_SECRET_KEY=sk_test_...
SENDGRID_API_KEY=SG...
TWILIO_ACCOUNT_SID=AC...
MIXPANEL_TOKEN=...
```

### Installation

```bash
# Install dependencies
npm install

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

## Usage

### Adding Items to Cart

```bash
curl -X POST http://localhost:3000/api/actors/cart \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "ADD_TO_CART",
    "payload": {
      "userId": "user123",
      "productId": "prod456",
      "quantity": 2,
      "price": 29.99,
      "name": "Example Product"
    }
  }'
```

### Querying Cart Contents

```bash
curl -X POST http://localhost:3000/api/actors/cart \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "GET_CART",
    "payload": {
      "userId": "user123"
    }
  }'
```

### Viewing Event Catalog

```bash
# Get all events
curl http://localhost:3000/api/catalog/events

# Get specific event
curl http://localhost:3000/api/catalog/events?event_name=CART_CHECKED_OUT

# Get actor events
curl http://localhost:3000/api/catalog/events?actor=cart
```

## Deployment

### Deploy to Vercel

```bash
# Configure Vercel environment variables
vercel env add POSTGRES_HOST
vercel env add POSTGRES_USER
vercel env add POSTGRES_PASSWORD
# ... add all required env vars

# Deploy
npm run deploy
```

## Development

### Adding a New Actor

1. Create actor directory: `actors/[actor-name]/`
2. Define actor in `actor.yaml`
3. Implement actor class extending `RelayActor`
4. Add events to Postgres catalog
5. Create API endpoint in `api/actors/[actor-name]/`

### Adding New Events

```sql
-- Add to migrations or run directly
INSERT INTO event_definitions (event_name, description, producer_actor) 
VALUES ('NEW_EVENT', 'Description', 'actor_name');

-- Add consumers
INSERT INTO event_consumers (event_id, consumer_actor, pattern)
VALUES (
  (SELECT id FROM event_definitions WHERE event_name = 'NEW_EVENT'),
  'consumer_actor',
  'publish'
);
```

## Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Monitoring

The system includes built-in monitoring for:
- Event processing latency
- Actor health checks
- Error rates
- Business metrics

Access metrics at `/api/metrics` endpoint.

## Key Benefits

1. **90% Less Code** - YAML definitions instead of boilerplate
2. **Type Safety** - Full TypeScript with Zod validation
3. **Event Catalog** - Single source of truth in Postgres
4. **Scalable** - Actors scale independently
5. **Testable** - Clear boundaries and dependencies
6. **Production Ready** - Error handling, monitoring, deployment

## License

MIT