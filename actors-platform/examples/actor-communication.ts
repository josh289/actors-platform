/**
 * Example: Actor Communication via Event Registry
 * 
 * This example demonstrates how actors communicate through the event registry
 * using the unified message system.
 */

import { 
  Actor, 
  PostgresEventRegistry, 
  MessageFactory,
  ActorContext,
  ActorRuntime,
  EventRegistryConfig 
} from '@actors-platform/sdk';
import { AuthActor } from '../actors/user-auth/src';
import { NotificationActor } from '../actors/notification-actor/src';

async function main() {
  console.log('🚀 Actor Communication Example\n');

  // 1. Initialize Event Registry
  console.log('1️⃣ Initializing Event Registry...');
  const registryConfig: EventRegistryConfig = {
    databaseUrl: process.env.DATABASE_URL || 'postgresql://actors:actors_dev@localhost:5432/actors_platform',
    cacheEnabled: true,
    metricsEnabled: true,
    validationMode: 'strict',
  };
  
  const eventRegistry = new PostgresEventRegistry(registryConfig);
  
  // Set the global event registry for all actors
  Actor.setEventRegistry(eventRegistry);
  console.log('✅ Event Registry initialized\n');

  // 2. Create Actor Runtime (mock for example)
  const runtime: ActorRuntime = {
    loadState: async (actorId: string) => null,
    saveState: async (actorId: string, state: any) => {},
    publish: async (event: any) => {
      console.log(`📤 Published event: ${event.type}`);
      // In a real system, this would route through message queue
      await handlePublishedEvent(event);
    },
  };

  // 3. Initialize Actors
  console.log('2️⃣ Initializing Actors...');
  
  // Create AuthActor
  const authContext: ActorContext = {
    actorId: 'auth-actor-001',
    config: { 
      name: 'user-auth',
      version: '1.0.0'
    },
    runtime,
    logger: console,
  };
  const authActor = new AuthActor(authContext);
  await authActor.initialize();
  console.log('✅ AuthActor initialized');

  // Create NotificationActor
  const notificationContext: ActorContext = {
    actorId: 'notification-actor-001',
    config: {
      name: 'notification',
      version: '1.0.0'
    },
    runtime,
    logger: console,
  };
  const notificationActor = new NotificationActor(notificationContext);
  await notificationActor.initialize();
  console.log('✅ NotificationActor initialized\n');

  // 4. Demonstrate Command Processing
  console.log('3️⃣ Sending Magic Link Command...');
  const sendMagicLinkCommand = MessageFactory.createCommand(
    'SEND_MAGIC_LINK',
    {
      email: 'user@example.com',
      redirectUrl: 'https://app.example.com/auth/callback',
      metadata: {
        source: 'login-page',
        device: 'web'
      }
    },
    {
      correlationId: 'demo-001',
      producedBy: 'example-app'
    }
  );

  try {
    // Validate the command
    const validation = await sendMagicLinkCommand.validate();
    console.log(`📋 Command validation: ${validation.valid ? '✅ Valid' : '❌ Invalid'}`);
    
    // Process the command
    const result = await authActor.processMessage(sendMagicLinkCommand);
    console.log(`✅ Command processed: ${result.success ? 'Success' : 'Failed'}`);
    
    // Show emitted events
    if (result.events && result.events.length > 0) {
      console.log(`📨 Emitted events: ${result.events.map(e => e.type).join(', ')}\n`);
    }
  } catch (error) {
    console.error('❌ Command failed:', error);
  }

  // 5. Demonstrate Query Processing
  console.log('4️⃣ Querying User Notifications...');
  const getNotificationsQuery = MessageFactory.createQuery(
    'GET_USER_NOTIFICATIONS',
    {
      userId: 'user-123',
      status: 'unread',
      limit: 10,
      offset: 0
    }
  );

  try {
    const queryResult = await notificationActor.processMessage(getNotificationsQuery);
    console.log(`✅ Query processed: Found ${queryResult.data?.notifications?.length || 0} notifications\n`);
  } catch (error) {
    console.error('❌ Query failed:', error);
  }

  // 6. Demonstrate Event Metrics
  console.log('5️⃣ Checking Event Metrics...');
  const metrics = await eventRegistry.getMetrics('SEND_MAGIC_LINK');
  console.log(`📊 SEND_MAGIC_LINK metrics:`);
  console.log(`   - Total calls: ${metrics.length}`);
  console.log(`   - Success rate: ${metrics.filter(m => m.success).length / metrics.length * 100}%`);
  console.log(`   - Avg duration: ${metrics.reduce((sum, m) => sum + (m.durationMs || 0), 0) / metrics.length}ms\n`);

  // 7. Demonstrate Actor Discovery
  console.log('6️⃣ Discovering Actor Dependencies...');
  const dependencies = await eventRegistry.visualizeDependencies();
  console.log(`🔗 Actor Dependencies:`);
  dependencies.edges.forEach(edge => {
    console.log(`   ${edge.source} → ${edge.target} (${edge.events.join(', ')})`);
  });

  // 8. Export Event Catalog
  console.log('\n7️⃣ Exporting Event Catalog...');
  const catalog = await eventRegistry.exportCatalog();
  console.log(`📚 Event Catalog: ${catalog.length} events registered`);
  
  // Show a sample of events by category
  const byCategory = catalog.reduce((acc, event) => {
    acc[event.category] = (acc[event.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('📊 Events by category:');
  Object.entries(byCategory).forEach(([category, count]) => {
    console.log(`   - ${category}: ${count} events`);
  });

  // Cleanup
  console.log('\n🧹 Cleaning up...');
  await eventRegistry.close();
  console.log('✅ Example completed!');
}

// Helper function to simulate event routing
async function handlePublishedEvent(event: any) {
  // In a real system, this would be handled by a message broker
  // For this example, we'll just log it
  if (event.type === 'MAGIC_LINK_SENT') {
    console.log(`   → NotificationActor would receive this event`);
    console.log(`   → It would send email to: ${event.payload.email}`);
  }
}

// Run the example
main().catch(console.error);