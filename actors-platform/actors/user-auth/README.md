# User Authentication Actor

A production-ready authentication actor built with Better Auth, providing secure user authentication with magic links, session management, and role-based access control. This actor leverages the enhanced Actor framework with built-in monitoring, security tracking, rate limiting, and health checks.

## Features

### Core Authentication
- 🔐 **Magic Link Authentication** - Passwordless login via email
- 🎫 **JWT-based Sessions** - Secure, stateless authentication with rotation
- 🔄 **Session Management** - Active session tracking and management
- 👤 **Profile Management** - User profile updates

### Built-in Production Features (from Enhanced Actor Base)
- 📊 **Prometheus Metrics** - Automatic monitoring and observability
- 🛡️ **Security Event Tracking** - Comprehensive audit logging with anomaly detection
- 🚦 **Rate Limiting** - Built-in protection against brute force attacks
- 💔 **Circuit Breakers** - Fault tolerance for external services
- ✅ **Health Checks** - Automatic health monitoring
- 🔍 **Event Validation** - Command and query validation
- 🧪 **Testing Utilities** - Built-in test mode support

### Security Features
- 🔒 **Account Lockout** - Automatic lockout after failed attempts
- 🔑 **JWT Secret Rotation** - Zero-downtime secret rotation
- 📊 **Security Analytics** - Attack detection and anomaly identification
- 🧹 **Automatic Cleanup** - Expired session and token cleanup

### Access Control
- 👥 **Role-Based Access Control (RBAC)** - Flexible permission system
- ⏰ **Time-based Roles** - Temporary role assignments
- 🔑 **Fine-grained Permissions** - Resource and action-based
- 🌟 **Wildcard Permissions** - Admin super-user support

### Compliance & Privacy
- 🏛️ **GDPR Ready** - Self-hosted with Better Auth, full data control
- 🗑️ **Soft Delete** - User data retention policies
- 📝 **Audit Trail** - Complete activity logging via built-in security tracking
- 🔐 **Data Sanitization** - PII protection

## Installation

```bash
# Add the actor to your project
relay add-actor user-auth

# Configure environment variables
cp .env.example .env
# Edit .env with your settings

# Start using the actor
npm run dev
```

## Configuration

### Environment Variables

```env
# Required
JWT_SECRET=your-super-secure-jwt-secret
APP_URL=http://localhost:3000

# JWT Rotation
JWT_ROTATION_INTERVAL=2592000000  # 30 days in ms
JWT_SECRET_LIFETIME=7776000000    # 90 days in ms

# Session Settings
SESSION_TIMEOUT=86400000          # 24 hours

# Better Auth Database (if using external DB)
DATABASE_URL=postgresql://user:password@localhost:5432/auth_db

# Monitoring
ENABLE_METRICS_ENDPOINT=true
METRICS_PORT=9090

# Security
SECURITY_WEBHOOK_URL=https://security.example.com/events
SECURITY_WEBHOOK_TOKEN=secret
```

## Usage

### Magic Link Login

```typescript
// Send magic link
const result = await actor.command({
  type: 'SEND_MAGIC_LINK',
  payload: {
    email: 'user@example.com',
    ipAddress: '192.168.1.1',  // Optional
    userAgent: 'Mozilla/5.0...' // Optional
  }
});

// Verify magic link token
const session = await actor.command({
  type: 'VERIFY_MAGIC_LINK',  // Note: Updated from VERIFY_TOKEN
  payload: {
    token: 'token-from-email',
    email: 'user@example.com'
  }
});
```

### Session Verification

```typescript
// Verify session token
const session = await actor.query({
  type: 'GET_SESSION',  // Note: Updated from VERIFY_SESSION
  payload: {
    token: 'jwt-token-from-client'
  }
});

if (session.data) {
  // User is authenticated
  const { user, session } = session.data;
}
```

### Permission Checking

```typescript
// Check if user has permission
const hasPermission = await actor.query({
  type: 'GET_PERMISSION',  // Note: Updated from CHECK_PERMISSION
  payload: {
    userId: 'user-123',
    permission: 'write:posts'
  }
});

if (hasPermission.data) {
  // User has permission
}
```

### Role Management

```typescript
// Assign role to user
await actor.command({
  type: 'ASSIGN_ROLE',
  payload: {
    userId: 'user-123',
    roleId: 'role-moderator',
    grantedBy: 'admin-user',
    expiresAt: new Date('2024-12-31') // Optional
  }
});
```

### Monitoring and Metrics

```typescript
// Get metrics (Prometheus format)
const metrics = await actor.query({
  type: 'GET_METRICS'
});

// Get security alerts
const alerts = await actor.query({
  type: 'GET_ALERTS'
});

// Get JWT rotation status
const jwtStatus = await actor.query({
  type: 'GET_JWT_STATUS'
});
```

## Component Usage

### React Components

```tsx
import { 
  LoginForm, 
  AuthGuard, 
  UserProfile 
} from '@actors-platform/user-auth/components';

// Login form with magic link
function LoginPage() {
  return (
    <LoginForm 
      onSuccess={(data) => {
        // Redirect to dashboard
      }}
      onError={(error) => {
        // Handle error
      }}
    />
  );
}

// Protected routes
function Dashboard() {
  return (
    <AuthGuard requiredPermission="read:dashboard">
      <h1>Protected Dashboard</h1>
    </AuthGuard>
  );
}
```

## API Reference

### Commands (State Changes)

| Command | Description | Payload |
|---------|-------------|---------|
| `SEND_MAGIC_LINK` | Send magic link email | `{ email, ipAddress?, userAgent? }` |
| `VERIFY_MAGIC_LINK` | Verify magic link token | `{ token, email }` |
| `CREATE_SESSION` | Create new session | `{ userId, device }` |
| `UPDATE_PROFILE` | Update user profile | `{ userId, updates }` |
| `ASSIGN_ROLE` | Assign role to user | `{ userId, roleId, grantedBy, expiresAt? }` |
| `REVOKE_SESSION` | Revoke active session | `{ sessionId }` |
| `DELETE_USER` | Soft delete user | `{ userId }` |
| `LOCK_ACCOUNT` | Lock user account | `{ userId, reason }` |

### Queries (Read Operations)

| Query | Description | Payload | Response |
|-------|-------------|---------|----------|
| `GET_USER` | Get user details | `{ userId }` | User object |
| `GET_SESSION` | Verify session token | `{ token }` | Session + User |
| `GET_PERMISSION` | Check user permission | `{ userId, permission }` | Boolean |
| `GET_SESSIONS` | List user sessions | `{ userId }` | Session array |
| `GET_ROLES` | Get user roles | `{ userId }` | Role array |
| `GET_SECURITY_EVENTS` | Get security events | `{ userId?, limit? }` | Event array |
| `GET_JWT_STATUS` | Get JWT rotation status | - | JWT status |
| `GET_METRICS` | Get Prometheus metrics | - | Metrics + custom metrics |
| `GET_ALERTS` | Get security alerts | - | Anomalies + attack status |

### Events (Notifications)

| Event | Description | Payload |
|-------|-------------|---------|
| `USER_REGISTERED` | New user registered | `{ userId, email, method }` |
| `SESSION_CREATED` | Session created | `{ userId, sessionId }` |
| `SESSION_REVOKED` | Session revoked | `{ userId, sessionId }` |
| `PROFILE_UPDATED` | Profile updated | `{ userId, changes }` |
| `ROLE_ASSIGNED` | Role assigned | `{ userId, roleId, grantedBy }` |
| `USER_DELETED` | User deleted | `{ userId }` |
| `MAGIC_LINK_SENT` | Magic link email sent | `{ email }` |
| `JWT_SECRET_ROTATED` | JWT secret rotated | `{ secretId, rotatedAt, expiresAt }` |

## Built-in Monitoring

The auth actor automatically tracks:

### Metrics
- `magic_links_sent` - Total magic links sent
- `magic_links_verified` - Magic links verified (by status)
- `sessions_created` - Sessions created (by method)
- `sessions_revoked` - Sessions revoked (by reason)
- `users_registered` - New user registrations
- `permission_checks` - Permission checks (granted/denied)
- `jwt_rotations` - JWT secret rotations
- `magic_link_verification_time` - Time between sent and verified
- `jwt_verification_duration` - JWT verification performance
- `active_sessions` - Currently active sessions (gauge)
- `active_users` - Unique users with sessions (gauge)
- `pending_magic_links` - Unverified magic links (gauge)

### Security Events
- `invalid_token_attempt` - Invalid magic link attempts
- `invalid_session_token` - Invalid JWT tokens
- `session_mismatch` - JWT claims don't match session
- `account_locked` - Account locked for security

### Health Checks
- JWT secret availability
- Active session count
- Pending magic link count
- Circuit breaker status

## Rate Limiting

Built-in rate limiting for:
- `SEND_MAGIC_LINK`: 3 requests per 15 minutes per email
- `VERIFY_MAGIC_LINK`: 5 attempts per 15 minutes per email

## Security Best Practices

### 1. JWT Security
- Secrets are automatically rotated every 30 days
- Multiple secrets supported for zero-downtime rotation
- Old secrets expire after 90 days
- Monitor JWT rotation status

### 2. Session Security
- Sessions expire after 24 hours by default
- Track device information
- Users can revoke individual sessions
- Automatic cleanup of expired sessions

### 3. Monitoring
- Use Prometheus endpoint for metrics collection
- Set up alerts for anomalies
- Monitor security events
- Track JWT rotation status

### 4. Rate Limiting
- Built-in rate limiting prevents brute force
- Configurable per-operation limits
- Automatic 429 responses when exceeded

## Production Deployment

### Health Check Endpoint
```bash
GET /health
```

Returns:
```json
{
  "healthy": true,
  "checks": {
    "state": { "healthy": true, "message": "State is initialized" },
    "runtime": { "healthy": true, "message": "Runtime is available" },
    "circuitBreakers": { "healthy": true, "message": "Circuit breakers: {}" },
    "auth": { "healthy": true, "message": "Active sessions: 42, Pending magic links: 3" },
    "jwt": { "healthy": true, "message": "JWT secrets: 2" }
  },
  "lastUpdated": "2024-01-15T12:00:00Z"
}
```

### Metrics Endpoint
```bash
GET /metrics
```

Returns Prometheus-formatted metrics.

## Troubleshooting

### Common Issues

1. **"Rate limit exceeded" error**
   - Built-in rate limiting triggered
   - Wait for rate limit window to reset
   - Check metrics for abuse patterns

2. **JWT verification failures**
   - Check if secrets are rotating properly
   - Verify JWT_SECRET environment variable
   - Monitor `jwt_verification_duration` metric

3. **Circuit breaker open**
   - External service (notification actor) failing
   - Check health endpoint for circuit breaker status
   - Will auto-recover when service is healthy

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](../../LICENSE) for details.