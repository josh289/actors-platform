// Billing Actor API Endpoint
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

    const isQuery = event_type.startsWith('GET_') || event_type === 'LIST_INVOICES';
    
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