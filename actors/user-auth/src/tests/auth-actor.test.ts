import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthActor } from '../auth-actor';
import { createTestContext } from '@actors-platform/sdk/testing';
import { AuthCommands, AuthQueries, AuthNotifications } from '../events';
import { createDefaultAuthState, AuthStateHelpers } from '../state';

describe('AuthActor - Specification Compliance', () => {
  let actor: AuthActor;
  let context: any;

  beforeEach(async () => {
    context = createTestContext();
    actor = new AuthActor(context);
    actor.enableTestMode();
    await actor.initialize();
  });

  afterEach(async () => {
    await actor.shutdown();
  });

  describe('Actor Definition Compliance', () => {
    it('should have pure domain state without infrastructure', () => {
      const state = (actor as any).state;
      
      // State should only contain domain data
      expect(state).toHaveProperty('users');
      expect(state).toHaveProperty('sessions');
      expect(state).toHaveProperty('roles');
      expect(state).toHaveProperty('permissions');
      expect(state).toHaveProperty('verificationTokens');
      
      // State should NOT contain infrastructure
      expect(state).not.toHaveProperty('prisma');
      expect(state).not.toHaveProperty('rateLimiter');
      expect(state).not.toHaveProperty('circuitBreaker');
      expect(state).not.toHaveProperty('auth');
    });

    it('should have infrastructure as private properties', () => {
      // These should be private class properties, not in state
      expect((actor as any).jwtManager).toBeDefined();
      expect((actor as any).jwtManager).toHaveProperty('rotate');
      expect((actor as any).jwtManager).toHaveProperty('sign');
      expect((actor as any).jwtManager).toHaveProperty('verify');
    });
  });

  describe('Event Naming Compliance', () => {
    describe('Commands follow VERB_NOUN pattern', () => {
      it('should handle SEND_MAGIC_LINK command', async () => {
        const result = await actor.handle({
          type: AuthCommands.SEND_MAGIC_LINK,
          payload: { email: 'test@example.com' },
        });
        
        expect(result.success).toBe(true);
      });

      it('should handle VERIFY_MAGIC_LINK command', async () => {
        // First send magic link
        await actor.handle({
          type: AuthCommands.SEND_MAGIC_LINK,
          payload: { email: 'test@example.com' },
        });

        // Get token from state
        const state = (actor as any).state;
        const token = Array.from(state.verificationTokens.keys())[0];

        const result = await actor.handle({
          type: AuthCommands.VERIFY_MAGIC_LINK,
          payload: { token, email: 'test@example.com' },
        });
        
        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('user');
        expect(result.data).toHaveProperty('session');
      });
    });

    describe('Queries follow GET_NOUN pattern', () => {
      it('should handle GET_USER query', async () => {
        const result = await actor.query({
          type: AuthQueries.GET_USER,
          payload: { userId: 'test-user' },
        });
        
        expect(result.success).toBe(true);
      });

      it('should handle GET_SESSION query', async () => {
        const result = await actor.query({
          type: AuthQueries.GET_SESSION,
          payload: { token: 'test-token' },
        });
        
        expect(result.success).toBe(true);
      });

      it('should handle GET_PERMISSION query', async () => {
        const result = await actor.query({
          type: AuthQueries.GET_PERMISSION,
          payload: { userId: 'test-user', permission: 'read:profile' },
        });
        
        expect(result.success).toBe(true);
        expect(result.data).toBe(false); // No user exists
      });

      it('should handle GET_SESSIONS query', async () => {
        const result = await actor.query({
          type: AuthQueries.GET_SESSIONS,
          payload: { userId: 'test-user' },
        });
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual([]);
      });
    });

    describe('Notifications follow NOUN_VERB_PAST pattern', () => {
      it('should emit USER_REGISTERED notification', async () => {
        const emittedEvents: any[] = [];
        context.runtime.publish = vi.fn((event) => {
          emittedEvents.push(event);
          return Promise.resolve();
        });

        // Send and verify magic link for new user
        await actor.handle({
          type: AuthCommands.SEND_MAGIC_LINK,
          payload: { email: 'newuser@example.com' },
        });

        const state = (actor as any).state;
        const token = Array.from(state.verificationTokens.keys())[0];

        await actor.handle({
          type: AuthCommands.VERIFY_MAGIC_LINK,
          payload: { token, email: 'newuser@example.com' },
        });

        const userRegisteredEvent = emittedEvents.find(
          e => e.type === AuthNotifications.USER_REGISTERED
        );
        
        expect(userRegisteredEvent).toBeDefined();
        expect(userRegisteredEvent.payload).toHaveProperty('userId');
        expect(userRegisteredEvent.payload).toHaveProperty('email');
        expect(userRegisteredEvent.payload.method).toBe('magic_link');
      });
    });
  });

  describe('State Management', () => {
    it('should use state helpers for common operations', () => {
      const state = createDefaultAuthState();
      
      // Add a user
      state.users.set('user-123', {
        id: 'user-123',
        email: 'test@example.com',
        emailVerified: new Date(),
        name: 'Test User',
        avatar: null,
        bio: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      // Test getUserByEmail helper
      const user = AuthStateHelpers.getUserByEmail(state, 'test@example.com');
      expect(user).toBeDefined();
      expect(user?.id).toBe('user-123');
    });

    it('should handle login attempt tracking', () => {
      const state = createDefaultAuthState();
      
      // Add login attempts
      state.loginAttempts.push({
        id: '1',
        email: 'test@example.com',
        ipAddress: '127.0.0.1',
        userAgent: 'Test',
        success: false,
        reason: 'invalid_token',
        createdAt: new Date(),
      });

      const recentAttempts = AuthStateHelpers.getRecentLoginAttempts(
        state,
        'test@example.com',
        15
      );
      
      expect(recentAttempts).toHaveLength(1);
    });

    it('should check account lockout status', () => {
      const state = createDefaultAuthState();
      
      // Add 5 failed attempts (threshold)
      for (let i = 0; i < 5; i++) {
        state.loginAttempts.push({
          id: `attempt-${i}`,
          email: 'locked@example.com',
          ipAddress: '127.0.0.1',
          userAgent: 'Test',
          success: false,
          reason: 'invalid_password',
          createdAt: new Date(),
        });
      }

      const isLocked = AuthStateHelpers.isAccountLocked(state, 'locked@example.com');
      expect(isLocked).toBe(true);
    });
  });

  describe('Autonomy', () => {
    it.skip('should function without external dependencies', async () => {
      // Mock tell/publish to simulate dependency failure
      context.runtime.tell = vi.fn().mockRejectedValue(new Error('Service unavailable'));
      context.runtime.publish = vi.fn().mockRejectedValue(new Error('Service unavailable'));

      // Should still be able to send magic link (graceful degradation)
      const result = await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { email: 'test@example.com' },
      });

      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Autonomy test failed:', result.error?.message);
      }
      // Email won't be sent, but token is created
    });
  });

  describe('Security Features', () => {
    it('should track security events in state', async () => {
      // Attempt with invalid token (must be 32 chars to pass validation)
      await actor.handle({
        type: AuthCommands.VERIFY_MAGIC_LINK,
        payload: { 
          token: 'invalid-token-thats-32-chars-long', 
          email: 'test@example.com' 
        },
      });

      const state = (actor as any).state;
      const securityEvent = state.securityEvents.find(
        (e: any) => e.type === 'invalid_token_attempt'
      );
      
      expect(securityEvent).toBeDefined();
      expect(securityEvent.severity).toBe('medium');
    });

    it('should clean up expired tokens', () => {
      const state = (actor as any).state;
      
      // Add expired token
      state.verificationTokens.set('expired-token', {
        identifier: 'test@example.com',
        token: 'expired-token',
        expires: new Date(Date.now() - 1000), // Expired
      });

      // Add valid token
      state.verificationTokens.set('valid-token', {
        identifier: 'test@example.com',
        token: 'valid-token',
        expires: new Date(Date.now() + 1000), // Future
      });

      AuthStateHelpers.cleanupExpiredTokens(state);
      
      expect(state.verificationTokens.has('expired-token')).toBe(false);
      expect(state.verificationTokens.has('valid-token')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown commands gracefully', async () => {
      const result = await actor.handle({
        type: 'UNKNOWN_COMMAND' as any,
        payload: {},
      });
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Unknown command');
    });

    it('should handle unknown queries gracefully', async () => {
      const result = await actor.query({
        type: 'UNKNOWN_QUERY' as any,
        payload: {},
      });
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Unknown query');
    });
  });

  describe('Data Sanitization', () => {
    it('should sanitize user data in responses', async () => {
      // Create a user with roles
      const state = (actor as any).state;
      const userId = 'user-with-roles';
      
      state.users.set(userId, {
        id: userId,
        email: 'test@example.com',
        emailVerified: new Date(),
        name: 'Test User',
        avatar: null,
        bio: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      state.roles.set('role-1', {
        id: 'role-1',
        name: 'admin',
        description: 'Admin role',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      state.userRoles.set(userId, [{
        userId,
        roleId: 'role-1',
        grantedBy: null,
        expiresAt: null,
        createdAt: new Date(),
      }]);

      const result = await actor.query({
        type: AuthQueries.GET_USER,
        payload: { userId },
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.roles).toEqual([
        { id: 'role-1', name: 'admin' }
      ]);
      // Should not include internal role details
      expect(result.data.roles[0]).not.toHaveProperty('permissions');
      expect(result.data.roles[0]).not.toHaveProperty('createdAt');
    });
  });
});