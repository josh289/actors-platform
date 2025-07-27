# Relay Methodology Migration Plan

## Executive Summary

This document outlines the migration from our current actor framework to the Relay methodology, enabling us to build production-ready e-commerce systems with 90% less code. The migration will transform our verbose TypeScript-based approach into Relay's streamlined YAML configuration system.

## Migration Overview

### Current State
- 1000+ lines of TypeScript per actor
- Events defined in multiple locations
- No unified system view
- Complex integration patterns
- 4 core actors (user, billing, notification, analytics)
- **Existing Postgres-based global event catalog**

### Target State (Relay Methodology)
- ~200 lines of YAML for entire system
- **Postgres event catalog as source of truth**
- Unified system configuration
- Simple event-driven patterns
- 7+ specialized actors for e-commerce

## Phase 1: Foundation (Week 1) ✅ COMPLETED

### 1.1 Global Event Catalog (Postgres Integration) ✅
Integrate with the existing Postgres-based event catalog as the single source of truth.

**Postgres Event Catalog Schema**
```sql
-- Existing event catalog tables
CREATE TABLE event_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    producer_actor VARCHAR(100) NOT NULL,
    schema_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE event_consumers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES event_definitions(id),
    consumer_actor VARCHAR(100) NOT NULL,
    pattern VARCHAR(20) NOT NULL CHECK (pattern IN ('ask', 'tell', 'publish')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE event_payload_schema (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES event_definitions(id),
    field_name VARCHAR(255) NOT NULL,
    field_type VARCHAR(100) NOT NULL,
    required BOOLEAN DEFAULT true,
    description TEXT,
    validation_rules JSONB
);

-- View for complete event catalog
CREATE VIEW event_catalog AS
SELECT 
    ed.event_name,
    ed.description,
    ed.producer_actor,
    ed.schema_version,
    ARRAY_AGG(DISTINCT ec.consumer_actor) AS consumers,
    JSON_OBJECT_AGG(
        eps.field_name, 
        JSON_BUILD_OBJECT(
            'type', eps.field_type,
            'required', eps.required,
            'description', eps.description
        )
    ) AS payload_schema
FROM event_definitions ed
LEFT JOIN event_consumers ec ON ed.id = ec.event_id
LEFT JOIN event_payload_schema eps ON ed.id = eps.event_id
GROUP BY ed.id, ed.event_name, ed.description, ed.producer_actor, ed.schema_version;
```

**Event Catalog Service Integration**
```yaml
# config/event-catalog.yaml
event_catalog:
  type: postgres
  connection:
    host: ${POSTGRES_HOST}
    port: 5432
    database: event_catalog
    user: ${POSTGRES_USER}
    password: ${POSTGRES_PASSWORD}
    ssl: true
  
  sync:
    enabled: true
    interval: 60s  # Sync changes every minute
    cache_ttl: 300s  # Cache for 5 minutes
    
  validation:
    strict_mode: true  # Reject events not in catalog
    schema_evolution: versioned  # Support schema versions
```

**Event Catalog API**
```typescript
// services/event-catalog.ts
export class PostgresEventCatalog {
  async getEvent(eventName: string): Promise<EventDefinition> {
    const result = await this.db.query(`
      SELECT * FROM event_catalog WHERE event_name = $1
    `, [eventName]);
    return result.rows[0];
  }
  
  async validateEvent(event: Event): Promise<boolean> {
    const definition = await this.getEvent(event.type);
    return this.validatePayload(event.payload, definition.payload_schema);
  }
  
  async getConsumers(eventName: string): Promise<Consumer[]> {
    const result = await this.db.query(`
      SELECT ec.consumer_actor, ec.pattern 
      FROM event_consumers ec
      JOIN event_definitions ed ON ec.event_id = ed.id
      WHERE ed.event_name = $1
    `, [eventName]);
    return result.rows;
  }
}
```

**Migration Script for Existing Events**
```sql
-- Migrate existing events to Postgres catalog
INSERT INTO event_definitions (event_name, description, producer_actor) VALUES
('USER_REGISTERED', 'New user successfully registered', 'user'),
('USER_LOGGED_IN', 'User authentication successful', 'user'),
('ITEM_ADDED_TO_CART', 'Product added to shopping cart', 'cart'),
('CART_CHECKED_OUT', 'User initiated checkout process', 'cart'),
('STOCK_RESERVED', 'Inventory reserved for order', 'inventory'),
('STOCK_INSUFFICIENT', 'Not enough inventory available', 'inventory'),
('PAYMENT_PROCESSED', 'Payment successfully charged', 'payment'),
('PAYMENT_FAILED', 'Payment processing failed', 'payment'),
('ORDER_CREATED', 'Order successfully created', 'order'),
('ORDER_SHIPPED', 'Order dispatched to customer', 'shipping'),
('EMAIL_SENT', 'Email notification delivered', 'notification');

-- Add event consumers
INSERT INTO event_consumers (event_id, consumer_actor, pattern)
SELECT ed.id, consumer, 'publish'
FROM event_definitions ed
CROSS JOIN LATERAL unnest(
  CASE ed.event_name
    WHEN 'USER_REGISTERED' THEN ARRAY['billing', 'notification', 'analytics']
    WHEN 'CART_CHECKED_OUT' THEN ARRAY['order', 'inventory']
    WHEN 'PAYMENT_PROCESSED' THEN ARRAY['order', 'notification', 'analytics']
    ELSE ARRAY[]::VARCHAR[]
  END
) AS consumer;
```

### 1.2 Event Catalog CLI Integration
```bash
# CLI commands to interact with Postgres event catalog
relay events list                     # List all events from Postgres
relay events show USER_REGISTERED     # Show event details
relay events add --file new-event.yaml # Add new event to catalog
relay events validate                 # Validate all actor events against catalog
```

**Original YAML events remain as documentation but Postgres is source of truth**
      userId: string
      email: string
      timestamp: number
    producer: user
    consumers: [billing, notification, analytics]
    
  USER_LOGGED_IN:
    description: "User authentication successful"
    payload:
      userId: string
      sessionId: string
      timestamp: number
    producer: user
    consumers: [analytics]

  # Cart Domain Events  
  ITEM_ADDED_TO_CART:
    description: "Product added to shopping cart"
    payload:
      userId: string
      cartId: string
      productId: string
      quantity: number
      price: number
    producer: cart
    consumers: [analytics, inventory]
    
  CART_CHECKED_OUT:
    description: "User initiated checkout process"
    payload:
      cartId: string
      userId: string
      items: array<{productId: string, quantity: number, price: number}>
      total: number
    producer: cart
    consumers: [order, inventory]

  # Inventory Domain Events
  STOCK_RESERVED:
    description: "Inventory reserved for order"
    payload:
      orderId: string
      reservations: array<{productId: string, quantity: number}>
      expiresAt: timestamp
    producer: inventory
    consumers: [order]
    
  STOCK_INSUFFICIENT:
    description: "Not enough inventory available"
    payload:
      orderId: string
      unavailable: array<{productId: string, requested: number, available: number}>
    producer: inventory
    consumers: [order, cart]

  # Payment Domain Events
  PAYMENT_PROCESSED:
    description: "Payment successfully charged"
    payload:
      orderId: string
      paymentId: string
      amount: number
      method: string
      timestamp: number
    producer: payment
    consumers: [order, notification, analytics]
    
  PAYMENT_FAILED:
    description: "Payment processing failed"
    payload:
      orderId: string
      reason: string
      code: string
      timestamp: number
    producer: payment
    consumers: [order, notification]

  # Order Domain Events
  ORDER_CREATED:
    description: "Order successfully created"
    payload:
      orderId: string
      userId: string
      items: array
      total: number
      status: string
      timestamp: number
    producer: order
    consumers: [notification, shipping, analytics]
    
  ORDER_SHIPPED:
    description: "Order dispatched to customer"
    payload:
      orderId: string
      trackingNumber: string
      carrier: string
      estimatedDelivery: date
    producer: shipping
    consumers: [notification, analytics]

  # Notification Events
  EMAIL_SENT:
    description: "Email notification delivered"
    payload:
      messageId: string
      recipient: string
      template: string
      status: string
      timestamp: number
    producer: notification
    consumers: [analytics]
```

### 1.3 System Configuration with Postgres Integration
Define the entire system architecture with Postgres event catalog integration.

**File: `relay.yaml`**
```yaml
# Relay System Configuration - Complete e-commerce platform
name: ecommerce-platform
version: 1.0.0
description: "Production-ready e-commerce system with Relay methodology"

# Event Catalog Configuration
event_catalog:
  type: postgres
  connection:
    host: ${POSTGRES_HOST}
    port: 5432
    database: event_catalog
    user: ${POSTGRES_USER}
    password: ${POSTGRES_PASSWORD}
    ssl: true
  
  # Event validation settings
  validation:
    strict: true  # Reject events not in catalog
    cache_ttl: 300  # Cache schema for 5 minutes
    
  # Event synchronization
  sync:
    enabled: true
    interval: 60  # Sync every minute
    on_startup: true  # Load catalog on startup

# Actor Definitions
actors:
  # Core User Management
  user:
    source: ./actors/user
    version: 1.0.0
    instances: 3
    config:
      sessionTimeout: 86400
      magicLinkExpiry: 900
      
  # Shopping Cart
  cart:
    source: ./actors/cart
    version: 1.0.0
    instances: 3
    config:
      sessionTimeout: 3600
      maxItems: 100
      
  # Inventory Management
  inventory:
    source: ./actors/inventory
    version: 1.0.0
    instances: 2
    config:
      reservationTimeout: 900
      lowStockThreshold: 10
      
  # Payment Processing
  payment:
    source: ./actors/payment
    version: 1.0.0
    instances: 2
    config:
      provider: stripe
      currency: usd
      retryAttempts: 3
      
  # Order Management
  order:
    source: ./actors/order
    version: 1.0.0
    instances: 3
    config:
      statuses: [pending, processing, shipped, delivered, cancelled]
      
  # Shipping Integration
  shipping:
    source: ./actors/shipping
    version: 1.0.0
    instances: 2
    config:
      providers: [fedex, ups, usps]
      defaultProvider: fedex
      
  # Billing & Subscriptions
  billing:
    source: ./actors/billing
    version: 1.0.0
    instances: 2
    config:
      provider: stripe
      trialDays: 14
      
  # Notifications
  notification:
    source: ./actors/notification
    version: 1.0.0
    instances: 2
    config:
      emailProvider: sendgrid
      smsProvider: twilio
      
  # Analytics
  analytics:
    source: ./actors/analytics
    version: 1.0.0
    instances: 1
    config:
      provider: mixpanel
      flushInterval: 60000

# System Flows
flows:
  user_registration:
    description: "New user signup flow"
    steps:
      - user.SEND_MAGIC_LINK
      - notification.SEND_EMAIL
      - user.VERIFY_TOKEN
      - user.USER_REGISTERED
      - billing.CREATE_CUSTOMER
      
  checkout:
    description: "Complete checkout process"
    steps:
      - cart.CHECKOUT_CART
      - inventory.CHECK_STOCK
      - order.CREATE_ORDER
      - payment.PROCESS_PAYMENT
      - notification.SEND_CONFIRMATION
      
  order_fulfillment:
    description: "Order shipping flow"
    steps:
      - order.ORDER_CREATED
      - shipping.CREATE_SHIPMENT
      - shipping.ORDER_SHIPPED
      - notification.SEND_TRACKING

# Deployment Configuration
deployment:
  platform: vercel
  environment: production
  regions: [us-east-1, eu-west-1, ap-southeast-1]
  
  monitoring:
    provider: datadog
    alerts:
      - type: error_rate
        threshold: 0.05
        action: notify_oncall
      - type: latency_p95
        threshold: 1000
        action: scale_up
        
  scaling:
    min_instances: 1
    max_instances: 10
    target_cpu: 70
    target_memory: 80
```

## Phase 2: Actor Implementation (Week 2) 🚧 IN PROGRESS

### 2.1 Simplified Actor Structure ✅
Convert verbose TypeScript actors to streamlined YAML definitions.

**Example: `actors/cart/actor.yaml`**
```yaml
actor:
  name: cart
  description: "Shopping cart management"
  version: 1.0.0
  
  # State Schema
  state:
    carts:
      type: Map<string, Cart>
      schema:
        Cart:
          id: string
          userId: string
          items: array<CartItem>
          total: number
          createdAt: timestamp
          updatedAt: timestamp
        CartItem:
          productId: string
          quantity: number
          price: number
          name: string

  # Event Handlers
  handles:
    ADD_TO_CART:
      description: "Add item to cart"
      payload:
        userId: string
        productId: string
        quantity: number
      validates:
        - quantity > 0
        - quantity <= 100
      emits: ITEM_ADDED_TO_CART
      
    REMOVE_FROM_CART:
      description: "Remove item from cart"
      payload:
        cartId: string
        productId: string
      emits: ITEM_REMOVED_FROM_CART
      
    CHECKOUT_CART:
      description: "Start checkout process"
      payload:
        cartId: string
      validates:
        - cart.items.length > 0
      emits: CART_CHECKED_OUT

  # Queries
  queries:
    GET_CART:
      description: "Retrieve cart contents"
      payload:
        userId: string
      returns: Cart
      
    GET_CART_TOTAL:
      description: "Calculate cart total"
      payload:
        cartId: string
      returns: {total: number, itemCount: number}

  # Event Subscriptions
  subscribes:
    STOCK_INSUFFICIENT:
      handler: handleStockInsufficient
      description: "Remove unavailable items"
    
    ORDER_CREATED:
      handler: clearCart
      description: "Clear cart after order"

  # Dependencies
  dependencies:
    inventory:
      events: [CHECK_STOCK]
      pattern: ask
      timeout: 5000
    
    analytics:
      events: [TRACK_EVENT]
      pattern: tell
```

### 2.2 New Folder Structure
```
relay-ecommerce/
├── events.yaml              # Global event catalog
├── relay.yaml              # System configuration
├── actors/
│   ├── user/
│   │   ├── actor.yaml      # Actor definition
│   │   ├── handlers/       # Simple event handlers
│   │   └── components/     # UI components
│   ├── cart/
│   ├── inventory/
│   ├── payment/
│   ├── order/
│   ├── shipping/
│   ├── billing/
│   ├── notification/
│   └── analytics/
├── components/
│   ├── web/               # Shared web components
│   └── mobile/            # Shared mobile components
├── tests/
│   ├── unit/              # Actor unit tests
│   ├── integration/       # System integration tests
│   └── e2e/              # End-to-end flows
└── deploy/
    ├── vercel.json        # Vercel configuration
    └── k8s/              # Kubernetes manifests
```

## Phase 3: Runtime Implementation (Week 3) ✅ COMPLETED

### 3.1 Event Bus Configuration with Postgres Integration ✅
```yaml
# runtime/event-bus.yaml
event_bus:
  provider: redis
  config:
    cluster: true
    nodes:
      - host: redis-1.example.com
      - host: redis-2.example.com
      - host: redis-3.example.com
    
  patterns:
    ask:
      timeout: 5000
      retries: 2
    tell:
      delivery: at_least_once
    publish:
      delivery: best_effort
      
  persistence:
    events: 7_days
    failed: 30_days
    metrics: 90_days
    
  # Event catalog integration
  catalog:
    provider: postgres
    validate_before_send: true
    cache_schemas: true
```

### 3.2 Actor Runtime with Event Catalog
```typescript
// runtime/actor-base.ts
import { EventBus } from '@relay/core';
import { PostgresEventCatalog } from './event-catalog';
import { ActorConfig } from './types';

export abstract class RelayActor {
  private catalog: PostgresEventCatalog;
  
  constructor(
    private config: ActorConfig,
    private eventBus: EventBus
  ) {
    this.catalog = new PostgresEventCatalog(config.catalog);
  }
  
  async handle(event: Event): Promise<Result> {
    // 1. Validate event against Postgres catalog
    const isValid = await this.catalog.validateEvent(event);
    if (!isValid) {
      throw new Error(`Event ${event.type} not in catalog or invalid schema`);
    }
    
    // 2. Process with handler
    const result = await this.processEvent(event);
    
    // 3. Validate and emit resulting events
    for (const emittedEvent of result.events) {
      await this.catalog.validateEvent(emittedEvent);
      const consumers = await this.catalog.getConsumers(emittedEvent.type);
      await this.eventBus.publish(emittedEvent, consumers);
    }
    
    // 4. Update state
    await this.updateState(result.state);
    
    return result;
  }
}
```

### 3.3 Event Synchronization Service
```typescript
// services/event-sync.ts
export class EventSyncService {
  constructor(
    private catalog: PostgresEventCatalog,
    private actors: ActorRegistry
  ) {}
  
  async syncActorEvents() {
    // Sync actor definitions with Postgres catalog
    for (const actor of this.actors.getAll()) {
      const actorEvents = actor.getHandledEvents();
      
      for (const event of actorEvents) {
        const catalogEvent = await this.catalog.getEvent(event.name);
        
        if (!catalogEvent) {
          console.warn(`Event ${event.name} not in catalog`);
          continue;
        }
        
        // Validate actor schema matches catalog
        if (!this.schemasMatch(event.schema, catalogEvent.payload_schema)) {
          throw new Error(`Schema mismatch for ${event.name}`);
        }
      }
    }
  }
  
  async validateEventFlow(flowName: string) {
    // Validate complete event flows against catalog
    const flow = await this.catalog.getFlow(flowName);
    
    for (const step of flow.steps) {
      const event = await this.catalog.getEvent(step.event);
      const producer = this.actors.get(event.producer_actor);
      const consumers = await this.catalog.getConsumers(event.event_name);
      
      // Ensure all actors in flow can handle their events
      if (!producer.canEmit(event.event_name)) {
        throw new Error(`${producer.name} cannot emit ${event.event_name}`);
      }
      
      for (const consumer of consumers) {
        const consumerActor = this.actors.get(consumer.consumer_actor);
        if (!consumerActor.canHandle(event.event_name)) {
          throw new Error(`${consumer.consumer_actor} cannot handle ${event.event_name}`);
        }
      }
    }
  }
}
```

## Phase 4: Testing & Validation (Week 4)

### 4.1 Integration Tests
```yaml
# tests/flows/checkout.test.yaml
test: "Complete checkout flow"
actors: [cart, inventory, payment, order, notification]
steps:
  - given:
      cart:
        state:
          carts:
            cart_123:
              userId: user_456
              items: [{productId: prod_789, quantity: 2, price: 29.99}]
      inventory:
        state:
          products:
            prod_789: {stock: 10}
            
  - when:
      actor: cart
      event: CHECKOUT_CART
      payload: {cartId: cart_123}
      
  - then:
      events:
        - type: CART_CHECKED_OUT
        - type: STOCK_RESERVED
        - type: ORDER_CREATED
        - type: PAYMENT_PROCESSED
        - type: EMAIL_SENT
      state:
        order:
          orders:
            - status: confirmed
```

### 4.2 Performance Benchmarks
```yaml
benchmarks:
  checkout_flow:
    target_p95: 200ms
    target_p99: 500ms
    throughput: 1000_rps
    
  event_processing:
    target_p95: 50ms
    target_p99: 100ms
    throughput: 10000_eps
```

## Phase 5: Deployment (Week 5)

### 5.1 Staged Rollout
```yaml
deployment_stages:
  - stage: canary
    percentage: 5
    duration: 1_hour
    rollback_on:
      - error_rate > 0.1
      - latency_p95 > 500ms
      
  - stage: partial
    percentage: 25
    duration: 4_hours
    rollback_on:
      - error_rate > 0.05
      
  - stage: full
    percentage: 100
    monitor_duration: 24_hours
```

### 5.2 Monitoring Setup
```yaml
monitoring:
  dashboards:
    - name: "System Overview"
      widgets:
        - event_throughput
        - actor_health
        - error_rates
        - latency_percentiles
        
    - name: "Business Metrics"
      widgets:
        - checkout_conversion
        - cart_abandonment
        - payment_success_rate
        - order_fulfillment_time
```

## Success Metrics

### Technical Metrics
- **Code Reduction**: 90% less code (10,000 → 1,000 lines)
- **Configuration Simplicity**: Single 200-line YAML vs distributed TypeScript
- **Development Speed**: 2-3 hours for new features vs 2-3 days
- **Test Coverage**: 95%+ with simplified testing

### Business Metrics
- **Time to Market**: 80% faster feature delivery
- **System Reliability**: 99.9% uptime
- **Performance**: <200ms p95 response time
- **Scalability**: Handle 10x load without code changes

## Risk Mitigation

### Technical Risks
1. **Event Schema Changes**
   - Mitigation: Versioned events with backward compatibility
   
2. **Actor Communication Failures**
   - Mitigation: Circuit breakers and fallback strategies
   
3. **Data Migration**
   - Mitigation: Dual-write period with gradual cutover

### Organizational Risks
1. **Team Training**
   - Mitigation: Comprehensive documentation and workshops
   
2. **Legacy System Dependencies**
   - Mitigation: Adapter actors for gradual migration

## Implementation Status (Updated: Current Date)

### ✅ Completed Components
1. **Postgres Event Catalog** 
   - Schema and migrations created
   - Event catalog service with validation
   - Event synchronization service
   - 40+ events defined for e-commerce

2. **Core Runtime**
   - Actor base class with Postgres integration
   - Event bus with ask/tell/publish patterns
   - Redis and in-memory providers
   - Event validation pipeline

3. **Cart Actor**
   - YAML definition (45 lines)
   - TypeScript implementation
   - API endpoint
   - Full event handling

4. **Infrastructure**
   - Vercel deployment configuration
   - Project structure
   - TypeScript setup
   - Package management

### 🚧 In Progress
1. **Remaining Actors** (Week 2)
   - user actor (authentication, profiles)
   - inventory actor (stock management)
   - payment actor (Stripe integration)
   - order actor (order lifecycle)
   - shipping actor (fulfillment)
   - billing actor (subscriptions)
   - notification actor (email/SMS)
   - analytics actor (metrics)

### 📋 Pending
1. **Testing Suite** (Week 4)
   - Integration tests for flows
   - Unit tests for actors
   - Performance benchmarks
   - E2E test scenarios

2. **Monitoring & Observability** (Week 5)
   - Datadog integration
   - Custom dashboards
   - Alert configurations
   - SLO definitions

3. **Documentation**
   - API documentation
   - Actor development guide
   - Deployment runbook
   - Team training materials

## Timeline Summary

- **Week 1**: Foundation - Event catalog and system configuration ✅
- **Week 2**: Actor implementation - Convert all actors to Relay format 🚧
- **Week 3**: Runtime - Event bus and actor runtime ✅
- **Week 4**: Testing - Integration tests and performance validation 📋
- **Week 5**: Deployment - Staged rollout with monitoring 📋

## Conclusion

This migration plan transforms our current verbose actor framework into Relay's streamlined methodology, enabling rapid development of production-ready e-commerce systems. The key benefits include:

1. **Dramatic code reduction** (90% less code)
2. **Single source of truth** for events and configuration
3. **AI-friendly** architecture that fits in context windows
4. **Production-ready** patterns proven in e-commerce

Following this plan, we'll have a complete Relay-based e-commerce platform operational within 5 weeks, with the ability to add new features in hours instead of weeks.