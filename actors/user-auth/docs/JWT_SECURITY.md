# JWT Security and Secret Management

This document explains the JWT security implementation in the user-auth actor, including automatic secret rotation and key management.

## Overview

The authentication actor uses a sophisticated JWT management system that provides:
- Automatic secret rotation
- Multiple active secrets for zero-downtime rotation
- Configurable rotation intervals
- Secure token verification with multiple keys
- Audit trail for secret rotations

## Architecture

### JWTManager Class

The `JWTManager` class handles all JWT operations:

```typescript
const jwtManager = new JWTManager({
  initialSecret: process.env.JWT_SECRET,
  rotationInterval: 30 * 24 * 60 * 60 * 1000, // 30 days
  secretLifetime: 90 * 24 * 60 * 60 * 1000,   // 90 days
});
```

### Key Components

1. **Secret Storage**: Multiple secrets stored in memory with metadata
2. **Active Secret**: Current secret used for signing new tokens
3. **Valid Secrets**: All non-expired secrets used for verification
4. **Rotation Logic**: Automatic rotation based on age

## Secret Rotation Process

### Automatic Rotation

The actor checks for rotation needs every 24 hours:

```typescript
// In auth-actor.ts
setInterval(async () => {
  if (this.jwtManager.shouldRotate()) {
    const newSecret = this.jwtManager.rotate();
    // Emit event for monitoring
    await this.publish(EventBuilder.notification('JWT_SECRET_ROTATED', {
      secretId: newSecret.id,
      rotatedAt: newSecret.createdAt,
      expiresAt: newSecret.expiresAt,
    }));
  }
}, 24 * 60 * 60 * 1000);
```

### Rotation Timeline

1. **Day 0-30**: Secret A is active (signing) and valid (verification)
2. **Day 30**: Rotation occurs
   - Secret A: Valid for verification only
   - Secret B: Now active for signing and verification
3. **Day 90**: Secret A expires and is removed
4. **Day 60**: Next rotation
   - Secret B: Valid for verification only
   - Secret C: Now active

This ensures:
- Zero downtime during rotation
- 60-day overlap for token verification
- Gradual migration of active sessions

## Token Structure

### JWT Header
```json
{
  "alg": "HS256",
  "typ": "JWT",
  "kid": "jwt_secret_1234567890_abc123"  // Key ID for verification
}
```

### JWT Payload
```json
{
  "sub": "user-123",        // User ID
  "sid": "session-456",     // Session ID
  "iat": 1234567890,        // Issued at
  "exp": 1234654290,        // Expires at
  "jti": "jwt-unique-id"    // JWT ID
}
```

## Security Features

### 1. Key ID (kid) in Header
Each token includes the signing key's ID, enabling:
- Quick secret lookup during verification
- Support for multiple valid secrets
- Audit trail of which key signed each token

### 2. Session Binding
Tokens are bound to specific sessions:
```typescript
if (session.userId !== jwtPayload.sub || session.id !== jwtPayload.sid) {
  // Token/session mismatch - potential security issue
  return { valid: false };
}
```

### 3. Security Event Tracking
All JWT-related security events are logged:
- Invalid token attempts
- Session mismatches
- Expired token usage
- Successful/failed verifications

### 4. Clean Expiration
- Tokens have explicit expiration times
- Sessions are separately tracked with expiration
- Double validation ensures security

## Configuration

### Environment Variables

```bash
# Initial secret (required on first run)
JWT_SECRET=your-strong-secret-here

# Rotation interval (milliseconds)
JWT_ROTATION_INTERVAL=2592000000  # 30 days

# Secret lifetime (milliseconds)
JWT_SECRET_LIFETIME=7776000000    # 90 days
```

### Generating Strong Secrets

For production, generate secrets using:
```bash
# Using OpenSSL
openssl rand -base64 64

# Using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

## Monitoring

### JWT Status Query

The actor provides a status query for monitoring:

```typescript
const status = await actor.query({
  type: 'GET_JWT_STATUS'
});

// Returns:
{
  activeSecretId: "jwt_secret_1234567890_abc123",
  activeSecretAge: 1296000000,  // milliseconds
  nextRotation: "2024-02-01T00:00:00Z",
  totalSecrets: 2,
  expiredSecrets: 0
}
```

### Rotation Events

Monitor for `JWT_SECRET_ROTATED` events:
```typescript
actor.on('JWT_SECRET_ROTATED', (event) => {
  console.log('Secret rotated:', {
    secretId: event.payload.secretId,
    rotatedAt: event.payload.rotatedAt,
    expiresAt: event.payload.expiresAt
  });
});
```

## Best Practices

### 1. Secret Management
- Store initial secret securely (e.g., environment variable, secret manager)
- Never log or expose secrets
- Use strong, random secrets (minimum 256 bits)

### 2. Rotation Schedule
- Default 30-day rotation is recommended
- Adjust based on security requirements
- Ensure lifetime > 2x rotation interval

### 3. Monitoring
- Set up alerts for rotation failures
- Monitor JWT verification errors
- Track token usage patterns

### 4. Migration
- When updating from non-rotating system:
  1. Deploy with current secret as JWT_SECRET
  2. System will start rotation schedule
  3. Old tokens remain valid until expiration

## Testing

The JWT manager includes comprehensive tests:

```bash
npm test jwt-manager.test.ts
```

Tests cover:
- Secret generation and rotation
- Token signing and verification
- Multi-secret verification
- Expiration handling
- Edge cases and errors

## Security Considerations

### Threats Mitigated
1. **Long-term key exposure**: Regular rotation limits exposure window
2. **Key compromise**: Old keys expire automatically
3. **Token replay**: Session binding prevents token reuse
4. **Unauthorized access**: Multi-layer verification

### Recommendations
1. Use HTTPS only for token transmission
2. Implement rate limiting on verification endpoints
3. Monitor for unusual token usage patterns
4. Consider hardware security modules (HSM) for key storage in high-security environments

## Troubleshooting

### Common Issues

1. **"No active JWT secret available"**
   - Ensure JWT_SECRET is set on first run
   - Check rotation didn't fail

2. **Token verification failures after deployment**
   - Ensure secret continuity during deployment
   - Check system time synchronization

3. **High memory usage**
   - Reduce secret lifetime if many tokens
   - Implement token revocation for logout

### Debug Mode

Enable detailed logging:
```typescript
const jwtManager = new JWTManager({
  debug: true,  // Logs rotation events
  ...config
});
```