import { describe, it, expect } from 'vitest';
import { AuthActor } from '../auth-actor';
import { ActorContext } from '@actors-platform/sdk';

describe('Simple Init Test', () => {
  it('should create actor without error', () => {
    const context: ActorContext = {
      actorId: 'test-actor',
      config: {
        name: 'test-actor',
        domain: 'test',
        version: '1.0.0',
      },
      runtime: {
        loadState: async () => null,
        saveState: async () => {},
        publish: async () => {},
      },
      logger: console,
    };
    
    const actor = new AuthActor(context);
    expect(actor).toBeDefined();
  });
  
  it('should access config getter', () => {
    const context: ActorContext = {
      actorId: 'test-actor',
      config: {
        name: 'test-actor',
        domain: 'test',
        version: '1.0.0',
      },
      runtime: {
        loadState: async () => null,
        saveState: async () => {},
        publish: async () => {},
      },
      logger: console,
    };
    
    const actor = new AuthActor(context);
    expect(actor.config).toBeDefined();
    expect(actor.config.name).toBe('test-actor');
  });
});