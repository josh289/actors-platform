# Authentication Actor Monitoring Guide

This guide explains the comprehensive monitoring, metrics, and alerting capabilities built into the authentication actor.

## Overview

The auth actor includes:
- **Prometheus-compatible metrics** for all operations
- **Real-time alerting** with configurable thresholds
- **Performance tracking** for latency and throughput
- **Security event monitoring** and anomaly detection
- **Resource usage tracking** for capacity planning

## Metrics

### Available Metrics

#### Counters
- `auth_login_attempts_total` - Total login attempts by method and status
- `auth_login_successes_total` - Successful logins by method
- `auth_login_failures_total` - Failed logins by method and reason
- `auth_magic_links_sent_total` - Magic links sent
- `auth_magic_links_verified_total` - Magic links verified by status
- `auth_sessions_created_total` - Sessions created by method
- `auth_sessions_revoked_total` - Sessions revoked by reason
- `auth_users_registered_total` - New user registrations by method
- `auth_jwt_rotations_total` - JWT secret rotations
- `auth_permission_checks_total` - Permission checks by result
- `auth_security_events_total` - Security events by type and severity

#### Histograms
- `auth_login_duration_seconds` - Login operation duration
- `auth_magic_link_verification_seconds` - Time from sent to verified
- `auth_jwt_verification_duration_seconds` - JWT verification time
- `auth_command_processing_seconds` - Command processing duration
- `auth_query_processing_seconds` - Query processing duration

#### Gauges
- `auth_active_sessions` - Current active sessions
- `auth_active_users` - Unique users with sessions
- `auth_pending_magic_links` - Unverified magic links
- `auth_jwt_secrets_count` - JWT secrets by status
- `auth_rate_limited_users` - Users currently rate limited

### Accessing Metrics

#### Via Query
```typescript
const metrics = await actor.query({
  type: 'GET_METRICS'
});

// Returns:
{
  metrics: [...], // JSON format
  text: "..."     // Prometheus text format
}
```

#### Via HTTP Endpoint
If `ENABLE_METRICS_ENDPOINT=true`:
```bash
curl http://localhost:9090/metrics
```

### Example Metrics Output
```
# HELP auth_login_attempts_total Total number of login attempts
# TYPE auth_login_attempts_total counter
auth_login_attempts_total{method="magic_link",status="success"} 142
auth_login_attempts_total{method="magic_link",status="failure"} 23
auth_login_attempts_total{method="biometric",status="success"} 89

# HELP auth_login_duration_seconds Login operation duration in seconds
# TYPE auth_login_duration_seconds histogram
auth_login_duration_seconds_bucket{method="magic_link",le="0.005"} 10
auth_login_duration_seconds_bucket{method="magic_link",le="0.01"} 45
auth_login_duration_seconds_bucket{method="magic_link",le="0.025"} 120
auth_login_duration_seconds_bucket{method="magic_link",le="0.05"} 139
auth_login_duration_seconds_bucket{method="magic_link",le="0.1"} 141
auth_login_duration_seconds_bucket{method="magic_link",le="+Inf"} 142
auth_login_duration_seconds_sum{method="magic_link"} 3.245
auth_login_duration_seconds_count{method="magic_link"} 142
```

## Alerts

### Pre-configured Alert Rules

1. **High Login Failure Rate**
   - Severity: Warning
   - Condition: >50% failure rate
   - Window: 5 minutes
   - Message: "High login failure rate detected: X%"

2. **Excessive Security Events**
   - Severity: Error
   - Condition: >100 events/minute
   - Window: 1 minute
   - Message: "Excessive security events: X events/min"

3. **JWT Rotation Failure**
   - Severity: Warning
   - Condition: No rotation in 24 hours
   - Window: 1 hour
   - Message: "JWT rotation is overdue"

4. **High Rate Limiting**
   - Severity: Warning
   - Condition: >50 users rate limited
   - Window: 5 minutes
   - Message: "High rate limiting: X users affected"

5. **Session Explosion**
   - Severity: Warning
   - Condition: 3x baseline sessions
   - Window: 10 minutes
   - Message: "Session count abnormally high"

6. **Slow Authentication**
   - Severity: Warning
   - Condition: p95 latency >2s
   - Window: 5 minutes
   - Message: "Slow authentication detected"

7. **Critical Security Events**
   - Severity: Critical
   - Condition: Any critical event
   - Window: 1 minute
   - Message: "Critical security event detected"

8. **Magic Link Abuse**
   - Severity: Warning
   - Condition: <10% verification rate
   - Window: 5 minutes
   - Message: "Magic link abuse detected"

### Accessing Alerts

```typescript
const alerts = await actor.query({
  type: 'GET_ALERTS'
});

// Returns:
{
  active: [...],  // Currently triggered alerts
  history: [...]  // Alert history (last 100)
}
```

### Alert Format
```typescript
{
  id: "alert_1234567890_high_login_failure_rate",
  name: "high_login_failure_rate",
  severity: "warning",
  condition: "Login failure rate exceeds threshold",
  threshold: 0.5,
  window: 300,
  message: "High login failure rate detected: 67%",
  triggeredAt: "2024-01-15T10:30:00Z",
  resolvedAt: null,
  metadata: {
    metrics: {
      loginFailures: { rate: 45 },
      loginAttempts: { rate: 67 }
    }
  }
}
```

## Security Monitoring

### Security Event Types
- `invalid_token_attempt` - Invalid magic link or JWT
- `session_mismatch` - JWT claims don't match session
- `account_locked` - Account locked for security
- `invalid_session_token` - Invalid session token
- `brute_force_attempt` - Multiple failed logins
- `privilege_escalation` - Unauthorized permission attempt

### Security Event Severities
- `low` - Informational, expected failures
- `medium` - Suspicious activity
- `high` - Likely security incident
- `critical` - Active attack or breach

### Querying Security Events
```typescript
const events = await actor.query({
  type: AuthQueries.GET_SECURITY_EVENTS,
  payload: {
    userId: 'user-123',  // Optional: filter by user
    limit: 100           // Max events to return
  }
});
```

## Grafana Dashboard

### Recommended Panels

1. **Authentication Overview**
   - Login success rate
   - Active sessions
   - Active users
   - Registration rate

2. **Performance Metrics**
   - Login duration p50, p95, p99
   - JWT verification time
   - Command/query latency

3. **Security Dashboard**
   - Security events by severity
   - Failed login attempts
   - Rate limited users
   - Account lockouts

4. **System Health**
   - JWT rotation status
   - Pending magic links
   - Memory usage
   - Error rates

### Example Grafana Queries

**Login Success Rate**
```promql
rate(auth_login_successes_total[5m]) / 
rate(auth_login_attempts_total[5m]) * 100
```

**p95 Login Latency**
```promql
histogram_quantile(0.95, 
  rate(auth_login_duration_seconds_bucket[5m])
)
```

**Security Events by Severity**
```promql
sum by (severity) (
  rate(auth_security_events_total[5m])
)
```

## Integration with External Monitoring

### Prometheus Configuration
```yaml
scrape_configs:
  - job_name: 'auth-actor'
    static_configs:
      - targets: ['localhost:9090']
    scrape_interval: 30s
```

### AlertManager Integration
```yaml
groups:
  - name: auth_alerts
    rules:
      - alert: HighLoginFailureRate
        expr: |
          (sum(rate(auth_login_failures_total[5m])) / 
           sum(rate(auth_login_attempts_total[5m]))) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High login failure rate"
          description: "Login failure rate is {{ $value }}%"
```

### DataDog Integration
```typescript
// Custom StatsD integration
import { StatsD } from 'node-statsd';

const statsd = new StatsD({
  host: 'localhost',
  port: 8125,
  prefix: 'auth_actor.'
});

// Forward metrics
actor.on('METRIC_UPDATE', (metric) => {
  statsd.gauge(metric.name, metric.value, metric.tags);
});
```

## Best Practices

### 1. Metric Naming
- Use consistent prefixes (`auth_`)
- Include units in names (`_seconds`, `_total`)
- Use labels for dimensions, not metric names

### 2. Alert Tuning
- Start with conservative thresholds
- Adjust based on baseline metrics
- Consider time-of-day patterns
- Avoid alert fatigue

### 3. Dashboard Design
- Group related metrics
- Use appropriate visualizations
- Include context (thresholds, baselines)
- Make actionable

### 4. Retention Policies
- High-frequency metrics: 7 days
- Aggregated metrics: 30 days
- Security events: 90 days
- Audit logs: 1 year

## Troubleshooting

### High Memory Usage
Check:
- Session count (`auth_active_sessions`)
- Security event buffer size
- Metric cardinality

### Missing Metrics
Verify:
- Actor is initialized
- Metrics endpoint enabled
- Prometheus scraping correctly

### Alert Storm
Solutions:
- Increase alert windows
- Add hysteresis to thresholds
- Group related alerts
- Rate limit notifications

## Performance Impact

Monitoring overhead:
- CPU: <2% for metric collection
- Memory: ~10MB for metric storage
- Network: ~1KB/s for scraping
- Latency: <1ms per operation

## Configuration

### Environment Variables
```bash
# Enable metrics endpoint
ENABLE_METRICS_ENDPOINT=true
METRICS_PORT=9090

# Alert configuration
ALERT_WEBHOOK_URL=https://example.com/alerts
ALERT_EMAIL=security@example.com

# Metric retention
METRIC_BUFFER_SIZE=10000
METRIC_CLEANUP_INTERVAL=3600000
```

### Custom Alerts
```typescript
const customRule: AlertRule = {
  name: 'custom_alert',
  description: 'Custom business rule',
  condition: (metrics) => metrics.customMetric > 100,
  severity: 'warning',
  threshold: 100,
  window: 300,
  message: (metrics) => `Custom alert: ${metrics.customMetric}`
};

alertManager.addRule(customRule);
```