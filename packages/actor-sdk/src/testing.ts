// Testing utilities for actors
import { ActorContext } from './types';
import { vi } from 'vitest';

export function createTestContext(): ActorContext {
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

export function createMockActor(overrides?: Partial<any>) {
  return {
    handle: vi.fn().mockResolvedValue({ success: true }),
    query: vi.fn().mockResolvedValue({ success: true }),
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    getHealth: vi.fn().mockReturnValue({ 
      status: 'healthy',
      metrics: {},
    }),
    ...overrides,
  };
}