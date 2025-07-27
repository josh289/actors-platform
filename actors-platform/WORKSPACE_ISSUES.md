# Workspace Issues Documentation

## Critical Issues Found

### 1. Workspace Dependency Resolution
**Problem**: The workspace uses `workspace:*` protocol but npm cannot resolve these during initial install.
- `@actors-platform/user-auth` depends on `@actors-platform/sdk` using `workspace:*`
- `@actors-platform/mcp-server` depends on `@actors-platform/sdk` using `workspace:*`
- `@actors-platform/relay` depends on `@actors-platform/sdk` using `workspace:*`

**Root Cause**: Circular dependency during initial npm install - packages depend on each other but none exist yet.

**Temporary Fix Applied**: Created install-fix.sh script that temporarily replaces `workspace:*` with file paths, runs install, then restores workspace protocol.

**Proper Fix Needed**: 
- Consider using explicit versions instead of `workspace:*`
- Or ensure SDK is built and published before other packages try to use it
- Or use a proper monorepo tool like Rush, Lerna, or pnpm workspaces

### 2. SDK Package Build Errors
**Problems**:
- Duplicate exports between different modules (CircuitBreaker, RateLimiter, ComponentCategory, etc.)
- Missing TypeScript configuration for the SDK package
- The SDK exports modules that export the same names, causing conflicts

**Errors**:
```
error TS2308: Module './patterns' has already exported a member named 'CircuitBreaker'
error TS2308: Module './patterns' has already exported a member named 'RateLimiter'
error TS2308: Module './components' has already exported a member named 'ComponentCategory'
```

### 3. Missing Test Infrastructure
**Problems**:
- Tests expect `@testing-library/react` but it's not installed
- Tests expect `@testing-library/react-native` but it's not installed
- Tests import from `@actors-platform/sdk/testing` but this export doesn't exist in SDK
- Cannot install new dependencies due to workspace protocol issues

### 4. SDK Package Structure Issues
**Problems**:
- The SDK package.json doesn't properly export the testing utilities
- Build configuration (tsup) not set up to handle multiple entry points
- TypeScript compilation errors preventing the SDK from building

### 5. Test Failures
**Current Test Results**:
- 9 test files failed
- Most failures due to missing dependencies or import errors
- 1 actual test failure: JWT Manager test timeout

## Fundamental Architecture Issues

### 1. Monorepo Setup
- Using npm workspaces but not properly configured
- Missing workspace directories (apps/, services/) referenced in package.json
- No proper build orchestration between packages

### 2. Dependency Management
- Using `workspace:*` protocol without understanding its limitations
- No clear build order defined
- No CI/CD setup to ensure packages build in correct order

### 3. Testing Strategy
- Tests written assuming dependencies exist
- No mock setup for workspace dependencies
- No integration test strategy for cross-package functionality

## Recommended Fixes

### Immediate Actions
1. Fix SDK duplicate exports by properly organizing exports
2. Add missing directories or remove them from workspace config
3. Set up proper TypeScript configuration for all packages
4. Install test dependencies at workspace root

### Short Term
1. Replace `workspace:*` with proper versioning
2. Set up build orchestration (turbo already in package.json but not used properly)
3. Create proper mock implementations for tests
4. Document the build and test process

### Long Term
1. Consider migrating to pnpm or yarn workspaces for better monorepo support
2. Set up proper CI/CD with build order
3. Implement integration tests
4. Create development documentation

## Current State
- Components are implemented but cannot be tested
- SDK JavaScript builds successfully but TypeScript declarations fail
- Workspace dependencies installed with workaround script
- Multiple TypeScript errors in SDK preventing clean build
- No clear path to run tests successfully

## Progress Made
1. Fixed duplicate export errors by removing conflicting exports
2. Created tsconfig.json for SDK package
3. Updated tsup config to handle multiple entry points
4. JavaScript/ESM builds now succeed for SDK

## Remaining SDK Build Issues
1. TypeScript errors in actor.ts (missing properties, type mismatches)
2. Unused variables throughout codebase
3. test-utilities.ts importing non-existent enhanced-actor module
4. test-utilities.ts using jest instead of vitest
5. Type incompatibilities between different SecurityEvent definitions