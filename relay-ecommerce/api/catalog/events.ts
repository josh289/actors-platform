import { VercelRequest, VercelResponse } from '@vercel/node';
import { PostgresEventCatalog } from '../../services/event-catalog';

let catalog: PostgresEventCatalog;

async function initializeCatalog() {
  if (!catalog) {
    catalog = new PostgresEventCatalog({
      host: process.env.POSTGRES_HOST!,
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DATABASE || 'event_catalog',
      user: process.env.POSTGRES_USER!,
      password: process.env.POSTGRES_PASSWORD!
    });

    await catalog.initialize();
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    await initializeCatalog();

    switch (req.method) {
      case 'GET': {
        const { event_name, actor } = req.query;

        if (event_name) {
          // Get specific event
          const event = await catalog.getEvent(event_name as string);
          if (!event) {
            return res.status(404).json({ error: 'Event not found' });
          }
          return res.status(200).json(event);
        } else if (actor) {
          // Get all events for an actor
          const events = await catalog.getActorEvents(actor as string);
          return res.status(200).json({ events });
        } else {
          // Get all events
          const events = await catalog.getAllEvents();
          return res.status(200).json({ events });
        }
      }

      case 'POST': {
        // Add new event to catalog
        const { event_name, description, producer_actor, consumers, payload_schema } = req.body;

        if (!event_name || !description || !producer_actor) {
          return res.status(400).json({
            error: 'Missing required fields: event_name, description, producer_actor'
          });
        }

        await catalog.addEvent({
          event_name,
          description,
          producer_actor,
          consumers,
          payload_schema
        });

        return res.status(201).json({
          success: true,
          message: 'Event added to catalog'
        });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Catalog API error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}