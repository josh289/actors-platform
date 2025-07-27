import { describe, it, expect } from 'vitest';
import { AuthActor } from '../auth-actor';

describe('Simple Test', () => {
  it('should create auth actor', () => {
    // Just check that the class exists
    expect(AuthActor).toBeDefined();
    expect(typeof AuthActor).toBe('function');
  });

  it('basic math works', () => {
    expect(1 + 1).toBe(2);
  });
});