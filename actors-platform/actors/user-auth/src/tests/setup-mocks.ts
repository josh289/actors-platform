// Mock implementations for testing libraries

// Mock @testing-library/react
export const render = () => ({ container: { firstChild: null } });
export const screen = {
  getByText: () => ({}),
  getByLabelText: () => ({}),
  getByRole: () => ({}),
  getByTestId: () => ({}),
  queryByText: () => null,
};
export const fireEvent = {
  click: () => {},
  change: () => {},
  keyDown: () => {},
};
export const waitFor = async (fn: Function) => fn();

// Mock @actors-platform/sdk/testing
export function createTestContext() {
  return {
    actorId: 'test-actor',
    config: {
      name: 'test-actor',
      domain: 'test',
      version: '1.0.0',
    },
    runtime: {
      loadState: vi.fn().mockResolvedValue({}),
      saveState: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      ask: vi.fn().mockResolvedValue({ success: true }),
      tell: vi.fn().mockResolvedValue({ success: true }),
    },
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  };
}

// Re-export vitest
export { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';