import { VercelRequest, VercelResponse } from '@vercel/node';
import { CartActor } from '../../../actors/cart';
import { EventBus } from '../../../runtime/event-bus';
import { Event } from '../../../services/event-catalog';

// Initialize actor
let actor: CartActor;
let eventBus: EventBus;

async function initializeActor() {
  if (!actor) {
    // Initialize event bus
    eventBus = new EventBus({
      provider: process.env.REDIS_HOST ? 'redis' : 'memory',
      redis: process.env.REDIS_HOST ? {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
      } : undefined,
      patterns: {
        ask: {
          timeout: 5000,
          retries: 2
        },
        tell: {
          delivery: 'at_least_once'
        },
        publish: {
          delivery: 'best_effort'
        }
      }
    });

    await eventBus.initialize();

    // Initialize actor
    actor = new CartActor(
      {
        name: 'cart',
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
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    await initializeActor();

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { event_type, payload, request_id } = req.body;

    if (!event_type || !payload) {
      return res.status(400).json({ error: 'Missing event_type or payload' });
    }

    // Create event
    const event: Event = {
      id: request_id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: event_type,
      payload,
      timestamp: Date.now(),
      actor: 'api'
    };

    // Determine if this is a query or command
    const isQuery = event_type.startsWith('GET_');

    if (isQuery) {
      const result = await actor.query(event);
      return res.status(200).json({
        success: true,
        data: result,
        event_id: event.id
      });
    } else {
      const result = await actor.handle(event);
      return res.status(200).json({
        success: result.success,
        data: result.response,
        events_emitted: result.events.map(e => ({
          type: e.type,
          timestamp: e.timestamp
        })),
        event_id: event.id
      });
    }
  } catch (error) {
    console.error('Cart actor error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}