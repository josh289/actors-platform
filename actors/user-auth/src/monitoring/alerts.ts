export interface Alert {
  id: string;
  name: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  condition: string;
  threshold: number;
  window: number; // seconds
  message: string;
  metadata?: Record<string, any>;
  triggeredAt?: Date;
  resolvedAt?: Date;
}

export interface AlertRule {
  name: string;
  description: string;
  condition: (metrics: any) => boolean;
  severity: Alert['severity'];
  threshold: number;
  window: number;
  message: (metrics: any) => string;
}

/**
 * Alert rules for the authentication actor
 */
export const AUTH_ALERT_RULES: AlertRule[] = [
  {
    name: 'high_login_failure_rate',
    description: 'Login failure rate exceeds threshold',
    condition: (metrics) => {
      const failures = metrics.loginFailures?.rate || 0;
      const attempts = metrics.loginAttempts?.rate || 1;
      return (failures / attempts) > 0.5; // 50% failure rate
    },
    severity: 'warning',
    threshold: 0.5,
    window: 300, // 5 minutes
    message: (metrics) => 
      `High login failure rate detected: ${Math.round((metrics.loginFailures.rate / metrics.loginAttempts.rate) * 100)}%`,
  },
  
  {
    name: 'excessive_security_events',
    description: 'Too many security events in a short period',
    condition: (metrics) => metrics.securityEvents?.rate > 100,
    severity: 'error',
    threshold: 100,
    window: 60, // 1 minute
    message: (metrics) => 
      `Excessive security events: ${metrics.securityEvents.rate} events/min`,
  },
  
  {
    name: 'jwt_rotation_failure',
    description: 'JWT rotation has not occurred when expected',
    condition: (metrics) => {
      const lastRotation = metrics.jwtRotations?.lastTimestamp || 0;
      const hoursSinceRotation = (Date.now() - lastRotation) / (1000 * 60 * 60);
      return hoursSinceRotation > 24; // More than 24 hours
    },
    severity: 'warning',
    threshold: 24,
    window: 3600, // 1 hour
    message: () => 'JWT rotation is overdue',
  },
  
  {
    name: 'high_rate_limiting',
    description: 'Many users are being rate limited',
    condition: (metrics) => metrics.rateLimitedUsers?.value > 50,
    severity: 'warning',
    threshold: 50,
    window: 300, // 5 minutes
    message: (metrics) => 
      `High rate limiting: ${metrics.rateLimitedUsers.value} users affected`,
  },
  
  {
    name: 'session_explosion',
    description: 'Abnormal increase in active sessions',
    condition: (metrics) => {
      const current = metrics.activeSessions?.value || 0;
      const baseline = metrics.activeSessions?.baseline || 0;
      return current > baseline * 3; // 3x normal
    },
    severity: 'warning',
    threshold: 3,
    window: 600, // 10 minutes
    message: (metrics) => 
      `Session count abnormally high: ${metrics.activeSessions.value} (baseline: ${metrics.activeSessions.baseline})`,
  },
  
  {
    name: 'slow_authentication',
    description: 'Authentication operations are slow',
    condition: (metrics) => {
      const p95 = metrics.loginDuration?.p95 || 0;
      return p95 > 2; // 2 seconds
    },
    severity: 'warning',
    threshold: 2,
    window: 300, // 5 minutes
    message: (metrics) => 
      `Slow authentication detected: p95 latency ${metrics.loginDuration.p95}s`,
  },
  
  {
    name: 'critical_security_events',
    description: 'Critical security events detected',
    condition: (metrics) => 
      (metrics.securityEvents?.bySeverity?.critical || 0) > 0,
    severity: 'critical',
    threshold: 1,
    window: 60, // 1 minute
    message: (metrics) => 
      `Critical security event detected: ${metrics.securityEvents.bySeverity.critical} events`,
  },
  
  {
    name: 'magic_link_abuse',
    description: 'Excessive magic link requests',
    condition: (metrics) => {
      const sent = metrics.magicLinksSent?.rate || 0;
      const verified = metrics.magicLinksVerified?.rate || 0;
      return sent > 100 && (verified / sent) < 0.1; // <10% verification rate
    },
    severity: 'warning',
    threshold: 0.1,
    window: 300, // 5 minutes
    message: (metrics) => 
      `Magic link abuse detected: ${metrics.magicLinksSent.rate} sent, only ${Math.round((metrics.magicLinksVerified.rate / metrics.magicLinksSent.rate) * 100)}% verified`,
  },
  
  {
    name: 'jwt_verification_errors',
    description: 'High JWT verification failure rate',
    condition: (metrics) => {
      const failures = metrics.jwtVerificationFailures?.rate || 0;
      return failures > 50;
    },
    severity: 'error',
    threshold: 50,
    window: 60, // 1 minute
    message: (metrics) => 
      `High JWT verification failures: ${metrics.jwtVerificationFailures.rate} failures/min`,
  },
  
  {
    name: 'memory_usage_high',
    description: 'Actor memory usage is high',
    condition: (metrics) => {
      const memoryMB = metrics.memoryUsage?.value || 0;
      return memoryMB > 512; // 512MB
    },
    severity: 'warning',
    threshold: 512,
    window: 300, // 5 minutes
    message: (metrics) => 
      `High memory usage: ${metrics.memoryUsage.value}MB`,
  },
];

/**
 * Alert manager for monitoring and triggering alerts
 */
export class AlertManager {
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private alertHandlers: ((alert: Alert) => void)[] = [];
  
  constructor(private rules: AlertRule[] = AUTH_ALERT_RULES) {}
  
  /**
   * Register an alert handler
   */
  onAlert(handler: (alert: Alert) => void): void {
    this.alertHandlers.push(handler);
  }
  
  /**
   * Evaluate metrics against alert rules
   */
  evaluate(metrics: any): Alert[] {
    const triggeredAlerts: Alert[] = [];
    
    for (const rule of this.rules) {
      const alertKey = rule.name;
      const isTriggered = rule.condition(metrics);
      const existingAlert = this.activeAlerts.get(alertKey);
      
      if (isTriggered && !existingAlert) {
        // New alert triggered
        const alert: Alert = {
          id: `alert_${Date.now()}_${rule.name}`,
          name: rule.name,
          severity: rule.severity,
          condition: rule.description,
          threshold: rule.threshold,
          window: rule.window,
          message: rule.message(metrics),
          triggeredAt: new Date(),
          metadata: { metrics: this.extractRelevantMetrics(metrics, rule) },
        };
        
        this.activeAlerts.set(alertKey, alert);
        this.alertHistory.push(alert);
        triggeredAlerts.push(alert);
        
        // Notify handlers
        this.alertHandlers.forEach(handler => handler(alert));
        
      } else if (!isTriggered && existingAlert) {
        // Alert resolved
        existingAlert.resolvedAt = new Date();
        this.activeAlerts.delete(alertKey);
        
        // Notify handlers of resolution
        const resolvedAlert = { ...existingAlert, resolvedAt: new Date() };
        this.alertHandlers.forEach(handler => handler(resolvedAlert));
      }
    }
    
    return triggeredAlerts;
  }
  
  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }
  
  /**
   * Get alert history
   */
  getAlertHistory(limit: number = 100): Alert[] {
    return this.alertHistory.slice(-limit);
  }
  
  /**
   * Clear resolved alerts from history
   */
  clearResolvedAlerts(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    this.alertHistory = this.alertHistory.filter(
      alert => !alert.resolvedAt || alert.resolvedAt.getTime() > cutoff
    );
  }
  
  /**
   * Extract relevant metrics for an alert
   */
  private extractRelevantMetrics(metrics: any, rule: AlertRule): any {
    // Extract only the metrics relevant to this alert
    const relevant: any = {};
    
    switch (rule.name) {
      case 'high_login_failure_rate':
        relevant.loginFailures = metrics.loginFailures;
        relevant.loginAttempts = metrics.loginAttempts;
        break;
      
      case 'excessive_security_events':
        relevant.securityEvents = metrics.securityEvents;
        break;
      
      case 'jwt_rotation_failure':
        relevant.jwtRotations = metrics.jwtRotations;
        break;
      
      case 'high_rate_limiting':
        relevant.rateLimitedUsers = metrics.rateLimitedUsers;
        break;
      
      case 'session_explosion':
        relevant.activeSessions = metrics.activeSessions;
        break;
      
      case 'slow_authentication':
        relevant.loginDuration = metrics.loginDuration;
        break;
      
      default:
        // Include all metrics for unknown rules
        return metrics;
    }
    
    return relevant;
  }
  
  /**
   * Format alert for logging
   */
  formatAlert(alert: Alert): string {
    const status = alert.resolvedAt ? 'RESOLVED' : 'ACTIVE';
    const duration = alert.resolvedAt 
      ? `(duration: ${Math.round((alert.resolvedAt.getTime() - alert.triggeredAt!.getTime()) / 1000)}s)`
      : '';
      
    return `[${alert.severity.toUpperCase()}] ${status} ${duration} - ${alert.name}: ${alert.message}`;
  }
}