import { z } from 'zod';

// Pure domain state schemas (no infrastructure)
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  emailVerified: z.date().nullable(),
  name: z.string().nullable(),
  avatar: z.string().nullable(),
  bio: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

export const SessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  token: z.string(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  lastActivity: z.date(),
  expiresAt: z.date(),
  createdAt: z.date(),
});

export const RoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PermissionSchema = z.object({
  id: z.string(),
  name: z.string(),
  resource: z.string(),
  action: z.string(),
  description: z.string().nullable(),
  createdAt: z.date(),
});

export const UserRoleSchema = z.object({
  userId: z.string(),
  roleId: z.string(),
  grantedBy: z.string().nullable(),
  expiresAt: z.date().nullable(),
  createdAt: z.date(),
});

export const VerificationTokenSchema = z.object({
  identifier: z.string(),
  token: z.string(),
  expires: z.date(),
});

export const LoginAttemptSchema = z.object({
  id: z.string(),
  email: z.string(),
  ipAddress: z.string(),
  userAgent: z.string().nullable(),
  success: z.boolean(),
  reason: z.string().nullable(),
  createdAt: z.date(),
});

export const SecurityEventSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  type: z.string(),
  severity: z.string(),
  details: z.record(z.any()),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.date(),
});

// Type exports
export type User = z.infer<typeof UserSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Permission = z.infer<typeof PermissionSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export type VerificationToken = z.infer<typeof VerificationTokenSchema>;
export type LoginAttempt = z.infer<typeof LoginAttemptSchema>;
export type SecurityEvent = z.infer<typeof SecurityEventSchema>;

// Pure domain state (no infrastructure)
export interface AuthState {
  // Core domain entities
  users: Map<string, User>;
  sessions: Map<string, Session>;
  roles: Map<string, Role>;
  permissions: Map<string, Permission>;
  userRoles: Map<string, UserRole[]>; // Indexed by userId
  rolePermissions: Map<string, string[]>; // roleId -> permissionIds
  
  // Temporary state
  verificationTokens: Map<string, VerificationToken>;
  loginAttempts: LoginAttempt[];
  
  // Audit state
  securityEvents: SecurityEvent[];
  
  // Configuration (domain logic, not infrastructure)
  config: {
    sessionTimeout: number;
    maxLoginAttempts: number;
    lockoutDuration: number;
    tokenExpiry: number;
  };
}

// Default state factory
export function createDefaultAuthState(): AuthState {
  return {
    users: new Map(),
    sessions: new Map(),
    roles: new Map(),
    permissions: new Map(),
    userRoles: new Map(),
    rolePermissions: new Map(),
    verificationTokens: new Map(),
    loginAttempts: [],
    securityEvents: [],
    config: {
      sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
      maxLoginAttempts: 5,
      lockoutDuration: 30 * 60 * 1000, // 30 minutes
      tokenExpiry: 15 * 60 * 1000, // 15 minutes
    },
  };
}

// State validation
export const AuthStateSchema = z.object({
  users: z.map(z.string(), UserSchema),
  sessions: z.map(z.string(), SessionSchema),
  roles: z.map(z.string(), RoleSchema),
  permissions: z.map(z.string(), PermissionSchema),
  userRoles: z.map(z.string(), z.array(UserRoleSchema)),
  rolePermissions: z.map(z.string(), z.array(z.string())),
  verificationTokens: z.map(z.string(), VerificationTokenSchema),
  loginAttempts: z.array(LoginAttemptSchema),
  securityEvents: z.array(SecurityEventSchema),
  config: z.object({
    sessionTimeout: z.number(),
    maxLoginAttempts: z.number(),
    lockoutDuration: z.number(),
    tokenExpiry: z.number(),
  }),
});

// Helper functions for state management
export const AuthStateHelpers = {
  getUserByEmail(state: AuthState, email: string): User | undefined {
    return Array.from(state.users.values()).find(u => u.email === email);
  },

  getUserRoles(state: AuthState, userId: string): Role[] {
    const userRoles = state.userRoles.get(userId) || [];
    return userRoles
      .filter(ur => !ur.expiresAt || ur.expiresAt > new Date())
      .map(ur => state.roles.get(ur.roleId))
      .filter((role): role is Role => role !== undefined);
  },

  getUserPermissions(state: AuthState, userId: string): Permission[] {
    const roles = AuthStateHelpers.getUserRoles(state, userId);
    const permissionIds = new Set<string>();
    
    roles.forEach(role => {
      const rolePerms = state.rolePermissions.get(role.id) || [];
      rolePerms.forEach(permId => permissionIds.add(permId));
    });
    
    return Array.from(permissionIds)
      .map(id => state.permissions.get(id))
      .filter((perm): perm is Permission => perm !== undefined);
  },

  hasPermission(state: AuthState, userId: string, permissionName: string): boolean {
    const permissions = AuthStateHelpers.getUserPermissions(state, userId);
    return permissions.some(p => 
      p.name === permissionName || 
      p.name === '*' ||
      (p.resource === '*' && p.action === '*')
    );
  },

  getRecentLoginAttempts(state: AuthState, email: string, minutes: number): LoginAttempt[] {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    return state.loginAttempts.filter(
      attempt => attempt.email === email && attempt.createdAt > since
    );
  },

  isAccountLocked(state: AuthState, email: string): boolean {
    const recentAttempts = AuthStateHelpers.getRecentLoginAttempts(
      state, 
      email, 
      state.config.lockoutDuration / 60000
    );
    const failedAttempts = recentAttempts.filter(a => !a.success);
    return failedAttempts.length >= state.config.maxLoginAttempts;
  },

  cleanupExpiredTokens(state: AuthState): void {
    const now = new Date();
    Array.from(state.verificationTokens.entries()).forEach(([key, token]) => {
      if (token.expires < now) {
        state.verificationTokens.delete(key);
      }
    });
  },

  cleanupExpiredSessions(state: AuthState): void {
    const now = new Date();
    Array.from(state.sessions.entries()).forEach(([key, session]) => {
      if (session.expiresAt < now) {
        state.sessions.delete(key);
      }
    });
  },
};