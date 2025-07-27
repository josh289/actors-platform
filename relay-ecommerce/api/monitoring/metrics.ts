import { VercelRequest, VercelResponse } from '@vercel/node';
import { getMetrics } from '../../monitoring/datadog';
import { getObservability } from '../../monitoring/observability';
import { PostgresEventCatalog } from '../../services/event-catalog';
import { ActorRegistry } from '../../services/actor-registry';

let catalog: PostgresEventCatalog;
let registry: ActorRegistry;

async function initializeServices() {
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

  if (!registry) {
    registry = new ActorRegistry();
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await initializeServices();
    const metrics = getMetrics();
    const observability = getObservability();

    // Collect system metrics
    const systemMetrics = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
          external: process.memoryUsage().external
        },
        cpu: process.cpuUsage()
      },
      actors: {
        total: (await registry.getAll()).length,
        health: await registry.healthCheckAll()
      },
      events: {
        catalog: {
          total: (await catalog.getAllEvents()).length
        }
      },
      dashboards: observability.getDashboardConfig(),
      alerts: observability.getAlertConfig(),
      slos: observability.getSLOConfig()
    };

    // Get event processing metrics from last hour
    const eventMetrics = await getEventMetrics();

    // Get business metrics
    const businessMetrics = await getBusinessMetrics();

    return res.status(200).json({
      success: true,
      metrics: {
        system: systemMetrics,
        events: eventMetrics,
        business: businessMetrics
      }
    });
  } catch (error) {
    console.error('Metrics API error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function getEventMetrics() {
  // In real implementation, would query from time-series database
  return {
    processed: {
      total: 12543,
      success: 12401,
      failed: 142,
      rate: '208.5/s'
    },
    latency: {
      p50: 45,
      p95: 120,
      p99: 250,
      max: 1230
    },
    byType: {
      'ADD_TO_CART': { count: 3421, avgLatency: 35 },
      'CHECKOUT_CART': { count: 1232, avgLatency: 125 },
      'PROCESS_PAYMENT': { count: 1198, avgLatency: 450 },
      'ORDER_CREATED': { count: 1156, avgLatency: 78 }
    }
  };
}

async function getBusinessMetrics() {
  // In real implementation, would query from actor state or analytics DB
  return {
    orders: {
      created: 1156,
      value: {
        total: 125430.50,
        average: 108.52,
        min: 15.99,
        max: 1250.00
      },
      conversion: {
        cartToOrder: 0.34,
        viewToCart: 0.12,
        viewToOrder: 0.041
      }
    },
    revenue: {
      today: 125430.50,
      week: 876543.21,
      month: 3456789.12,
      growth: {
        daily: 0.12,
        weekly: 0.08,
        monthly: 0.15
      }
    },
    inventory: {
      totalProducts: 1543,
      lowStock: 23,
      outOfStock: 5,
      turnover: 4.3
    },
    customers: {
      active: 8765,
      new: 234,
      returning: 0.67,
      lifetime: {
        average: 543.21,
        median: 234.56
      }
    }
  };
}