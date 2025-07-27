# User Auth Actor API Reference

This document describes the API for the user-auth actor, including commands, queries, and events.

## Overview

The user-auth actor provides authentication and authorization services with built-in monitoring, security tracking, rate limiting, and health checks.

## Authentication Flow

1. **Send Magic Link**: User requests a magic link via email
2. **Verify Magic Link**: User clicks link and token is verified
3. **Create Session**: JWT session token is issued
4. **Use Session**: Include JWT in subsequent requests

## Commands (State Changes)

Commands modify the actor's state and should be sent using `actor.handle()`.

### SEND_MAGIC_LINK

Send a magic link to the user's email for passwordless authentication.

**Payload:**
```typescript
{
  email: string;
  ipAddress?: string;  // Client IP for security tracking
  userAgent?: string;  // Browser user agent
}
```

**Response:**
```typescript
{
  success: true,
  events: [{ type: 'MAGIC_LINK_SENT', payload: { email } }]
}
```

**Rate Limited:** 3 requests per 15 minutes per email

### VERIFY_MAGIC_LINK

Verify a magic link token and create a session.

**Payload:**
```typescript
{
  token: string;      // Token from email
  email: string;      // Email address
  ipAddress?: string;
  userAgent?: string;
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    user: {
      id: string;
      email: string;
      name: string | null;
      roles: Role[];
    },
    session: {
      token: string;      // JWT token
      expiresAt: Date;
    }
  },
  events: [
    { type: 'USER_REGISTERED', payload: { userId, email, method: 'magic_link' } },
    { type: 'SESSION_CREATED', payload: { userId, sessionId } }
  ]
}
```

**Rate Limited:** 5 attempts per 15 minutes per email

### CREATE_SESSION

Create a new session for an authenticated user (e.g., after OAuth or biometric auth).

**Payload:**
```typescript
{
  userId: string;
  device: {
    ipAddress: string;
    userAgent: string;
    biometricAuth?: boolean;
  }
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    token: string;
    expiresAt: Date;
  },
  events: [{ type: 'SESSION_CREATED', payload: { userId, sessionId, device } }]
}
```

### UPDATE_PROFILE

Update user profile information.

**Payload:**
```typescript
{
  userId: string;
  updates: {
    name?: string;
    avatar?: string;
    bio?: string;
  }
}
```

**Response:**
```typescript
{
  success: true,
  data: User,
  events: [{ type: 'PROFILE_UPDATED', payload: { userId, changes: string[] } }]
}
```

### ASSIGN_ROLE

Assign a role to a user (requires admin permissions).

**Payload:**
```typescript
{
  userId: string;
  roleId: string;
  grantedBy: string;
  expiresAt?: Date;  // Optional expiration
}
```

**Response:**
```typescript
{
  success: true,
  events: [{ type: 'ROLE_ASSIGNED', payload: { userId, roleId, grantedBy } }]
}
```

### REVOKE_SESSION

Revoke an active session.

**Payload:**
```typescript
{
  sessionId: string;
}
```

**Response:**
```typescript
{
  success: true,
  events: [{ type: 'SESSION_REVOKED', payload: { userId, sessionId } }]
}
```

### DELETE_USER

Soft delete a user account.

**Payload:**
```typescript
{
  userId: string;
}
```

**Response:**
```typescript
{
  success: true,
  events: [{ type: 'USER_DELETED', payload: { userId } }]
}
```

### LOCK_ACCOUNT

Lock a user account for security reasons.

**Payload:**
```typescript
{
  userId: string;
  reason: string;
}
```

**Response:**
```typescript
{
  success: true
}
```

## Queries (Read Operations)

Queries read data without modifying state and should be sent using `actor.query()`.

### GET_USER

Get user details by ID.

**Payload:**
```typescript
{
  userId: string;
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    id: string;
    email: string;
    emailVerified: boolean;
    name: string | null;
    avatar: string | null;
    bio: string | null;
    roles: { id: string; name: string; }[];
    createdAt: Date;
    updatedAt: Date;
  } | null
}
```

### GET_SESSION

Verify and get session information from JWT token.

**Payload:**
```typescript
{
  token: string;  // JWT token
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    session: {
      id: string;
      expiresAt: Date;
    },
    user: User
  } | null
}
```

### GET_PERMISSION

Check if a user has a specific permission.

**Payload:**
```typescript
{
  userId: string;
  permission: string;  // e.g., "write:posts"
}
```

**Response:**
```typescript
{
  success: true,
  data: boolean
}
```

### GET_SESSIONS

List all active sessions for a user.

**Payload:**
```typescript
{
  userId: string;
}
```

**Response:**
```typescript
{
  success: true,
  data: Session[]
}
```

### GET_ROLES

Get all roles assigned to a user.

**Payload:**
```typescript
{
  userId: string;
}
```

**Response:**
```typescript
{
  success: true,
  data: Array<{
    userId: string;
    roleId: string;
    role: Role;
    grantedBy: string | null;
    expiresAt: Date | null;
    createdAt: Date;
  }>
}
```

### GET_SECURITY_EVENTS

Get security events (optionally filtered by user).

**Payload:**
```typescript
{
  userId?: string;
  limit?: number;  // Default: 50
}
```

**Response:**
```typescript
{
  success: true,
  data: SecurityEvent[]
}
```

### GET_JWT_STATUS

Get JWT secret rotation status.

**Payload:** None

**Response:**
```typescript
{
  success: true,
  data: {
    activeSecretId: string;
    totalSecrets: number;
    expiredSecrets: number;
    nextRotation: Date;
  }
}
```

### GET_METRICS

Get Prometheus-compatible metrics.

**Payload:** None

**Response:**
```typescript
{
  success: true,
  data: {
    metrics: string;      // Prometheus text format
    custom: {            // Custom metrics
      activeSessions: number;
      activeUsers: number;
      pendingMagicLinks: number;
      jwtSecretsActive: number;
    }
  }
}
```

### GET_ALERTS

Get security alerts and anomalies.

**Payload:** None

**Response:**
```typescript
{
  success: true,
  data: {
    anomalies: SecurityAnomaly[];
    underAttack: boolean;
  }
}
```

## Events (Notifications)

Events are emitted by the actor to notify about state changes.

| Event | Description | Payload |
|-------|-------------|---------|
| `USER_REGISTERED` | New user registered | `{ userId, email, method }` |
| `SESSION_CREATED` | Session created | `{ userId, sessionId, device? }` |
| `SESSION_REVOKED` | Session revoked | `{ userId, sessionId }` |
| `PROFILE_UPDATED` | Profile updated | `{ userId, changes }` |
| `ROLE_ASSIGNED` | Role assigned | `{ userId, roleId, grantedBy }` |
| `USER_DELETED` | User deleted | `{ userId }` |
| `MAGIC_LINK_SENT` | Magic link email sent | `{ email }` |
| `JWT_SECRET_ROTATED` | JWT secret rotated | `{ secretId, rotatedAt, expiresAt }` |

## Security Events

The following security events are automatically tracked:

| Event Type | Severity | Description |
|------------|----------|-------------|
| `invalid_token_attempt` | medium | Invalid magic link token |
| `invalid_session_token` | low | Invalid JWT token |
| `session_mismatch` | high | JWT claims don't match session |
| `account_locked` | high | Account locked for security |

## Usage Examples

### TypeScript/JavaScript

```typescript
import { Actor } from '@actors-platform/sdk';
import { AuthActor } from '@actors-platform/user-auth';

const actor = new AuthActor(context);
await actor.initialize();

// Send magic link
const result = await actor.handle({
  type: 'SEND_MAGIC_LINK',
  payload: {
    email: 'user@example.com',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  }
});

// Verify magic link
const session = await actor.handle({
  type: 'VERIFY_MAGIC_LINK',
  payload: {
    token: 'token-from-email',
    email: 'user@example.com'
  }
});

// Check session
const sessionData = await actor.query({
  type: 'GET_SESSION',
  payload: {
    token: 'jwt-token-from-client'
  }
});

// Check permission
const hasPermission = await actor.query({
  type: 'GET_PERMISSION',
  payload: {
    userId: 'user-123',
    permission: 'write:posts'
  }
});
```

### REST API Adapter

If you're exposing the actor via REST:

```typescript
// POST /api/auth/magic-link
app.post('/api/auth/magic-link', async (req, res) => {
  const result = await actor.handle({
    type: 'SEND_MAGIC_LINK',
    payload: {
      email: req.body.email,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }
  });
  
  res.json(result);
});

// GET /api/auth/session
app.get('/api/auth/session', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  const result = await actor.query({
    type: 'GET_SESSION',
    payload: { token }
  });
  
  res.json(result);
});
```

## Rate Limiting

Built-in rate limiting is enforced for:
- `SEND_MAGIC_LINK`: 3 requests per 15 minutes per email
- `VERIFY_MAGIC_LINK`: 5 attempts per 15 minutes per email

Rate limited requests will return:
```typescript
{
  success: false,
  error: new Error('Rate limit exceeded')
}
```

## Health & Monitoring

### Health Check
```typescript
const health = await actor.getHealthStatus();
// Returns: { healthy: boolean, checks: {...}, lastUpdated: Date }
```

### Metrics Endpoint
```typescript
const metrics = await actor.getMetrics();
// Returns: Prometheus-formatted metrics string
```

## Error Handling

All errors follow this format:
```typescript
{
  success: false,
  error: Error
}
```

Common error messages:
- "Invalid or expired token"
- "User not found"
- "Session not found"
- "Rate limit exceeded"
- "Account is temporarily locked"
- "Validation failed: [details]"

## Best Practices

1. **Always include IP and User Agent** for security tracking
2. **Handle rate limiting gracefully** with exponential backoff
3. **Monitor security events** for anomalies
4. **Use health checks** for production monitoring
5. **Track metrics** for performance optimization
6. **Implement proper error handling** for all commands/queries

## Changelog

### v2.0.0 (2024-01-15)
- Refactored to use enhanced Actor base class
- Built-in Prometheus metrics
- Automatic security event tracking
- Rate limiting support
- Circuit breakers for external services
- Health check endpoints
- JWT secret rotation
- Event validation
- Updated event names for specification compliance

### v1.0.0 (2024-01-01)
- Initial release with magic link authentication
- Session management
- Role-based access control
- Basic security event tracking