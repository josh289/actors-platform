/**
 * Event Registry Basics
 * 
 * This example shows the fundamental concepts of the event registry system
 */

import { 
  PostgresEventRegistry,
  EventDefinition,
  EventCategory,
  ActorManifest
} from '@actors-platform/sdk';

async function main() {
  // Initialize the registry
  const registry = new PostgresEventRegistry({
    databaseUrl: 'postgresql://actors:actors_dev@localhost:5432/actors_platform'
  });

  // 1. Register an Event Definition
  const userCreatedEvent: EventDefinition = {
    name: 'USER_CREATED',
    category: 'notification',
    description: 'Emitted when a new user is created',
    producerActor: 'user-auth',
    payloadSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        email: { type: 'string', format: 'email' },
        createdAt: { type: 'string', format: 'date-time' }
      },
      required: ['userId', 'email', 'createdAt'],
      additionalProperties: false
    }
  };

  await registry.register(userCreatedEvent);
  console.log('✅ Event registered: USER_CREATED');

  // 2. Register Actor Manifest
  const billingManifest: ActorManifest = {
    actorName: 'billing',
    description: 'Handles customer billing and subscriptions',
    version: '1.0.0',
    produces: ['SUBSCRIPTION_CREATED', 'PAYMENT_PROCESSED'],
    consumes: ['USER_CREATED', 'USER_DELETED'],
    healthEndpoint: '/health'
  };

  await registry.registerActor(billingManifest);
  console.log('✅ Actor registered: billing');

  // 3. Add Consumer Relationship
  await registry.addConsumer('USER_CREATED', 'billing');
  await registry.addConsumer('USER_CREATED', 'notification');
  console.log('✅ Consumers added for USER_CREATED');

  // 4. Validate Event Payload
  const validPayload = {
    userId: 'user-123',
    email: 'test@example.com',
    createdAt: new Date().toISOString()
  };

  const validation = await registry.validatePayload('USER_CREATED', validPayload);
  console.log(`\n📋 Payload validation: ${validation.valid ? '✅ Valid' : '❌ Invalid'}`);

  // Invalid payload example
  const invalidPayload = {
    userId: 'user-123',
    // missing required email field
    createdAt: 'not-a-date'
  };

  const invalidValidation = await registry.validatePayload('USER_CREATED', invalidPayload);
  console.log(`📋 Invalid payload validation: ${invalidValidation.valid ? '✅ Valid' : '❌ Invalid'}`);
  if (!invalidValidation.valid) {
    console.log('   Errors:', invalidValidation.errors);
  }

  // 5. Query Event Information
  console.log('\n🔍 Querying event information...');
  
  // Get all consumers of an event
  const consumers = await registry.getConsumers('USER_CREATED');
  console.log(`Consumers of USER_CREATED: ${consumers.join(', ')}`);

  // List all events by category
  const notificationEvents = await registry.listEvents({ category: 'notification' });
  console.log(`\nNotification events: ${notificationEvents.map(e => e.name).join(', ')}`);

  // 6. Record Metrics
  await registry.recordMetric({
    eventName: 'USER_CREATED',
    actorId: 'auth-001',
    direction: 'produced',
    success: true,
    durationMs: 45,
    correlationId: 'test-001'
  });
  console.log('\n📊 Metric recorded');

  // 7. Generate TypeScript Types
  console.log('\n🔧 Generating TypeScript types...');
  const types = await registry.generateTypes();
  console.log(types.substring(0, 200) + '...');

  // Cleanup
  await registry.close();
  console.log('\n✅ Example completed!');
}

main().catch(console.error);