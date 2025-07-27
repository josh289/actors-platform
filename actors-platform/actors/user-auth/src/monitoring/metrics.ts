import { Counter, Histogram, Gauge, Registry } from 'prom-client';

/**
 * Metrics for monitoring the authentication actor
 */
export class AuthMetrics {
  private registry: Registry;
  
  // Counters
  public readonly loginAttempts: Counter;
  public readonly loginSuccesses: Counter;
  public readonly loginFailures: Counter;
  public readonly magicLinksSent: Counter;
  public readonly magicLinksVerified: Counter;
  public readonly sessionsCreated: Counter;
  public readonly sessionsRevoked: Counter;
  public readonly usersRegistered: Counter;
  public readonly jwtRotations: Counter;
  public readonly permissionChecks: Counter;
  public readonly securityEvents: Counter;
  
  // Histograms
  public readonly loginDuration: Histogram;
  public readonly magicLinkVerificationTime: Histogram;
  public readonly jwtVerificationTime: Histogram;
  public readonly commandProcessingTime: Histogram;
  public readonly queryProcessingTime: Histogram;
  
  // Gauges
  public readonly activeSessions: Gauge;
  public readonly activeUsers: Gauge;
  public readonly pendingMagicLinks: Gauge;
  public readonly jwtSecretsCount: Gauge;
  public readonly rateLimitedUsers: Gauge;
  
  constructor(registry?: Registry) {
    this.registry = registry || new Registry();
    
    // Initialize counters
    this.loginAttempts = new Counter({
      name: 'auth_login_attempts_total',
      help: 'Total number of login attempts',
      labelNames: ['method', 'status'],
      registers: [this.registry],
    });
    
    this.loginSuccesses = new Counter({
      name: 'auth_login_successes_total',
      help: 'Total number of successful logins',
      labelNames: ['method'],
      registers: [this.registry],
    });
    
    this.loginFailures = new Counter({
      name: 'auth_login_failures_total',
      help: 'Total number of failed logins',
      labelNames: ['method', 'reason'],
      registers: [this.registry],
    });
    
    this.magicLinksSent = new Counter({
      name: 'auth_magic_links_sent_total',
      help: 'Total number of magic links sent',
      registers: [this.registry],
    });
    
    this.magicLinksVerified = new Counter({
      name: 'auth_magic_links_verified_total',
      help: 'Total number of magic links verified',
      labelNames: ['status'],
      registers: [this.registry],
    });
    
    this.sessionsCreated = new Counter({
      name: 'auth_sessions_created_total',
      help: 'Total number of sessions created',
      labelNames: ['method'],
      registers: [this.registry],
    });
    
    this.sessionsRevoked = new Counter({
      name: 'auth_sessions_revoked_total',
      help: 'Total number of sessions revoked',
      labelNames: ['reason'],
      registers: [this.registry],
    });
    
    this.usersRegistered = new Counter({
      name: 'auth_users_registered_total',
      help: 'Total number of users registered',
      labelNames: ['method'],
      registers: [this.registry],
    });
    
    this.jwtRotations = new Counter({
      name: 'auth_jwt_rotations_total',
      help: 'Total number of JWT secret rotations',
      registers: [this.registry],
    });
    
    this.permissionChecks = new Counter({
      name: 'auth_permission_checks_total',
      help: 'Total number of permission checks',
      labelNames: ['result'],
      registers: [this.registry],
    });
    
    this.securityEvents = new Counter({
      name: 'auth_security_events_total',
      help: 'Total number of security events',
      labelNames: ['type', 'severity'],
      registers: [this.registry],
    });
    
    // Initialize histograms
    this.loginDuration = new Histogram({
      name: 'auth_login_duration_seconds',
      help: 'Login operation duration in seconds',
      labelNames: ['method'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
    
    this.magicLinkVerificationTime = new Histogram({
      name: 'auth_magic_link_verification_seconds',
      help: 'Time between magic link sent and verified',
      buckets: [30, 60, 120, 300, 600, 900], // 30s to 15min
      registers: [this.registry],
    });
    
    this.jwtVerificationTime = new Histogram({
      name: 'auth_jwt_verification_duration_seconds',
      help: 'JWT verification duration in seconds',
      buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05],
      registers: [this.registry],
    });
    
    this.commandProcessingTime = new Histogram({
      name: 'auth_command_processing_seconds',
      help: 'Command processing duration in seconds',
      labelNames: ['command'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
    
    this.queryProcessingTime = new Histogram({
      name: 'auth_query_processing_seconds',
      help: 'Query processing duration in seconds',
      labelNames: ['query'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.registry],
    });
    
    // Initialize gauges
    this.activeSessions = new Gauge({
      name: 'auth_active_sessions',
      help: 'Current number of active sessions',
      registers: [this.registry],
    });
    
    this.activeUsers = new Gauge({
      name: 'auth_active_users',
      help: 'Current number of users with active sessions',
      registers: [this.registry],
    });
    
    this.pendingMagicLinks = new Gauge({
      name: 'auth_pending_magic_links',
      help: 'Current number of pending magic links',
      registers: [this.registry],
    });
    
    this.jwtSecretsCount = new Gauge({
      name: 'auth_jwt_secrets_count',
      help: 'Current number of JWT secrets',
      labelNames: ['status'],
      registers: [this.registry],
    });
    
    this.rateLimitedUsers = new Gauge({
      name: 'auth_rate_limited_users',
      help: 'Current number of rate-limited users',
      registers: [this.registry],
    });
  }
  
  /**
   * Get the metrics registry
   */
  getRegistry(): Registry {
    return this.registry;
  }
  
  /**
   * Record a login attempt
   */
  recordLoginAttempt(method: string, success: boolean, reason?: string): void {
    this.loginAttempts.inc({ method, status: success ? 'success' : 'failure' });
    
    if (success) {
      this.loginSuccesses.inc({ method });
    } else {
      this.loginFailures.inc({ method, reason: reason || 'unknown' });
    }
  }
  
  /**
   * Record a security event
   */
  recordSecurityEvent(type: string, severity: 'low' | 'medium' | 'high' | 'critical'): void {
    this.securityEvents.inc({ type, severity });
  }
  
  /**
   * Update session metrics
   */
  updateSessionMetrics(activeSessions: number, activeUsers: number): void {
    this.activeSessions.set(activeSessions);
    this.activeUsers.set(activeUsers);
  }
  
  /**
   * Update JWT metrics
   */
  updateJWTMetrics(activeSecrets: number, totalSecrets: number): void {
    this.jwtSecretsCount.set({ status: 'active' }, activeSecrets);
    this.jwtSecretsCount.set({ status: 'valid' }, totalSecrets);
  }
  
  /**
   * Start a timer for command processing
   */
  startCommandTimer(command: string): () => void {
    return this.commandProcessingTime.startTimer({ command });
  }
  
  /**
   * Start a timer for query processing
   */
  startQueryTimer(query: string): () => void {
    return this.queryProcessingTime.startTimer({ query });
  }
  
  /**
   * Start a timer for login duration
   */
  startLoginTimer(method: string): () => void {
    return this.loginDuration.startTimer({ method });
  }
  
  /**
   * Start a timer for JWT verification
   */
  startJWTVerificationTimer(): () => void {
    return this.jwtVerificationTime.startTimer();
  }
  
  /**
   * Get metrics for export
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
  
  /**
   * Get metrics in JSON format
   */
  async getMetricsJSON(): Promise<any> {
    return this.registry.getMetricsAsJSON();
  }
}