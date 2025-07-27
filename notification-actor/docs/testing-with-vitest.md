# Testing Strategy with Vitest

This document outlines the testing approach for the notification actor using Vitest instead of Jest.

## Why Vitest?

- **Faster**: Native ESM support and faster test execution
- **Vite Integration**: Better integration with modern build tools
- **TypeScript**: First-class TypeScript support
- **Jest Compatible**: Most Jest APIs work with minimal changes
- **Better DX**: Improved developer experience with UI mode

## Configuration

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      thresholds: {
        global: {
          branches: 88,
          functions: 95,
          lines: 91,
          statements: 92,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

## Test Commands

```bash
# Run all tests
npm test

# Watch mode during development
npm run test:watch

# Run specific test suites
npm run test:unit
npm run test:integration

# Interactive UI mode
npm run test:ui

# Coverage report
npm test -- --coverage
```

## Migration from Jest

### Key Changes

1. **Import statements**:
```typescript
// Before (Jest)
import { jest } from '@jest/globals';

// After (Vitest)
import { vi } from 'vitest';
```

2. **Mock functions**:
```typescript
// Before (Jest)
jest.fn()
jest.mock()
jest.clearAllMocks()

// After (Vitest)
vi.fn()
vi.mock()
vi.clearAllMocks()
```

3. **Test imports**:
```typescript
// Before (Jest) - often global
describe, it, expect, beforeEach

// After (Vitest) - explicit imports or globals config
import { describe, it, expect, beforeEach } from 'vitest';
```

## Example Test Files

### Service Test Example

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailService } from '../../../services/EmailService';
import * as sgMail from '@sendgrid/mail';

vi.mock('@sendgrid/mail');

describe('EmailService', () => {
  let emailService: EmailService;
  const mockSgMail = sgMail as any;

  beforeEach(() => {
    vi.clearAllMocks();
    emailService = new EmailService({
      provider: 'sendgrid',
      apiKey: 'test-api-key',
      fromEmail: 'test@example.com',
      fromName: 'Test Sender',
    });
  });

  it('should send email successfully', async () => {
    mockSgMail.send.mockResolvedValue([{ statusCode: 202 }]);

    const result = await emailService.send({
      to: 'recipient@example.com',
      subject: 'Hello {{name}}',
      html: '<p>Welcome {{name}}!</p>',
      data: { name: 'John' },
      messageId: 'msg_123',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg_123');
  });
});
```

### Actor Test Example

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationActor } from '../../../actor/NotificationActor';

vi.mock('../../../services/EmailService');
vi.mock('../../../services/SMSService');
vi.mock('../../../services/PushService');

describe('NotificationActor', () => {
  let actor: NotificationActor;
  let mockContext: ActorContext;

  beforeEach(() => {
    mockContext = {
      actorId: 'notification-test',
      config: {},
      ask: vi.fn(),
      tell: vi.fn(),
      publish: vi.fn(),
    };

    actor = new NotificationActor(mockContext);
  });

  it('should handle SEND_EMAIL event', async () => {
    const result = await actor.handleEvent({
      type: 'SEND_EMAIL',
      payload: {
        to: 'user@example.com',
        template: 'welcome',
        data: { name: 'John' },
      },
    });

    expect(result.success).toBe(true);
  });
});
```

## Advanced Vitest Features

### 1. Snapshot Testing

```typescript
import { expect, it } from 'vitest';

it('should match email template snapshot', () => {
  const compiled = emailService.compileTemplate(template, data);
  expect(compiled).toMatchSnapshot();
});
```

### 2. Mocking with Factory Functions

```typescript
vi.mock('../services/EmailService', () => ({
  EmailService: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ success: true }),
    validateEmailAddress: vi.fn().mockReturnValue(true),
  })),
}));
```

### 3. Testing Timers

```typescript
import { vi } from 'vitest';

it('should handle quiet hours correctly', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-01 23:00:00'));
  
  const isQuiet = preferencesService.isInQuietHours(preferences);
  expect(isQuiet).toBe(true);
  
  vi.useRealTimers();
});
```

### 4. Testing Async Code

```typescript
it('should handle circuit breaker timeout', async () => {
  const slowFunction = vi.fn().mockImplementation(() => 
    new Promise(resolve => setTimeout(resolve, 10000))
  );

  await expect(
    circuitBreaker.execute(slowFunction)
  ).rejects.toThrow('Operation timed out');
});
```

### 5. Component Testing with jsdom

```typescript
/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { NotificationCenter } from '../components/NotificationCenter';

it('should render notification center', () => {
  render(<NotificationCenter userId="123" />);
  expect(screen.getByText('Notifications')).toBeInTheDocument();
});
```

## Performance Testing

Vitest supports performance benchmarks:

```typescript
import { bench, describe } from 'vitest';

describe('EmailService Performance', () => {
  bench('template compilation', () => {
    emailService.compileTemplate(complexTemplate, largeDataSet);
  });

  bench('batch email sending', async () => {
    await emailService.sendBatch(hundredEmails);
  });
});
```

## Integration with Coverage

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8', // or 'c8'
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/tests/',
        '**/*.d.ts',
      ],
      thresholds: {
        global: {
          branches: 88,
          functions: 95,
          lines: 91,
          statements: 92,
        },
      },
    },
  },
});
```

## CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/coverage-final.json
```

## Best Practices

1. **Use `vi.mocked()` for better TypeScript support**:
```typescript
const mockService = vi.mocked(EmailService);
```

2. **Clear mocks between tests**:
```typescript
beforeEach(() => {
  vi.clearAllMocks();
});
```

3. **Use test-specific environments**:
```typescript
/**
 * @vitest-environment jsdom
 */
```

4. **Leverage Vitest UI for debugging**:
```bash
npm run test:ui
```

5. **Use concurrent tests when possible**:
```typescript
describe.concurrent('Parallel tests', () => {
  it.concurrent('test 1', async () => {});
  it.concurrent('test 2', async () => {});
});
```

## Debugging Tests

### VSCode Integration

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest",
  "program": "${workspaceRoot}/node_modules/vitest/vitest.mjs",
  "args": ["--run", "${relativeFile}"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### Browser Debugging

```bash
# Run with browser debugging
npx vitest --inspect-brk

# Open Chrome DevTools
# chrome://inspect
```

This migration to Vitest provides a modern, fast testing experience while maintaining compatibility with existing Jest-style tests.