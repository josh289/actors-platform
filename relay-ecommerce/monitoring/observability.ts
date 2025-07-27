import { EventEmitter } from 'events';
import { Event } from '../services/event-catalog';
import { DatadogMetrics, getMetrics } from './datadog';

export interface ObservabilityConfig {
  serviceName: string;
  environment: string;
  version: string;
  datadog: {
    apiKey: string;
    host: string;
    port: number;
  };
  sampling: {
    traces: number; // 0-1
    metrics: number; // 0-1
  };
}

export class ObservabilityService extends EventEmitter {
  private config: ObservabilityConfig;
  private metrics: DatadogMetrics;
  private eventBuffer: Event[] = [];
  private flushInterval: NodeJS.Timer;

  constructor(config: ObservabilityConfig) {
    super();
    this.config = config;
    this.metrics = getMetrics();

    // Flush buffered events periodically
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  // Trace event processing
  traceEvent(event: Event, actor: string, handler: string) {
    const span = {
      traceId: this.generateTraceId(),
      spanId: this.generateSpanId(),
      service: `${this.config.serviceName}.${actor}`,
      resource: `${actor}.${handler}`,
      name: event.type,
      startTime: Date.now(),
      tags: {
        'event.id': event.id,
        'event.type': event.type,
        'actor.name': actor,
        'handler.name': handler,
        'environment': this.config.environment,
        'version': this.config.version
      }
    };

    return {
      span,
      end: (error?: Error) => {
        span['duration'] = Date.now() - span.startTime;
        span['error'] = error ? 1 : 0;
        
        if (error) {
          span.tags['error.type'] = error.name;
          span.tags['error.message'] = error.message;
        }

        this.sendTrace(span);
        
        // Update metrics
        this.metrics.eventProcessed(event, actor, span['duration'], !error);
      }
    };
  }

  // Log structured events
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context: Record<string, any> = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.config.serviceName,
      environment: this.config.environment,
      version: this.config.version,
      ...context
    };

    // Send to Datadog logs
    this.sendLog(logEntry);

    // Also emit for local handling
    this.emit('log', logEntry);
  }

  // Monitor actor health
  monitorActorHealth(actorName: string, check: () => Promise<boolean>) {
    setInterval(async () => {
      try {
        const healthy = await check();
        this.metrics.actorHealth(actorName, healthy);
        
        if (!healthy) {
          this.log('warn', `Actor ${actorName} health check failed`, { actor: actorName });
        }
      } catch (error) {
        this.metrics.actorHealth(actorName, false);
        this.log('error', `Actor ${actorName} health check error`, {
          actor: actorName,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, 30000); // Check every 30 seconds
  }

  // Create dashboards configuration
  getDashboardConfig() {
    return {
      systemOverview: {
        title: 'Relay E-commerce System Overview',
        widgets: [
          {
            type: 'timeseries',
            title: 'Event Processing Rate',
            query: 'sum:relay.event.processed{*} by {event_type}.as_rate()'
          },
          {
            type: 'timeseries',
            title: 'Event Processing Latency',
            query: 'avg:relay.event.duration{*} by {actor}'
          },
          {
            type: 'heatmap',
            title: 'Actor Health',
            query: 'avg:relay.actor.health{*} by {actor}'
          },
          {
            type: 'toplist',
            title: 'Error Rate by Event Type',
            query: 'sum:relay.event.error{*} by {event_type}.as_rate()'
          }
        ]
      },
      businessMetrics: {
        title: 'Business Metrics Dashboard',
        widgets: [
          {
            type: 'timeseries',
            title: 'Orders Created',
            query: 'sum:relay.order.created{*}.as_count()'
          },
          {
            type: 'timeseries',
            title: 'Revenue',
            query: 'sum:relay.revenue{*}'
          },
          {
            type: 'distribution',
            title: 'Order Value Distribution',
            query: 'avg:relay.order.value{*}'
          },
          {
            type: 'timeseries',
            title: 'Payment Success Rate',
            query: 'sum:relay.payment.processed{status:succeeded} / sum:relay.payment.processed{*}'
          }
        ]
      },
      performanceMetrics: {
        title: 'Performance Dashboard',
        widgets: [
          {
            type: 'timeseries',
            title: 'API Latency (p95)',
            query: 'p95:relay.latency.api{*}'
          },
          {
            type: 'timeseries',
            title: 'Database Query Time',
            query: 'avg:relay.latency.database{*} by {query_type}'
          },
          {
            type: 'timeseries',
            title: 'Event Bus Throughput',
            query: 'sum:relay.event.processed{*}.as_rate()'
          }
        ]
      }
    };
  }

  // Alert configurations
  getAlertConfig() {
    return [
      {
        name: 'High Error Rate',
        query: 'sum(last_5m):sum:relay.event.error{*}.as_rate() > 0.05',
        message: 'Error rate is above 5% @pagerduty',
        priority: 'P1'
      },
      {
        name: 'High Latency',
        query: 'avg(last_5m):p95:relay.event.duration{*} > 1000',
        message: 'P95 latency is above 1 second',
        priority: 'P2'
      },
      {
        name: 'Actor Unhealthy',
        query: 'min(last_5m):avg:relay.actor.health{*} by {actor} < 1',
        message: 'Actor {{actor.name}} is unhealthy',
        priority: 'P2'
      },
      {
        name: 'Payment Failures',
        query: 'sum(last_10m):sum:relay.payment.processed{status:failed}.as_count() > 10',
        message: 'More than 10 payment failures in last 10 minutes',
        priority: 'P1'
      },
      {
        name: 'Low Stock Alert',
        query: 'min(last_5m):min:relay.inventory.available{*} by {product_id} < 10',
        message: 'Product {{product_id.name}} has low stock',
        priority: 'P3'
      }
    ];
  }

  // SLO definitions
  getSLOConfig() {
    return [
      {
        name: 'API Availability',
        target: 99.9,
        query: 'sum:relay.api.success{*}.as_count() / sum:relay.api.request{*}.as_count()',
        timeWindow: '30d'
      },
      {
        name: 'Checkout Success Rate',
        target: 95.0,
        query: 'sum:relay.order.created{*}.as_count() / sum:relay.cart.checkout{*}.as_count()',
        timeWindow: '7d'
      },
      {
        name: 'Payment Processing Time',
        target: 95.0, // 95% under 2 seconds
        query: 'sum:relay.payment.processed{duration:<2000}.as_count() / sum:relay.payment.processed{*}.as_count()',
        timeWindow: '7d'
      }
    ];
  }

  // Internal methods
  private sendTrace(span: any) {
    if (Math.random() < this.config.sampling.traces) {
      // Send to Datadog APM
      // In real implementation, would use dd-trace
      this.emit('trace', span);
    }
  }

  private sendLog(logEntry: any) {
    // Buffer logs and send in batches
    this.eventBuffer.push(logEntry);
    
    if (this.eventBuffer.length >= 100) {
      this.flush();
    }
  }

  private flush() {
    if (this.eventBuffer.length === 0) return;
    
    const events = this.eventBuffer.splice(0, this.eventBuffer.length);
    
    // Send to Datadog Logs API
    // In real implementation, would use fetch to POST to Datadog
    this.emit('flush', events);
  }

  private generateTraceId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private generateSpanId(): string {
    return Math.random().toString(36).substr(2, 16);
  }

  close() {
    clearInterval(this.flushInterval);
    this.flush();
    this.metrics.close();
  }
}

// Export singleton instance
let observabilityInstance: ObservabilityService | null = null;

export function initializeObservability(config: ObservabilityConfig): ObservabilityService {
  if (!observabilityInstance) {
    observabilityInstance = new ObservabilityService(config);
  }
  return observabilityInstance;
}

export function getObservability(): ObservabilityService {
  if (!observabilityInstance) {
    throw new Error('Observability not initialized');
  }
  return observabilityInstance;
}