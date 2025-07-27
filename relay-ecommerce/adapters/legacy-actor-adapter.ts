import { Event } from '../services/event-catalog';
import { RelayActor, Result } from '../runtime/actor-base';
import { EventBus } from '../runtime/event-bus';

// Interface that legacy actors should implement
export interface LegacyActor {
  handle(event: any): Promise<any>;
  getState(): any;
  setState(state: any): void;
}

export interface AdapterConfig {
  mode: 'legacy' | 'shadow' | 'relay' | 'percentage';
  shadowCompare?: boolean;
  percentageRelay?: number; // 0-100
  logDiscrepancies?: boolean;
  metricsEnabled?: boolean;
}

export class LegacyActorAdapter {
  private metrics = {
    totalRequests: 0,
    legacyRequests: 0,
    relayRequests: 0,
    discrepancies: 0,
    errors: { legacy: 0, relay: 0 }
  };

  constructor(
    private legacyActor: LegacyActor,
    private relayActor: RelayActor,
    private config: AdapterConfig
  ) {}

  async handle(event: Event): Promise<Result> {
    this.metrics.totalRequests++;

    switch (this.config.mode) {
      case 'legacy':
        return this.handleLegacy(event);
        
      case 'relay':
        return this.handleRelay(event);
        
      case 'shadow':
        return this.handleShadow(event);
        
      case 'percentage':
        return this.handlePercentage(event);
        
      default:
        throw new Error(`Unknown adapter mode: ${this.config.mode}`);
    }
  }

  private async handleLegacy(event: Event): Promise<Result> {
    this.metrics.legacyRequests++;
    
    try {
      // Convert Relay event to legacy format
      const legacyEvent = this.convertToLegacyEvent(event);
      const legacyResult = await this.legacyActor.handle(legacyEvent);
      
      // Convert legacy result to Relay format
      return this.convertToRelayResult(legacyResult);
    } catch (error) {
      this.metrics.errors.legacy++;
      throw error;
    }
  }

  private async handleRelay(event: Event): Promise<Result> {
    this.metrics.relayRequests++;
    
    try {
      return await this.relayActor.handle(event);
    } catch (error) {
      this.metrics.errors.relay++;
      throw error;
    }
  }

  private async handleShadow(event: Event): Promise<Result> {
    // Run legacy as primary
    const legacyPromise = this.handleLegacy(event);
    
    // Run relay in shadow mode
    if (this.config.shadowCompare) {
      this.runShadowComparison(event, legacyPromise);
    }
    
    return legacyPromise;
  }

  private async handlePercentage(event: Event): Promise<Result> {
    const useRelay = Math.random() * 100 < (this.config.percentageRelay || 0);
    
    if (useRelay) {
      return this.handleRelay(event);
    } else {
      return this.handleLegacy(event);
    }
  }

  private async runShadowComparison(event: Event, primaryPromise: Promise<Result>) {
    try {
      const [legacyResult, relayResult] = await Promise.allSettled([
        primaryPromise,
        this.handleRelay(event)
      ]);

      if (legacyResult.status === 'fulfilled' && relayResult.status === 'fulfilled') {
        const discrepancy = this.compareResults(legacyResult.value, relayResult.value);
        
        if (discrepancy && this.config.logDiscrepancies) {
          this.metrics.discrepancies++;
          console.warn('Shadow mode discrepancy detected:', {
            event: event.type,
            eventId: event.id,
            discrepancy,
            legacyResult: legacyResult.value,
            relayResult: relayResult.value
          });
        }
      }
    } catch (error) {
      // Don't let shadow comparison affect primary flow
      console.error('Shadow comparison error:', error);
    }
  }

  private compareResults(legacy: Result, relay: Result): any {
    const discrepancies: any = {};

    // Compare success status
    if (legacy.success !== relay.success) {
      discrepancies.success = { legacy: legacy.success, relay: relay.success };
    }

    // Compare response data
    if (JSON.stringify(legacy.response) !== JSON.stringify(relay.response)) {
      discrepancies.response = {
        legacy: legacy.response,
        relay: relay.response,
        diff: this.findDifferences(legacy.response, relay.response)
      };
    }

    // Compare emitted events
    if (legacy.events?.length !== relay.events?.length) {
      discrepancies.eventCount = {
        legacy: legacy.events?.length || 0,
        relay: relay.events?.length || 0
      };
    }

    return Object.keys(discrepancies).length > 0 ? discrepancies : null;
  }

  private findDifferences(obj1: any, obj2: any, path = ''): any {
    const diffs: any = {};

    if (obj1 === obj2) return null;
    if (typeof obj1 !== typeof obj2) {
      return { path, type: { obj1: typeof obj1, obj2: typeof obj2 } };
    }
    if (typeof obj1 !== 'object') {
      return { path, value: { obj1, obj2 } };
    }

    const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);
    
    for (const key of keys) {
      const newPath = path ? `${path}.${key}` : key;
      const diff = this.findDifferences(obj1?.[key], obj2?.[key], newPath);
      if (diff) {
        diffs[key] = diff;
      }
    }

    return Object.keys(diffs).length > 0 ? diffs : null;
  }

  private convertToLegacyEvent(event: Event): any {
    // Map Relay event structure to legacy format
    return {
      id: event.id,
      type: event.type,
      data: event.payload, // Legacy uses 'data' instead of 'payload'
      metadata: {
        timestamp: event.timestamp,
        correlationId: event.correlationId,
        actor: event.actor
      }
    };
  }

  private convertToRelayResult(legacyResult: any): Result {
    // Map legacy result to Relay format
    return {
      success: legacyResult.success ?? true,
      state: legacyResult.state,
      events: this.convertLegacyEvents(legacyResult.events || []),
      response: legacyResult.data || legacyResult.response || legacyResult
    };
  }

  private convertLegacyEvents(legacyEvents: any[]): Event[] {
    return legacyEvents.map(e => ({
      id: e.id || this.generateId(),
      type: e.type || e.name,
      payload: e.data || e.payload,
      timestamp: e.timestamp || Date.now(),
      actor: e.metadata?.actor || 'unknown'
    }));
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Metrics and monitoring
  getMetrics() {
    return {
      ...this.metrics,
      successRate: {
        legacy: this.metrics.legacyRequests > 0 
          ? (this.metrics.legacyRequests - this.metrics.errors.legacy) / this.metrics.legacyRequests 
          : 0,
        relay: this.metrics.relayRequests > 0
          ? (this.metrics.relayRequests - this.metrics.errors.relay) / this.metrics.relayRequests
          : 0
      },
      discrepancyRate: this.metrics.totalRequests > 0
        ? this.metrics.discrepancies / this.metrics.totalRequests
        : 0
    };
  }

  // State synchronization for gradual migration
  async syncState() {
    try {
      const legacyState = await this.legacyActor.getState();
      const relayState = this.convertLegacyState(legacyState);
      
      // Update Relay actor state
      await this.relayActor.setState(relayState);
      
      return { success: true };
    } catch (error) {
      console.error('State sync failed:', error);
      return { success: false, error };
    }
  }

  private convertLegacyState(legacyState: any): any {
    // Override this method for specific actor state conversions
    return legacyState;
  }

  // Configuration updates
  updateConfig(updates: Partial<AdapterConfig>) {
    Object.assign(this.config, updates);
  }

  // Gradual rollout helper
  increaseRelayPercentage(increment: number) {
    if (this.config.mode === 'percentage') {
      this.config.percentageRelay = Math.min(
        100,
        (this.config.percentageRelay || 0) + increment
      );
    }
  }
}

// Factory for creating adapters with monitoring
export class AdapterFactory {
  private adapters: Map<string, LegacyActorAdapter> = new Map();

  createAdapter(
    actorName: string,
    legacyActor: LegacyActor,
    relayActor: RelayActor,
    config: AdapterConfig
  ): LegacyActorAdapter {
    const adapter = new LegacyActorAdapter(legacyActor, relayActor, config);
    this.adapters.set(actorName, adapter);
    return adapter;
  }

  getAdapter(actorName: string): LegacyActorAdapter | undefined {
    return this.adapters.get(actorName);
  }

  getAllMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    
    for (const [name, adapter] of this.adapters) {
      metrics[name] = adapter.getMetrics();
    }
    
    return metrics;
  }

  // Gradually increase relay usage across all actors
  rolloutRelay(percentage: number) {
    for (const adapter of this.adapters.values()) {
      adapter.updateConfig({ percentageRelay: percentage });
    }
  }

  // Switch specific actor to relay
  switchToRelay(actorName: string) {
    const adapter = this.adapters.get(actorName);
    if (adapter) {
      adapter.updateConfig({ mode: 'relay' });
    }
  }
}