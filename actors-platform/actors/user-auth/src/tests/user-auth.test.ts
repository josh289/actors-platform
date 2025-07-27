import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthActor } from '../auth-actor';
import { AuthCommands, AuthQueries, AuthNotifications } from '../events';
import { createTestContext } from '@actors-platform/sdk/testing';

describe('AuthActor - Updated Tests', () => {
  let actor: AuthActor;
  let context: any;

  beforeEach(async () => {
    context = createTestContext();
    
    // Mock the runtime publish for notifications
    context.runtime.publish = vi.fn().mockResolvedValue(undefined);
    context.runtime.tell = vi.fn().mockResolvedValue(undefined);
    
    actor = new AuthActor(context);
    await actor.initialize();
  });

  afterEach(async () => {
    await actor.shutdown();
    vi.clearAllMocks();
  });

  describe('SEND_MAGIC_LINK', () => {
    it('should send magic link for valid email', async () => {
      const email = 'test@example.com';

      const result = await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { email },
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('message');
      expect(result.data.message).toContain('Magic link sent');
      
      // Verify notification was sent
      expect(context.runtime.tell).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          type: 'SEND_EMAIL',
          payload: expect.objectContaining({
            recipientEmail: email,
            template: 'magic_link',
          }),
        })
      );
    });

    it('should rate limit magic link requests', async () => {
      const email = 'test@example.com';
      
      // Send 3 requests (the limit)
      for (let i = 0; i < 3; i++) {
        await actor.handle({
          type: AuthCommands.SEND_MAGIC_LINK,
          payload: { email },
        });
      }

      // 4th request should be rate limited
      const result = await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { email },
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Too many attempts');
    });

    it('should validate email format', async () => {
      const result = await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { email: 'invalid-email' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid email');
    });
  });

  describe('VERIFY_MAGIC_LINK', () => {
    it('should verify valid token and create session', async () => {
      const email = 'test@example.com';
      
      // First send magic link
      const sendResult = await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { email },
      });
      
      expect(sendResult.success).toBe(true);
      
      // Get token from state
      const state = (actor as any).state;
      const token = Array.from(state.verificationTokens.keys())[0];

      // Verify the token
      const result = await actor.handle({
        type: AuthCommands.VERIFY_MAGIC_LINK,
        payload: { token, email },
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('user');
      expect(result.data).toHaveProperty('session');
      expect(result.data.user.email).toBe(email);
      
      // Token should be deleted after use
      expect(state.verificationTokens.has(token)).toBe(false);
      
      // Should publish USER_REGISTERED for new user
      expect(context.runtime.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AuthNotifications.USER_REGISTERED,
          payload: expect.objectContaining({
            email,
            method: 'magic_link',
          }),
        })
      );
    });

    it('should reject expired token', async () => {
      const email = 'test@example.com';
      const token = 'expired-token-that-is-32-chars-ok';
      
      // Add expired token directly to state
      const state = (actor as any).state;
      state.verificationTokens.set(token, {
        identifier: email,
        token,
        expires: new Date(Date.now() - 1000), // Expired
      });

      const result = await actor.handle({
        type: AuthCommands.VERIFY_MAGIC_LINK,
        payload: { token, email },
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Token has expired');
    });

    it('should handle existing user login', async () => {
      const email = 'existing@example.com';
      
      // Create user first
      const sendResult = await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { email },
      });
      
      const state = (actor as any).state;
      const token1 = Array.from(state.verificationTokens.keys())[0];
      
      await actor.handle({
        type: AuthCommands.VERIFY_MAGIC_LINK,
        payload: { token: token1, email },
      });
      
      // Send another magic link for existing user
      await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { email },
      });
      
      const token2 = Array.from(state.verificationTokens.keys())[0];
      
      const result = await actor.handle({
        type: AuthCommands.VERIFY_MAGIC_LINK,
        payload: { token: token2, email },
      });

      expect(result.success).toBe(true);
      
      // Should publish SESSION_CREATED, not USER_REGISTERED
      const sessionCreatedCall = vi.mocked(context.runtime.publish).mock.calls.find(
        call => call[0].type === AuthNotifications.SESSION_CREATED
      );
      expect(sessionCreatedCall).toBeDefined();
    });
  });

  describe('GET_SESSION', () => {
    it('should verify valid session', async () => {
      const email = 'test@example.com';
      
      // Create user and session
      await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { email },
      });
      
      const state = (actor as any).state;
      const token = Array.from(state.verificationTokens.keys())[0];
      
      const loginResult = await actor.handle({
        type: AuthCommands.VERIFY_MAGIC_LINK,
        payload: { token, email },
      });
      
      const sessionToken = loginResult.data.session.token;

      const result = await actor.query({
        type: AuthQueries.GET_SESSION,
        payload: { token: sessionToken },
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.user).toBeDefined();
      expect(result.data.user.id).toBe(loginResult.data.user.id);
      expect(result.data.session).toBeDefined();
      expect(result.data.session.id).toBeDefined();
    });

    it('should reject expired session', async () => {
      const token = 'expired-jwt';
      
      // Add expired session directly to state
      const state = (actor as any).state;
      state.sessions.set(token, {
        id: 'session-123',
        userId: 'user-123',
        token,
        ipAddress: '127.0.0.1',
        userAgent: 'Test',
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() - 1000), // Expired
        createdAt: new Date(),
      });

      const result = await actor.query({
        type: AuthQueries.GET_SESSION,
        payload: { token },
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe('GET_PERMISSION', () => {
    it('should check user permissions correctly', async () => {
      // Create user with role
      const email = 'test@example.com';
      
      await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { email },
      });
      
      const state = (actor as any).state;
      const token = Array.from(state.verificationTokens.keys())[0];
      
      const loginResult = await actor.handle({
        type: AuthCommands.VERIFY_MAGIC_LINK,
        payload: { token, email },
      });
      
      const userId = loginResult.data.user.id;

      // User role has these permissions by default
      const result = await actor.query({
        type: AuthQueries.GET_PERMISSION,
        payload: { userId, permission: 'read:own_profile' },
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    it('should deny missing permissions', async () => {
      const email = 'test@example.com';
      
      await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { email },
      });
      
      const state = (actor as any).state;
      const token = Array.from(state.verificationTokens.keys())[0];
      
      const loginResult = await actor.handle({
        type: AuthCommands.VERIFY_MAGIC_LINK,
        payload: { token, email },
      });
      
      const userId = loginResult.data.user.id;

      const result = await actor.query({
        type: AuthQueries.GET_PERMISSION,
        payload: { userId, permission: 'admin:users' },
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });

    it('should honor wildcard permissions', async () => {
      const state = (actor as any).state;
      
      // Create admin user with wildcard permissions
      const adminId = 'admin-123';
      state.users.set(adminId, {
        id: adminId,
        email: 'admin@example.com',
        emailVerified: new Date(),
        name: 'Admin User',
        avatar: null,
        bio: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      
      // Create admin role
      const adminRoleId = 'role-admin';
      state.roles.set(adminRoleId, {
        id: adminRoleId,
        name: 'admin',
        description: 'Administrator',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      // Assign admin role
      state.userRoles.set(adminId, [{
        userId: adminId,
        roleId: adminRoleId,
        grantedBy: null,
        expiresAt: null,
        createdAt: new Date(),
      }]);
      
      // Add wildcard permission to admin role
      state.rolePermissions.set(adminRoleId, ['perm-wildcard']);
      
      state.permissions.set('perm-wildcard', {
        id: 'perm-wildcard',
        name: '*',
        resource: '*',
        action: '*',
        description: 'All permissions',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await actor.query({
        type: AuthQueries.GET_PERMISSION,
        payload: { userId: adminId, permission: 'any:permission' },
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });
  });

  describe('UPDATE_PROFILE', () => {
    it('should update user profile', async () => {
      // Create user first
      const email = 'test@example.com';
      
      await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { email },
      });
      
      const state = (actor as any).state;
      const token = Array.from(state.verificationTokens.keys())[0];
      
      const loginResult = await actor.handle({
        type: AuthCommands.VERIFY_MAGIC_LINK,
        payload: { token, email },
      });
      
      const userId = loginResult.data.user.id;
      
      const updates = {
        name: 'John Doe',
        bio: 'Software Developer',
      };

      const result = await actor.handle({
        type: AuthCommands.UPDATE_PROFILE,
        payload: { userId, updates },
      });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe(updates.name);
      expect(result.data.bio).toBe(updates.bio);
    });

    it('should validate profile updates', async () => {
      // Create a user first
      const email = 'test@example.com';
      
      await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { email },
      });
      
      const state = (actor as any).state;
      const token = Array.from(state.verificationTokens.keys())[0];
      
      const loginResult = await actor.handle({
        type: AuthCommands.VERIFY_MAGIC_LINK,
        payload: { token, email },
      });
      
      const userId = loginResult.data.user.id;
      
      const result = await actor.handle({
        type: AuthCommands.UPDATE_PROFILE,
        payload: {
          userId,
          updates: {
            name: '', // Empty name should fail
          },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Name cannot be empty');
    });
  });

  describe('ASSIGN_ROLE', () => {
    it('should assign role to user', async () => {
      // Create user
      const email = 'test@example.com';
      
      await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { email },
      });
      
      const state = (actor as any).state;
      const token = Array.from(state.verificationTokens.keys())[0];
      
      const loginResult = await actor.handle({
        type: AuthCommands.VERIFY_MAGIC_LINK,
        payload: { token, email },
      });
      
      const userId = loginResult.data.user.id;
      
      // Create admin role
      const adminRoleId = 'role-admin';
      state.roles.set(adminRoleId, {
        id: adminRoleId,
        name: 'admin',
        description: 'Administrator',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await actor.handle({
        type: AuthCommands.ASSIGN_ROLE,
        payload: { 
          userId, 
          roleId: adminRoleId, 
          grantedBy: 'admin-user' 
        },
      });

      expect(result.success).toBe(true);
      
      // Check role was assigned
      const userRoles = state.userRoles.get(userId);
      expect(userRoles).toHaveLength(2); // user role + admin role
      expect(userRoles.some((ur: any) => ur.roleId === adminRoleId)).toBe(true);
    });

    it('should assign role with expiration', async () => {
      // Create user
      const email = 'test@example.com';
      
      await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { email },
      });
      
      const state = (actor as any).state;
      const token = Array.from(state.verificationTokens.keys())[0];
      
      const loginResult = await actor.handle({
        type: AuthCommands.VERIFY_MAGIC_LINK,
        payload: { token, email },
      });
      
      const userId = loginResult.data.user.id;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      
      // Create a temporary role
      const tempRoleId = 'role-temp';
      state.roles.set(tempRoleId, {
        id: tempRoleId,
        name: 'temporary',
        description: 'Temporary role',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await actor.handle({
        type: AuthCommands.ASSIGN_ROLE,
        payload: { 
          userId, 
          roleId: tempRoleId, 
          grantedBy: 'admin-user', 
          expiresAt 
        },
      });

      expect(result.success).toBe(true);
      
      const userRoles = state.userRoles.get(userId);
      const tempRole = userRoles.find((ur: any) => ur.roleId === tempRoleId);
      expect(tempRole.expiresAt).toEqual(expiresAt);
    });
  });

  describe('Security Features', () => {
    it('should track security events', async () => {
      const email = 'test@example.com';
      const token = 'invalid-token-thats-32-chars-long';

      await actor.handle({
        type: AuthCommands.VERIFY_MAGIC_LINK,
        payload: { token, email },
      });

      const state = (actor as any).state;
      const securityEvent = state.securityEvents.find(
        (e: any) => e.type === 'invalid_token_attempt'
      );
      
      expect(securityEvent).toBeDefined();
      expect(securityEvent.severity).toBe('medium');
      expect(securityEvent.details.email).toBe(email);
    });

    it('should track login attempts', async () => {
      const email = 'test@example.com';
      const state = (actor as any).state;

      await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { 
          email, 
          ipAddress: '192.168.1.1', 
          userAgent: 'Test Browser' 
        },
      });

      const loginAttempt = state.loginAttempts.find(
        (a: any) => a.email === email
      );
      
      expect(loginAttempt).toBeDefined();
      expect(loginAttempt.ipAddress).toBe('192.168.1.1');
      expect(loginAttempt.userAgent).toBe('Test Browser');
      expect(loginAttempt.success).toBe(false);
      expect(loginAttempt.reason).toBe('magic_link_sent');
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

  describe('Rate Limiting', () => {
    it('should enforce rate limits across different IPs', async () => {
      const email = 'ratelimit@example.com';
      
      // Make 3 requests from different IPs (should all succeed)
      for (let i = 0; i < 3; i++) {
        const result = await actor.handle({
          type: AuthCommands.SEND_MAGIC_LINK,
          payload: { 
            email, 
            ipAddress: `192.168.1.${i + 1}` 
          },
        });
        expect(result.success).toBe(true);
      }
      
      // 4th request should fail regardless of IP
      const result = await actor.handle({
        type: AuthCommands.SEND_MAGIC_LINK,
        payload: { 
          email, 
          ipAddress: '10.0.0.1' 
        },
      });
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Too many attempts');
    });
  });
});