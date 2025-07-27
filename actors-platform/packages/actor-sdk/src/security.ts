import { v4 as uuidv4 } from 'uuid';

/**
 * Built-in security capabilities for actors
 */
export class SecurityCapabilities {
  private events: SecurityEvent[] = [];
  private maxEvents: number = 10000;
  private testMode: boolean = false;

  enableTestMode(): void {
    this.testMode = true;
  }

  trackEvent(eventData: SecurityEventData): void {
    const event: SecurityEvent = {
      ...eventData,
      id: uuidv4(),
      timestamp: new Date(),
    };

    this.events.push(event);

    // Maintain event buffer size
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // In production, you might also send to external security monitoring
    if (!this.testMode && process.env.SECURITY_WEBHOOK_URL) {
      this.sendToSecurityMonitoring(event);
    }
  }

  getEvents(query?: SecurityEventQuery): SecurityEvent[] {
    let filtered = [...this.events];

    if (query) {
      if (query.userId) {
        filtered = filtered.filter(e => e.userId === query.userId);
      }
      if (query.severity) {
        filtered = filtered.filter(e => e.severity === query.severity);
      }
      if (query.type) {
        filtered = filtered.filter(e => e.type === query.type);
      }
      if (query.since) {
        filtered = filtered.filter(e => e.timestamp >= query.since!);
      }
      if (query.limit) {
        filtered = filtered.slice(-query.limit);
      }
    }

    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  getEventsByTimeWindow(windowMs: number): SecurityEvent[] {
    const since = new Date(Date.now() - windowMs);
    return this.getEvents({ since });
  }

  getEventStats(): SecurityEventStats {
    const stats: SecurityEventStats = {
      total: this.events.length,
      bySeverity: {},
      byType: {},
      lastHour: 0,
      last24Hours: 0,
    };

    const now = Date.now();
    const hourAgo = now - 3600000;
    const dayAgo = now - 86400000;

    this.events.forEach(event => {
      // By severity
      stats.bySeverity[event.severity] = (stats.bySeverity[event.severity] || 0) + 1;

      // By type
      stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;

      // Time windows
      const eventTime = event.timestamp.getTime();
      if (eventTime >= hourAgo) {
        stats.lastHour++;
      }
      if (eventTime >= dayAgo) {
        stats.last24Hours++;
      }
    });

    return stats;
  }

  isUnderAttack(): boolean {
    // Check for high-severity events in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 300000);
    const recentHighSeverity = this.events.filter(
      e => e.timestamp >= fiveMinutesAgo && 
      (e.severity === 'high' || e.severity === 'critical')
    );

    // Thresholds
    const HIGH_SEVERITY_THRESHOLD = 10;
    const CRITICAL_THRESHOLD = 3;

    const criticalCount = recentHighSeverity.filter(e => e.severity === 'critical').length;
    const highCount = recentHighSeverity.filter(e => e.severity === 'high').length;

    return criticalCount >= CRITICAL_THRESHOLD || highCount >= HIGH_SEVERITY_THRESHOLD;
  }

  getAnomalies(): SecurityAnomaly[] {
    const anomalies: SecurityAnomaly[] = [];
    const fiveMinutesAgo = new Date(Date.now() - 300000);

    // Check for repeated failed attempts from same user
    const userAttempts = new Map<string, number>();
    this.events
      .filter(e => e.timestamp >= fiveMinutesAgo && e.type.includes('failed'))
      .forEach(event => {
        if (event.userId) {
          const count = userAttempts.get(event.userId) || 0;
          userAttempts.set(event.userId, count + 1);
        }
      });

    userAttempts.forEach((count, userId) => {
      if (count >= 5) {
        anomalies.push({
          type: 'repeated_failures',
          severity: 'high',
          description: `User ${userId} has ${count} failed attempts in the last 5 minutes`,
          userId,
          count,
          timestamp: new Date(),
        });
      }
    });

    // Check for unusual activity patterns
    const eventTypeCount = new Map<string, number>();
    this.events
      .filter(e => e.timestamp >= fiveMinutesAgo)
      .forEach(event => {
        const count = eventTypeCount.get(event.type) || 0;
        eventTypeCount.set(event.type, count + 1);
      });

    // If any event type has more than 50 occurrences in 5 minutes
    eventTypeCount.forEach((count, type) => {
      if (count >= 50) {
        anomalies.push({
          type: 'unusual_activity',
          severity: 'medium',
          description: `Event type '${type}' occurred ${count} times in the last 5 minutes`,
          eventType: type,
          count,
          timestamp: new Date(),
        });
      }
    });

    return anomalies;
  }

  private async sendToSecurityMonitoring(event: SecurityEvent): Promise<void> {
    try {
      const webhook = process.env.SECURITY_WEBHOOK_URL;
      if (!webhook) return;

      // In a real implementation, you'd send to your security monitoring service
      // This is a placeholder for the actual implementation
      await fetch(webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SECURITY_WEBHOOK_TOKEN}`,
        },
        body: JSON.stringify({
          event,
          actorInfo: {
            actorId: event.actorId,
            actorName: event.actorName,
          },
          timestamp: event.timestamp.toISOString(),
        }),
      });
    } catch (error) {
      // Log but don't throw - security monitoring should not affect actor operation
      console.error('Failed to send security event to monitoring', error);
    }
  }
}

// Type definitions
export interface SecurityEventData {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  actorId?: string;
  actorName?: string;
  details: any;
}

export interface SecurityEvent extends SecurityEventData {
  id: string;
  timestamp: Date;
}

export interface SecurityEventQuery {
  userId?: string;
  severity?: string;
  type?: string;
  limit?: number;
  since?: Date;
}

export interface SecurityEventStats {
  total: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  lastHour: number;
  last24Hours: number;
}

export interface SecurityAnomaly {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  userId?: string;
  eventType?: string;
  count?: number;
  timestamp: Date;
}