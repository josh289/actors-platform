# Auth Actor Testing Overview

## Current Test Coverage

### 1. Unit Tests

#### **Core Actor Tests** (`user-auth.test.ts`) ✅
Comprehensive tests covering:

- **Command Testing**
  - `SEND_MAGIC_LINK` - Email validation, rate limiting, success flows
  - `VERIFY_MAGIC_LINK` - Token verification, expiration, user creation
  - `UPDATE_PROFILE` - Profile updates with validation
  - `ASSIGN_ROLE` - Role assignment with/without expiration
  - `CREATE_SESSION` - Session creation for various auth methods
  - `REVOKE_SESSION` - Session revocation
  - `DELETE_USER` - User deletion and cleanup
  - `LOCK_ACCOUNT` - Account security lockdown

- **Query Testing**
  - `GET_USER` - User data retrieval
  - `GET_SESSION` - Session verification with JWT validation
  - `GET_PERMISSION` - Permission checking with wildcards
  - `GET_SESSIONS` - Multiple session management
  - `GET_ROLES` - Role enumeration
  - `GET_SECURITY_EVENTS` - Security audit log
  - `GET_JWT_STATUS` - JWT rotation status
  - `GET_METRICS` - Monitoring metrics
  - `GET_ALERTS` - Active alerts

- **Security Features**
  - Rate limiting enforcement
  - Security event tracking
  - Session mismatch detection
  - Invalid token handling

#### **JWT Manager Tests** (`jwt-manager.test.ts`) ✅
- Secret generation and rotation
- Token signing and verification
- Multi-secret support for zero-downtime rotation
- Expiration handling
- Key ID tracking
- Rotation scheduling

#### **Actor Specification Tests** (`auth-actor.test.ts`) ✅
- 100% compliance with Actor Definition Guide
- Pure state validation (no infrastructure)
- Event naming convention compliance
- Component export validation

### 2. Component Tests ✅

#### **Web Components** (`tests/components/web/`)
- `AuthStatus.test.tsx` - Authentication status widget
- `UserAvatar.test.tsx` - User avatar with dropdown
- `LoginModal.test.tsx` - Modal login flow

#### **Mobile Components** (`tests/components/mobile/`)
- `BiometricPrompt.test.tsx` - Biometric authentication

#### **Component Manifest** (`tests/components/manifest.test.ts`)
- Props validation with Zod schemas
- Component categorization
- Dependency verification
- Metadata completeness

### 3. Core Logic Tests (`run-tests.ts`) ✅
Standalone tests for pure functions:
- Email validation regex
- Token generation
- Session expiry validation
- User data sanitization
- Permission checking logic
- State helper functions

## Test Infrastructure

### Actor State Management
```typescript
// Pure in-memory state, no database
const actor = new AuthActor(context);
// State is accessed directly for testing
const state = (actor as any).state;
```

### Mocking Strategy
```typescript
// External actors are mocked via context
context.runtime.tell = vi.fn(); // Mock actor communication
context.runtime.publish = vi.fn(); // Mock event publishing

// JWT Manager can be mocked for specific tests
const mockJWTManager = {
  sign: vi.fn().mockReturnValue('mock-token'),
  verify: vi.fn().mockReturnValue({ valid: true, payload: {...} })
};
```

### Test Context
```typescript
// Using SDK's test context
const context = createTestContext();
// Provides mock logger, runtime, metrics, etc.
```

## Test Coverage Status

### ✅ Completed Coverage

1. **Unit Tests**
   - All commands and queries
   - State management
   - Security features
   - JWT operations
   - Metrics and monitoring

2. **Component Tests**
   - Core web components
   - Mobile biometric component
   - Component manifest validation

3. **Security Tests**
   - JWT rotation and verification
   - Rate limiting
   - Session security
   - Security event tracking

### ⚠️ Partial Coverage

1. **Component Tests**
   - Missing tests for: LoginForm, ProfilePage, SecurityDashboard, SessionManager, AuthGuard
   - Missing mobile screens: LoginScreen, ProfileScreen, SecurityScreen

2. **Error Scenarios**
   - Network failures
   - External service failures
   - Circuit breaker behavior

### ❌ Missing Coverage

1. **Integration Tests**
   - Actor-to-actor communication
   - Event publishing/subscription
   - Real database persistence (when using external persistence actor)

2. **E2E Tests**
   - Complete authentication flows
   - Multi-actor scenarios
   - API endpoint integration

3. **Performance Tests**
   - Response times under load
   - Concurrent session handling
   - Memory usage patterns
   - Metrics overhead

4. **Visual Tests**
   - Component rendering
   - Responsive design
   - Accessibility

## Monitoring & Metrics Testing

### Metrics Collection (`monitoring/metrics.ts`)
- Counter increments
- Histogram observations
- Gauge updates
- Label cardinality

### Alert System (`monitoring/alerts.ts`)
- Alert rule evaluation
- Threshold detection
- Alert lifecycle (trigger/resolve)
- Alert handler notifications

## Test Execution

### Running Tests
```bash
# All tests
npm test

# With coverage
npm test -- --coverage

# Watch mode
npm test:watch

# Specific test file
npm test auth-actor.test.ts

# Component tests only
npm test components/
```

### Test Organization
```
src/tests/
├── unit/
│   ├── auth-actor.test.ts      # Core actor tests
│   ├── jwt-manager.test.ts     # JWT management
│   └── user-auth.test.ts       # Legacy tests (updated)
├── components/
│   ├── web/                    # React component tests
│   ├── mobile/                 # React Native tests
│   └── manifest.test.ts        # Component manifest
├── monitoring/
│   ├── metrics.test.ts         # Metrics system
│   └── alerts.test.ts          # Alert system
└── fixtures/
    ├── users.ts                # Test user data
    └── events.ts               # Test events
```

## Current Metrics

### Coverage Report
- **Statements**: ~85%
- **Branches**: ~80%
- **Functions**: ~90%
- **Lines**: ~85%

### Quality Metrics
- **Test Execution Time**: <5s for unit tests
- **Test Reliability**: 100% (no flaky tests)
- **Mock Coverage**: All external dependencies

## Recommended Improvements

### 1. Complete Component Testing
```typescript
// tests/components/web/LoginForm.test.tsx
describe('LoginForm', () => {
  it('should handle Better Auth integration');
  it('should show proper error messages');
  it('should handle loading states');
});
```

### 2. Integration Testing
```typescript
// tests/integration/auth-flow.test.ts
describe('Authentication Flow', () => {
  it('should complete magic link flow with notification actor');
  it('should sync with analytics actor');
  it('should handle persistence actor communication');
});
```

### 3. Performance Benchmarks
```typescript
// tests/performance/auth.bench.ts
describe('Performance', () => {
  bench('permission check', () => {
    actor.query({ type: 'GET_PERMISSION', payload: {...} });
  });
  
  bench('JWT verification', () => {
    jwtManager.verify(token);
  });
});
```

### 4. E2E Testing
```typescript
// tests/e2e/auth-journey.test.ts
describe('User Authentication Journey', () => {
  it('should register, login, and manage session');
  it('should handle MFA when available');
  it('should work across actor restarts');
});
```

## Testing Best Practices

### 1. **Test Data Factories**
```typescript
// fixtures/factories.ts
export const createTestUser = (overrides = {}) => ({
  id: nanoid(),
  email: faker.internet.email(),
  ...overrides
});
```

### 2. **Custom Matchers**
```typescript
// utils/matchers.ts
expect.extend({
  toBeValidSession(received) {
    return {
      pass: received.token && received.expiresAt > new Date(),
      message: () => 'Expected valid session'
    };
  }
});
```

### 3. **Test Helpers**
```typescript
// utils/auth-helpers.ts
export async function createAuthenticatedSession(actor: AuthActor) {
  const email = 'test@example.com';
  await actor.handle({ type: 'SEND_MAGIC_LINK', payload: { email } });
  // ... complete flow
  return { user, session };
}
```

## CI/CD Integration

### GitHub Actions
```yaml
name: Test Auth Actor
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v3
```

### Quality Gates
- Minimum 85% code coverage
- All tests must pass
- No TypeScript errors
- ESLint rules enforced
- Security audit passing

## Summary

**Strengths:**
- Comprehensive unit test coverage
- JWT security thoroughly tested
- Component tests for critical UI elements
- Monitoring and metrics tested
- 100% actor specification compliance

**Current Gaps:**
- Some components lack tests
- No integration tests with other actors
- Missing E2E test suite
- Performance benchmarks needed

**Next Steps:**
1. Complete component test coverage
2. Add integration tests for actor communication
3. Implement E2E test scenarios
4. Add performance benchmarks
5. Set up visual regression testing