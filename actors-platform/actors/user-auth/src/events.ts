// Event definitions following Actor Definition Guide specification

// Commands (VERB_NOUN pattern)
export enum AuthCommands {
  SEND_MAGIC_LINK = 'SEND_MAGIC_LINK',
  VERIFY_MAGIC_LINK = 'VERIFY_MAGIC_LINK',  // Fixed: was VERIFY_TOKEN
  CREATE_SESSION = 'CREATE_SESSION',
  UPDATE_PROFILE = 'UPDATE_PROFILE',
  ASSIGN_ROLE = 'ASSIGN_ROLE',
  REVOKE_SESSION = 'REVOKE_SESSION',
  DELETE_USER = 'DELETE_USER',
  LOCK_ACCOUNT = 'LOCK_ACCOUNT',
}

// Queries (GET_NOUN pattern)
export enum AuthQueries {
  GET_USER = 'GET_USER',
  GET_SESSION = 'GET_SESSION',           // Fixed: was VERIFY_SESSION
  GET_PERMISSION = 'GET_PERMISSION',     // Fixed: was CHECK_PERMISSION
  GET_SESSIONS = 'GET_SESSIONS',         // Fixed: was LIST_SESSIONS
  GET_ROLES = 'GET_ROLES',
  GET_SECURITY_EVENTS = 'GET_SECURITY_EVENTS',
}

// Notifications (NOUN_VERB_PAST pattern)
export enum AuthNotifications {
  USER_REGISTERED = 'USER_REGISTERED',
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_REVOKED = 'SESSION_REVOKED',
  PROFILE_UPDATED = 'PROFILE_UPDATED',
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  USER_DELETED = 'USER_DELETED',
  MAGIC_LINK_SENT = 'MAGIC_LINK_SENT',
}

// Event payload types
export interface SendMagicLinkPayload {
  email: string;
  redirectUrl?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface VerifyMagicLinkPayload {
  token: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateSessionPayload {
  userId: string;
  device: {
    userAgent: string;
    ipAddress: string;
  };
}

export interface UpdateProfilePayload {
  userId: string;
  updates: {
    name?: string;
    avatar?: string;
    bio?: string;
  };
}

export interface AssignRolePayload {
  userId: string;
  roleId: string;
  grantedBy: string;
  expiresAt?: Date;
}

export interface RevokeSessionPayload {
  sessionId: string;
}

export interface DeleteUserPayload {
  userId: string;
}

export interface LockAccountPayload {
  userId: string;
  reason: string;
  duration?: number;
}

// Query payloads
export interface GetUserPayload {
  userId: string;
}

export interface GetSessionPayload {
  token: string;
}

export interface GetPermissionPayload {
  userId: string;
  permission: string;
}

export interface GetSessionsPayload {
  userId: string;
}

export interface GetRolesPayload {
  userId: string;
}

export interface GetSecurityEventsPayload {
  userId?: string;
  limit?: number;
}

// Command union type
export type AuthCommand = 
  | { type: AuthCommands.SEND_MAGIC_LINK; payload: SendMagicLinkPayload }
  | { type: AuthCommands.VERIFY_MAGIC_LINK; payload: VerifyMagicLinkPayload }
  | { type: AuthCommands.CREATE_SESSION; payload: CreateSessionPayload }
  | { type: AuthCommands.UPDATE_PROFILE; payload: UpdateProfilePayload }
  | { type: AuthCommands.ASSIGN_ROLE; payload: AssignRolePayload }
  | { type: AuthCommands.REVOKE_SESSION; payload: RevokeSessionPayload }
  | { type: AuthCommands.DELETE_USER; payload: DeleteUserPayload }
  | { type: AuthCommands.LOCK_ACCOUNT; payload: LockAccountPayload };

// Query union type
export type AuthQuery =
  | { type: AuthQueries.GET_USER; payload: GetUserPayload }
  | { type: AuthQueries.GET_SESSION; payload: GetSessionPayload }
  | { type: AuthQueries.GET_PERMISSION; payload: GetPermissionPayload }
  | { type: AuthQueries.GET_SESSIONS; payload: GetSessionsPayload }
  | { type: AuthQueries.GET_ROLES; payload: GetRolesPayload }
  | { type: AuthQueries.GET_SECURITY_EVENTS; payload: GetSecurityEventsPayload };

// Notification payloads
export interface UserRegisteredPayload {
  userId: string;
  email: string;
  method: 'magic_link' | 'oauth' | 'password';
}

export interface SessionCreatedPayload {
  userId: string;
  sessionId: string;
  device?: {
    userAgent: string;
    ipAddress: string;
  };
}

export interface SessionRevokedPayload {
  userId: string;
  sessionId: string;
}

export interface ProfileUpdatedPayload {
  userId: string;
  changes: string[];
}

export interface RoleAssignedPayload {
  userId: string;
  roleId: string;
  grantedBy: string;
}

export interface UserDeletedPayload {
  userId: string;
}

export interface MagicLinkSentPayload {
  email: string;
}