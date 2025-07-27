import { StatsD } from 'node-dogstatsd';
import { Event } from '../services/event-catalog';

export interface MetricsConfig {
  host: string;
  port: number;
  prefix: string;
  tags: string[];
}

export class DatadogMetrics {
  private client: StatsD;
  private config: MetricsConfig;

  constructor(config: MetricsConfig) {
    this.config = config;
    this.client = new StatsD(config.host, config.port, null, {
      prefix: config.prefix,
      global_tags: config.tags
    });
  }

  // Event metrics
  eventProcessed(event: Event, actor: string, duration: number, success: boolean) {
    const tags = [
      `event_type:${event.type}`,
      `actor:${actor}`,
      `success:${success}`
    ];

    this.client.increment('event.processed', 1, tags);
    this.client.histogram('event.duration', duration, tags);
    
    if (!success) {
      this.client.increment('event.error', 1, tags);
    }
  }

  // Actor health metrics
  actorHealth(actor: string, healthy: boolean) {
    this.client.gauge('actor.health', healthy ? 1 : 0, [`actor:${actor}`]);
  }

  // Business metrics
  orderCreated(order: any) {
    this.client.increment('order.created', 1, [
      `status:${order.status}`,
      `has_discount:${order.discount > 0}`
    ]);
    this.client.histogram('order.value', order.total);
    this.client.histogram('order.items', order.items.length);
  }

  paymentProcessed(transaction: any) {
    const tags = [
      `status:${transaction.status}`,
      `currency:${transaction.currency}`,
      `method:${transaction.method}`
    ];

    this.client.increment('payment.processed', 1, tags);
    this.client.histogram('payment.amount', transaction.amount, tags);
    
    if (transaction.status === 'succeeded') {
      this.client.increment('revenue', transaction.amount, tags);
    }
  }

  cartMetrics(action: string, cart: any) {
    this.client.increment(`cart.${action}`, 1);
    this.client.histogram('cart.value', cart.total);
    this.client.histogram('cart.items', cart.items.length);
  }

  // Performance metrics
  latency(operation: string, duration: number, tags: string[] = []) {
    this.client.histogram(`latency.${operation}`, duration, tags);
  }

  // Error tracking
  error(error: Error, context: Record<string, any> = {}) {
    const tags = Object.entries(context).map(([k, v]) => `${k}:${v}`);
    this.client.increment('error', 1, [...tags, `error_type:${error.name}`]);
  }

  // Custom metrics
  gauge(metric: string, value: number, tags: string[] = []) {
    this.client.gauge(metric, value, tags);
  }

  increment(metric: string, value: number = 1, tags: string[] = []) {
    this.client.increment(metric, value, tags);
  }

  histogram(metric: string, value: number, tags: string[] = []) {
    this.client.histogram(metric, value, tags);
  }

  // Close connection
  close() {
    this.client.close();
  }
}

// Singleton instance
let metricsInstance: DatadogMetrics | null = null;

export function initializeMetrics(config: MetricsConfig): DatadogMetrics {
  if (!metricsInstance) {
    metricsInstance = new DatadogMetrics(config);
  }
  return metricsInstance;
}

export function getMetrics(): DatadogMetrics {
  if (!metricsInstance) {
    throw new Error('Metrics not initialized');
  }
  return metricsInstance;
}