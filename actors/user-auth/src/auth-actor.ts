import { 
  Actor, 
  ActorError,
  ActorContext, 
  ActorResult, 
  QueryResult,
  Command,
  Query,
  EventBuilder,
  ComponentExport,
} from '@actors-platform/sdk';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { 
  AuthState, 
  createDefaultAuthState, 
  AuthStateHelpers,
  AuthStateSchema,
  User,
  Session,
  VerificationToken,
} from './state';
import {
  AuthCommands,
  AuthQueries,
  AuthNotifications,
  AuthCommand,
  AuthQuery,
} from './events';
import { JWTManager } from './security/jwt-manager';
import { authComponentManifest as componentManifest } from './components/manifest';

/**
 * Authentication Actor - Using Enhanced Base Actor
 * 
 * This refactored version leverages all the built-in production features:
 * - Automatic monitoring and metrics
 * - Built-in security event tracking
 * - Rate limiting support
 * - Health checks
 * - Circuit breakers
 * - Component export management
 */
export class AuthActor extends Actor<AuthState> {
  // Infrastructure as private properties (not in state)
  private jwtManager: JWTManager;
  
  // Enhanced features - add schemas
  protected stateSchema = AuthStateSchema;
  protected configSchema = z.object({
    jwtSecret: z.string().optional(),
    jwtRotationInterval: z.number().optional(),
    jwtSecretLifetime: z.number().optional(),
    sessionTimeout: z.number().optional(),
    maxLoginAttempts: z.number().optional(),
    lockoutDuration: z.number().optional(),
    tokenExpiry: z.number().optional(),
  });
  
  constructor(context: ActorContext) {
    super(context);
    
    // Initialize JWT manager with proper secret rotation
    this.jwtManager = new JWTManager({
      initialSecret: this.config.jwtSecret || process.env.JWT_SECRET || 'test-secret-for-development',
      rotationInterval: this.config.jwtRotationInterval || parseInt(process.env.JWT_ROTATION_INTERVAL || '2592000000'), // 30 days
      secretLifetime: this.config.jwtSecretLifetime || parseInt(process.env.JWT_SECRET_LIFETIME || '7776000000'), // 90 days
    });
    
    // Set up rate limiting for sensitive operations
    this.setupRateLimiting();
    
    // Register event validation schemas
    this.registerEventSchemas();
    
    // Register component exports
    this.registerComponents();
    
    // Register custom error transformers
    this.registerCustomErrorTransformers();
  }

  /**
   * Enhanced Actor method - create default state
   */
  protected async createDefaultState(): Promise<AuthState> {
    const state = createDefaultAuthState();
    
    // Apply configuration overrides
    if (this.config.sessionTimeout) {
      state.config.sessionTimeout = this.config.sessionTimeout;
    }
    if (this.config.maxLoginAttempts) {
      state.config.maxLoginAttempts = this.config.maxLoginAttempts;
    }
    if (this.config.lockoutDuration) {
      state.config.lockoutDuration = this.config.lockoutDuration;
    }
    if (this.config.tokenExpiry) {
      state.config.tokenExpiry = this.config.tokenExpiry;
    }
    
    return state;
  }

  /**
   * Enhanced Actor lifecycle hook - called after state is loaded
   */
  protected async afterStateLoad(state: AuthState): Promise<void> {
    // Initialize default roles and permissions if needed
    this.initializeDefaultRolesAndPermissions();
    
    // Log state statistics
    this.context.logger.info('Auth state loaded', {
      users: state.users.size,
      sessions: state.sessions.size,
      roles: state.roles.size,
      permissions: state.permissions.size,
    });
  }

  /**
   * Enhanced Actor lifecycle hook - called before command execution
   */
  protected async beforeCommand(command: Command): Promise<void> {
    // Log sensitive operations
    if (command.type === AuthCommands.DELETE_USER || 
        command.type === AuthCommands.LOCK_ACCOUNT) {
      this.trackSecurityEvent({
        type: 'sensitive_operation',
        severity: 'high',
        userId: command.metadata?.userId,
        details: {
          command: command.type,
          payload: command.payload,
        },
      });
    }
  }

  // Enhanced Actor handles unknown commands with AI-friendly errors automatically
  // No need to override handle() anymore!

  // Enhanced Actor handles unknown queries with AI-friendly errors automatically
  // No need to override query() anymore!

  protected async onInitialize(): Promise<void> {
    // Subscribe to external events
    this.on('billing.CUSTOMER_CREATED', async (event) => {
      // Link billing customer to user
      this.context.logger.info(`User ${event.payload.userId} linked to billing`);
    });

    // Start cleanup timer
    setInterval(() => {
      AuthStateHelpers.cleanupExpiredTokens(this.state);
      AuthStateHelpers.cleanupExpiredSessions(this.state);
      this.updateCustomMetrics();
    }, 60 * 60 * 1000); // Every hour
    
    // Start JWT rotation check timer
    setInterval(async () => {
      if (this.jwtManager.shouldRotate()) {
        const newSecret = this.jwtManager.rotate();
        this.monitoring.incrementCounter('jwt_rotations');
        
        this.context.logger.info('JWT secret rotated', {
          secretId: newSecret.id,
          expiresAt: newSecret.expiresAt,
        });
        
        // Emit event for monitoring
        await this.publish(EventBuilder.notification('JWT_SECRET_ROTATED', {
          secretId: newSecret.id,
          rotatedAt: newSecret.createdAt,
          expiresAt: newSecret.expiresAt,
        }));
      }
    }, 24 * 60 * 60 * 1000); // Check daily
    
    // Register custom metrics
    this.registerCustomMetrics();
  }

  protected async onCommand(command: Command): Promise<ActorResult> {
    // Type guard to ensure we have AuthCommand
    const authCommand = command as AuthCommand;
    
    switch (authCommand.type) {
      case AuthCommands.SEND_MAGIC_LINK:
        return this.sendMagicLink(authCommand.payload);
      
      case AuthCommands.VERIFY_MAGIC_LINK:
        return this.verifyMagicLink(authCommand.payload);
      
      case AuthCommands.CREATE_SESSION:
        return this.createSession(authCommand.payload);
      
      case AuthCommands.UPDATE_PROFILE:
        return this.updateProfile(authCommand.payload);
      
      case AuthCommands.ASSIGN_ROLE:
        return this.assignRole(authCommand.payload);
      
      case AuthCommands.REVOKE_SESSION:
        return this.revokeSession(authCommand.payload);
      
      case AuthCommands.DELETE_USER:
        return this.deleteUser(authCommand.payload);
      
      case AuthCommands.LOCK_ACCOUNT:
        return this.lockAccount(authCommand.payload);
      
      default:
        throw new ActorError(
          `Unknown command: ${(command as any).type}`,
          'UNKNOWN_COMMAND',
          {
            actor: this.config.name,
            command: (command as any).type,
            fix: 'Check that the command type is supported by this actor. Refer to AuthCommands enum.',
            relatedFiles: ['src/events.ts', 'src/auth-actor.ts'],
            helpfulCommands: [
              'console.log(Object.values(AuthCommands)) // List supported commands'
            ],
            documentation: 'See AuthCommands enum for all supported command types',
          },
          400,
          'Command not supported'
        );
    }
  }

  protected async onQuery(query: Query): Promise<QueryResult> {
    // Type guard to ensure we have AuthQuery
    const authQuery = query as AuthQuery;
    
    switch (authQuery.type) {
      case AuthQueries.GET_USER:
        return this.getUser(authQuery.payload);
      
      case AuthQueries.GET_SESSION:
        return this.getSession(authQuery.payload);
      
      case AuthQueries.GET_PERMISSION:
        return this.getPermission(authQuery.payload);
      
      case AuthQueries.GET_SESSIONS:
        return this.getSessions(authQuery.payload);
      
      case AuthQueries.GET_ROLES:
        return this.getRoles(authQuery.payload);
      
      case AuthQueries.GET_SECURITY_EVENTS:
        return this.getSecurityEvents(authQuery.payload);
        
      case 'GET_JWT_STATUS':
        return this.getJWTStatus();
        
      case 'GET_METRICS':
        // Delegate to base class metrics
        return {
          success: true,
          data: {
            metrics: await this.getMetrics(),
            custom: await this.getCustomMetrics(),
          },
        };
        
      case 'GET_ALERTS':
        // Get security anomalies
        return {
          success: true,
          data: {
            anomalies: this.security.getAnomalies(),
            underAttack: this.security.isUnderAttack(),
          },
        };
      
      default:
        throw new ActorError(
          `Unknown query: ${(query as any).type}`,
          'UNKNOWN_QUERY',
          {
            actor: this.config.name,
            query: (query as any).type,
            fix: 'Check that the query type is supported by this actor. Refer to AuthQueries enum.',
            relatedFiles: ['src/events.ts', 'src/auth-actor.ts'],
            helpfulCommands: [
              'console.log(Object.values(AuthQueries)) // List supported queries'
            ],
            documentation: 'See AuthQueries enum for all supported query types',
          },
          400,
          'Query not supported'
        );
    }
  }

  // Command handlers
  private async sendMagicLink(payload: any): Promise<ActorResult> {
    const { email, ipAddress = '0.0.0.0' } = payload;
    
    this.context.logger.info('sendMagicLink called', { email });
    
    // Check if account is locked
    if (AuthStateHelpers.isAccountLocked(this.state, email)) {
      this.monitoring.incrementCounter('login_attempts', { 
        method: 'magic_link', 
        status: 'failed',
        reason: 'account_locked' 
      });
      throw new ActorError(
        'Account is temporarily locked due to too many failed attempts',
        'ACCOUNT_LOCKED',
        {
          actor: this.config.name,
          command: 'SEND_MAGIC_LINK',
          state: 'locked',
          fix: `Wait ${this.state.config.lockoutDuration / 60000} minutes before trying again`,
          helpfulCommands: [
            `// Check recent login attempts`,
            `await actor.query({ type: 'GET_LOGIN_ATTEMPTS', payload: { email: '${email}' } })`,
          ],
        },
        429,
        'Account is temporarily locked. Please try again later.'
      );
    }

    // Generate magic link token
    const token = nanoid(32);
    const verificationToken: VerificationToken = {
      identifier: email,
      token,
      expires: new Date(Date.now() + this.state.config.tokenExpiry),
    };
    
    this.state.verificationTokens.set(token, verificationToken);

    // Send email via notifications actor (graceful degradation on failure)
    try {
      await this.tell('notification', EventBuilder.command('SEND_EMAIL', {
        recipientEmail: email,
        template: 'magic_link',
        variables: {
          magicLink: `${process.env.APP_URL}/auth/verify?token=${token}&email=${encodeURIComponent(email)}`,
          expiresIn: '15 minutes',
        },
      }));
    } catch (error) {
      // Log error but don't fail the operation - token is still created
      this.context.logger.warn('Failed to send magic link email', error as Error);
    }

    // Track login attempt
    this.state.loginAttempts.push({
      id: nanoid(),
      email,
      ipAddress,
      userAgent: payload.userAgent,
      success: false,
      reason: 'magic_link_sent',
      createdAt: new Date(),
    });

    this.monitoring.incrementCounter('magic_links_sent');
    this.monitoring.incrementCounter('login_attempts', { 
      method: 'magic_link', 
      status: 'pending' 
    });
    
    return {
      success: true,
      data: {
        message: `Magic link sent to ${email}`,
      },
      events: [
        EventBuilder.notification(AuthNotifications.MAGIC_LINK_SENT, { email }),
      ],
    };
  }

  private async verifyMagicLink(payload: any): Promise<ActorResult> {
    const { token, email } = payload;
    
    const verificationToken = this.state.verificationTokens.get(token);
    if (!verificationToken || verificationToken.identifier !== email) {
      const securityEvent = {
        type: 'invalid_token_attempt',
        severity: 'medium',
        userId: null,
        details: { email },
        timestamp: new Date(),
      };
      
      // Track in parent security capability
      this.trackSecurityEvent(securityEvent);
      
      // Also store in state for backwards compatibility
      this.state.securityEvents.push(securityEvent);
      
      this.monitoring.incrementCounter('magic_links_verified', { status: 'invalid' });
      
      throw new ActorError(
        'Invalid or expired token',
        'INVALID_TOKEN',
        {
          actor: this.config.name,
          command: 'VERIFY_MAGIC_LINK',
          fix: 'Check that the token and email match exactly. Token may have expired.',
          relatedFiles: ['src/auth-actor.ts'],
          helpfulCommands: [
            'console.log(Array.from(actor.state.verificationTokens.entries())) // List all tokens'
          ],
        },
        401,
        'Magic link is invalid or expired'
      );
    }

    if (verificationToken.expires < new Date()) {
      this.state.verificationTokens.delete(token);
      this.monitoring.incrementCounter('magic_links_verified', { status: 'expired' });
      throw new ActorError(
        'Token has expired',
        'TOKEN_EXPIRED',
        {
          actor: this.config.name,
          command: 'VERIFY_MAGIC_LINK',
          fix: 'Request a new magic link as this one has expired.',
          relatedFiles: ['src/auth-actor.ts'],
          helpfulCommands: [
            'await actor.handle({ type: "SEND_MAGIC_LINK", payload: { email } })'
          ],
        },
        401,
        'Magic link has expired. Please request a new one.'
      );
    }

    // Delete used token
    this.state.verificationTokens.delete(token);

    // Get or create user
    let user = AuthStateHelpers.getUserByEmail(this.state, email);
    
    if (!user) {
      user = {
        id: nanoid(),
        email,
        emailVerified: new Date(),
        name: null,
        avatar: null,
        bio: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      
      this.state.users.set(user.id, user);
      
      // Assign default role
      const defaultRole = Array.from(this.state.roles.values())
        .find(r => r.name === 'user');
      
      if (defaultRole) {
        this.state.userRoles.set(user.id, [{
          userId: user.id,
          roleId: defaultRole.id,
          grantedBy: null,
          expiresAt: null,
          createdAt: new Date(),
        }]);
      }

      // Notify other actors (graceful degradation on failure)
      try {
        await this.publish(EventBuilder.notification(AuthNotifications.USER_REGISTERED, {
          userId: user.id,
          email: user.email,
          method: 'magic_link',
        }));
      } catch (error) {
        // Log error but don't fail the operation
        this.context.logger.warn('Failed to publish USER_REGISTERED notification', error as Error);
      }
      
      this.monitoring.incrementCounter('users_registered', { method: 'magic_link' });

      // Track analytics
      await this.tell('analytics', EventBuilder.command('TRACK_EVENT', {
        name: 'user_registered',
        userId: user.id,
        properties: {
          method: 'magic_link',
        },
      }));
    }

    // Create session
    const sessionId = nanoid();
    const sessionToken = await this.generateSessionToken(user.id, sessionId);
    const session: Session = {
      id: sessionId,
      userId: user.id,
      token: sessionToken,
      ipAddress: payload.ipAddress,
      userAgent: payload.userAgent,
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + this.state.config.sessionTimeout),
      createdAt: new Date(),
    };
    
    this.state.sessions.set(session.id, session);

    // Track successful login
    this.state.loginAttempts.push({
      id: nanoid(),
      email,
      ipAddress: payload.ipAddress || '0.0.0.0',
      userAgent: payload.userAgent,
      success: true,
      reason: null,
      createdAt: new Date(),
    });

    this.monitoring.incrementCounter('sessions_created', { method: 'magic_link' });
    this.monitoring.incrementCounter('magic_links_verified', { status: 'success' });
    this.monitoring.incrementCounter('login_attempts', { 
      method: 'magic_link', 
      status: 'success' 
    });
    
    // Record time between magic link sent and verified
    const sentTime = this.state.loginAttempts
      .filter(a => a.email === email && a.reason === 'magic_link_sent')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    
    if (sentTime) {
      const verificationTime = (Date.now() - sentTime.createdAt.getTime()) / 1000;
      this.monitoring.createHistogram('magic_link_verification_time', 'Time to verify magic link')
        .observe(verificationTime);
    }
    
    return {
      success: true,
      data: {
        user: this.sanitizeUser(user),
        session: {
          token: sessionToken,
          expiresAt: session.expiresAt,
        },
      },
      events: [
        EventBuilder.notification(AuthNotifications.SESSION_CREATED, {
          userId: user.id,
          sessionId: session.id,
        }),
      ],
    };
  }

  private async createSession(payload: any): Promise<ActorResult> {
    const { userId, device } = payload;
    
    const user = this.state.users.get(userId);
    if (!user) {
      throw new ActorError(
        'User not found',
        'USER_NOT_FOUND',
        {
          actor: this.config.name,
          command: 'CREATE_SESSION',
          fix: 'Verify the userId exists in the system before creating a session.',
          relatedFiles: ['src/state.ts', 'src/auth-actor.ts'],
          helpfulCommands: [
            'await actor.query({ type: "GET_USER", payload: { userId } })'
          ],
        },
        404,
        'User not found'
      );
    }

    const sessionId = nanoid();
    const sessionToken = await this.generateSessionToken(userId, sessionId);
    const session: Session = {
      id: sessionId,
      userId,
      token: sessionToken,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + this.state.config.sessionTimeout),
      createdAt: new Date(),
    };
    
    this.state.sessions.set(session.id, session);
    this.monitoring.incrementCounter('sessions_created', { 
      method: device.biometricAuth ? 'biometric' : 'standard' 
    });

    return {
      success: true,
      data: {
        token: sessionToken,
        expiresAt: session.expiresAt,
      },
      events: [
        EventBuilder.notification(AuthNotifications.SESSION_CREATED, {
          userId,
          sessionId: session.id,
          device,
        }),
      ],
    };
  }

  private async updateProfile(payload: any): Promise<ActorResult> {
    const { userId, updates } = payload;
    
    const user = this.state.users.get(userId);
    if (!user) {
      throw new ActorError(
        'User not found',
        'USER_NOT_FOUND',
        {
          actor: this.config.name,
          command: 'UPDATE_PROFILE',
          fix: 'Verify the userId exists in the system before updating profile.',
          relatedFiles: ['src/state.ts', 'src/auth-actor.ts'],
          helpfulCommands: [
            'await actor.query({ type: "GET_USER", payload: { userId } })'
          ],
        },
        404,
        'User not found'
      );
    }

    // Validate updates
    if (updates.name !== undefined && updates.name === '') {
      throw new ActorError(
        'Name cannot be empty',
        'VALIDATION_FAILED',
        {
          actor: this.config.name,
          command: 'UPDATE_PROFILE',
          fix: 'Provide a non-empty name when updating user profile.',
          relatedFiles: ['src/auth-actor.ts'],
          exampleCode: `
// Validate name before updating
if (updates.name !== undefined && updates.name.trim() === '') {
  throw new ActorError('Name cannot be empty', 'VALIDATION_FAILED', { ... });
}`,
        },
        400,
        'Name cannot be empty'
      );
    }

    // Update user
    const updatedUser = {
      ...user,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.state.users.set(userId, updatedUser);

    await this.publish(EventBuilder.notification(AuthNotifications.PROFILE_UPDATED, {
      userId,
      changes: Object.keys(updates),
    }));

    return {
      success: true,
      data: this.sanitizeUser(updatedUser),
    };
  }

  private async assignRole(payload: any): Promise<ActorResult> {
    const { userId, roleId, grantedBy, expiresAt } = payload;
    
    const user = this.state.users.get(userId);
    const role = this.state.roles.get(roleId);
    
    if (!user || !role) {
      throw new ActorError(
        'User or role not found',
        'ROLE_ASSIGNMENT_FAILED',
        {
          actor: this.config.name,
          command: 'ASSIGN_ROLE',
          fix: 'Verify both userId and roleId exist before role assignment.',
          relatedFiles: ['src/state.ts', 'src/auth-actor.ts'],
          helpfulCommands: [
            'console.log(Array.from(actor.state.users.keys())) // List user IDs',
            'console.log(Array.from(actor.state.roles.keys())) // List role IDs'
          ],
        },
        400,
        'Invalid user or role'
      );
    }

    const userRoles = this.state.userRoles.get(userId) || [];
    userRoles.push({
      userId,
      roleId,
      grantedBy,
      expiresAt,
      createdAt: new Date(),
    });
    
    this.state.userRoles.set(userId, userRoles);

    await this.publish(EventBuilder.notification(AuthNotifications.ROLE_ASSIGNED, {
      userId,
      roleId,
      grantedBy,
    }));

    return { success: true };
  }

  private async revokeSession(payload: any): Promise<ActorResult> {
    const { sessionId } = payload;
    
    const session = this.state.sessions.get(sessionId);
    if (!session) {
      throw new ActorError(
        'Session not found',
        'SESSION_NOT_FOUND',
        {
          actor: this.config.name,
          command: 'REVOKE_SESSION',
          fix: 'Check that the sessionId exists and is active.',
          relatedFiles: ['src/auth-actor.ts'],
          helpfulCommands: [
            'await actor.query({ type: "GET_SESSIONS", payload: { userId } })'
          ],
        },
        404,
        'Session not found'
      );
    }

    this.state.sessions.delete(sessionId);
    this.monitoring.incrementCounter('sessions_revoked', { reason: 'user_initiated' });

    await this.publish(EventBuilder.notification(AuthNotifications.SESSION_REVOKED, {
      userId: session.userId,
      sessionId,
    }));

    return { success: true };
  }

  private async deleteUser(payload: any): Promise<ActorResult> {
    const { userId } = payload;
    
    const user = this.state.users.get(userId);
    if (!user) {
      throw new ActorError(
        'User not found',
        'USER_NOT_FOUND',
        {
          actor: this.config.name,
          command: 'DELETE_USER',
          fix: 'Verify the userId exists before attempting deletion.',
          relatedFiles: ['src/state.ts', 'src/auth-actor.ts'],
          helpfulCommands: [
            'await actor.query({ type: "GET_USER", payload: { userId } })'
          ],
        },
        404,
        'User not found'
      );
    }

    // Soft delete
    user.deletedAt = new Date();
    this.state.users.set(userId, user);

    // Revoke all sessions
    Array.from(this.state.sessions.values())
      .filter(s => s.userId === userId)
      .forEach(s => {
        this.state.sessions.delete(s.id);
        this.monitoring.incrementCounter('sessions_revoked', { reason: 'user_deleted' });
      });

    await this.publish(EventBuilder.notification(AuthNotifications.USER_DELETED, {
      userId,
    }));

    return { success: true };
  }

  private async lockAccount(payload: any): Promise<ActorResult> {
    const { userId, reason } = payload;
    
    this.trackSecurityEvent({
      type: 'account_locked',
      severity: 'high',
      userId,
      details: { reason },
    });

    return { success: true };
  }

  // Query handlers
  private async getUser(payload: any): Promise<QueryResult> {
    const { userId } = payload;
    const user = this.state.users.get(userId);
    
    return {
      success: true,
      data: user ? this.sanitizeUser(user) : null,
    };
  }

  private async getSession(payload: any): Promise<QueryResult> {
    const { token } = payload;
    
    // Verify JWT using our manager
    const timer = this.monitoring.startTimer('jwt_verification_duration');
    const verifyResult = this.jwtManager.verify(token);
    timer();
    
    if (!verifyResult.valid) {
      this.trackSecurityEvent({
        type: 'invalid_session_token',
        severity: 'low',
        userId: null,
        details: { error: verifyResult.error },
      });
      return { success: true, data: null };
    }
    
    const session = Array.from(this.state.sessions.values())
      .find(s => s.token === token);
    
    if (!session || session.expiresAt < new Date()) {
      return { success: true, data: null };
    }
    
    // Verify session matches JWT claims
    if (verifyResult.payload && (
      session.userId !== verifyResult.payload.sub ||
      session.id !== verifyResult.payload.sid
    )) {
      this.trackSecurityEvent({
        type: 'session_mismatch',
        severity: 'high',
        userId: session.userId,
        details: { sessionId: session.id },
      });
      return { success: true, data: null };
    }

    const user = this.state.users.get(session.userId);
    
    // Update last activity
    session.lastActivity = new Date();

    return {
      success: true,
      data: {
        session: {
          id: session.id,
          expiresAt: session.expiresAt,
        },
        user: user ? this.sanitizeUser(user) : null,
      },
    };
  }

  private async getPermission(payload: any): Promise<QueryResult> {
    const { userId, permission } = payload;
    
    const hasPermission = AuthStateHelpers.hasPermission(
      this.state,
      userId,
      permission
    );
    
    this.monitoring.incrementCounter('permission_checks', { 
      result: hasPermission ? 'granted' : 'denied' 
    });
    
    return {
      success: true,
      data: hasPermission,
    };
  }

  private async getSessions(payload: any): Promise<QueryResult> {
    const { userId } = payload;
    
    const sessions = Array.from(this.state.sessions.values())
      .filter(s => s.userId === userId && s.expiresAt > new Date())
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
    
    return {
      success: true,
      data: sessions,
    };
  }

  private async getRoles(payload: any): Promise<QueryResult> {
    const { userId } = payload;
    
    const userRoles = this.state.userRoles.get(userId) || [];
    const roles = userRoles
      .filter(ur => !ur.expiresAt || ur.expiresAt > new Date())
      .map(ur => ({
        ...ur,
        role: this.state.roles.get(ur.roleId),
      }))
      .filter(ur => ur.role);
    
    return {
      success: true,
      data: roles,
    };
  }

  private async getSecurityEvents(payload: any): Promise<QueryResult> {
    const { userId, limit = 50 } = payload;
    
    // Use built-in security event tracking
    const events = this.security.getEvents({
      userId,
      limit,
    });
    
    return {
      success: true,
      data: events,
    };
  }

  private async getJWTStatus(): Promise<QueryResult> {
    return {
      success: true,
      data: this.jwtManager.getRotationStatus(),
    };
  }

  // Helper methods
  private async generateSessionToken(userId: string, sessionId: string): Promise<string> {
    return this.jwtManager.sign({
      sub: userId,
      sid: sessionId,
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      jti: nanoid(),
    });
  }

  private sanitizeUser(user: User): any {
    const roles = AuthStateHelpers.getUserRoles(this.state, user.id);
    return {
      id: user.id,
      email: user.email,
      emailVerified: !!user.emailVerified,
      name: user.name,
      avatar: user.avatar,
      bio: user.bio,
      roles: roles.map(r => ({
        id: r.id,
        name: r.name,
      })),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  // Custom health checks
  protected async onHealthCheck(): Promise<any> {
    const now = new Date();
    
    // Defensive checks for state initialization
    const activeSessions = this.state?.sessions ? 
      Array.from(this.state.sessions.values())
        .filter(s => s.expiresAt > now).length : 0;
    
    const pendingLinks = this.state?.verificationTokens ?
      Array.from(this.state.verificationTokens.values())
        .filter(t => t.expires > now).length : 0;
    
    const jwtStatus = this.jwtManager ? this.jwtManager.getRotationStatus() : null;
    
    return {
      auth: {
        healthy: true,
        message: `Active sessions: ${activeSessions}, Pending magic links: ${pendingLinks}`,
      },
      jwt: {
        healthy: jwtStatus ? jwtStatus.totalSecrets > 0 : false,
        message: jwtStatus ? `JWT secrets: ${jwtStatus.totalSecrets}` : 'JWT manager not initialized',
      },
    };
  }

  // Setup methods
  private setupRateLimiting(): void {
    // Skip rate limiting in test mode
    if (this.testMode) {
      return;
    }
    
    // Rate limit magic link requests
    this.createRateLimiter(AuthCommands.SEND_MAGIC_LINK, {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 3,
      keyGenerator: (identifier) => identifier, // Use email as key
    });
    
    // Rate limit login attempts
    this.createRateLimiter(AuthCommands.VERIFY_MAGIC_LINK, {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 5,
      keyGenerator: (identifier) => identifier,
    });
  }

  private registerEventSchemas(): void {
    // Command schemas
    this.eventValidator.registerCommandSchema(AuthCommands.SEND_MAGIC_LINK, {
      required: ['email'],
      properties: {
        email: { type: 'string', pattern: '^[^@]+@[^@]+\\.[^@]+$' },
        ipAddress: { type: 'string' },
        userAgent: { type: 'string' },
      },
    });
    
    this.eventValidator.registerCommandSchema(AuthCommands.VERIFY_MAGIC_LINK, {
      required: ['token', 'email'],
      properties: {
        token: { type: 'string', minLength: 32 },
        email: { type: 'string', pattern: '^[^@]+@[^@]+\\.[^@]+$' },
      },
    });
    
    // Query schemas
    this.eventValidator.registerQuerySchema(AuthQueries.GET_USER, {
      required: ['userId'],
      properties: {
        userId: { type: 'string' },
      },
    });
    
    this.eventValidator.registerQuerySchema(AuthQueries.GET_SESSION, {
      required: ['token'],
      properties: {
        token: { type: 'string' },
      },
    });
  }

  private registerComponents(): void {
    // Register all component exports from manifest
    componentManifest.components.forEach((component) => {
      // Map ComponentType enum to expected string type
      let type: 'web' | 'mobile' | 'api';
      if (component.type === 'react' || component.type === 'vue' || 
          component.type === 'angular' || component.type === 'webcomponent') {
        type = 'web';
      } else if (component.type === 'react-native' || component.type === 'flutter') {
        type = 'mobile';
      } else {
        type = 'api';
      }

      this.registerComponentExport({
        name: component.name,
        type,
        category: component.category as any,
        component: undefined, // Will be imported lazily
        props: component.props,
        metadata: {
          description: component.description,
        },
      });
    });
  }

  private registerCustomMetrics(): void {
    // Auth-specific metrics
    this.monitoring.createCounter('magic_links_sent', 'Magic links sent');
    this.monitoring.createCounter('magic_links_verified', 'Magic links verified');
    this.monitoring.createCounter('sessions_created', 'Sessions created');
    this.monitoring.createCounter('sessions_revoked', 'Sessions revoked');
    this.monitoring.createCounter('users_registered', 'Users registered');
    this.monitoring.createCounter('permission_checks', 'Permission checks');
    this.monitoring.createCounter('jwt_rotations', 'JWT secret rotations');
    this.monitoring.createHistogram('magic_link_verification_time', 'Time to verify magic link');
    this.monitoring.createHistogram('jwt_verification_duration', 'JWT verification duration');
    this.monitoring.createGauge('active_sessions', 'Currently active sessions');
    this.monitoring.createGauge('active_users', 'Unique users with sessions');
    this.monitoring.createGauge('pending_magic_links', 'Unverified magic links');
    this.monitoring.createGauge('jwt_secrets_active', 'Active JWT secrets');
  }

  private updateCustomMetrics(): void {
    const now = new Date();
    
    // Defensive checks for state initialization
    const activeSessions = this.state?.sessions ? 
      Array.from(this.state.sessions.values())
        .filter(s => s.expiresAt > now).length : 0;
    
    const activeUserIds = this.state?.sessions ? new Set(
      Array.from(this.state.sessions.values())
        .filter(s => s.expiresAt > now)
        .map(s => s.userId)
    ) : new Set();
    
    const pendingLinks = this.state?.verificationTokens ?
      Array.from(this.state.verificationTokens.values())
        .filter(t => t.expires > now).length : 0;
    
    const jwtStatus = this.jwtManager ? this.jwtManager.getRotationStatus() : null;
    
    this.monitoring.setGauge('active_sessions', activeSessions);
    this.monitoring.setGauge('active_users', activeUserIds.size);
    this.monitoring.setGauge('pending_magic_links', pendingLinks);
    if (jwtStatus) {
      this.monitoring.setGauge('jwt_secrets_active', jwtStatus.totalSecrets - jwtStatus.expiredSecrets);
    }
  }

  private async getCustomMetrics(): Promise<any> {
    return {
      activeSessions: this.monitoring.gauges.get('active_sessions'),
      activeUsers: this.monitoring.gauges.get('active_users'),
      pendingMagicLinks: this.monitoring.gauges.get('pending_magic_links'),
      jwtSecretsActive: this.monitoring.gauges.get('jwt_secrets_active'),
    };
  }
  
  private initializeDefaultRolesAndPermissions(): void {
    // Skip if state is not initialized yet
    if (!this.state || !this.state.permissions || !this.state.roles || !this.state.rolePermissions) {
      return;
    }
    
    // Only initialize if roles don't exist yet
    if (this.state.roles.size > 0) {
      return;
    }
    
    // Create default permissions
    const defaultPermissions = [
      { id: 'perm-1', name: 'read:own_profile', resource: 'profile', action: 'read', description: 'Read own profile' },
      { id: 'perm-2', name: 'write:own_profile', resource: 'profile', action: 'write', description: 'Update own profile' },
      { id: 'perm-3', name: 'read:users', resource: 'users', action: 'read', description: 'Read user list' },
      { id: 'perm-4', name: 'write:users', resource: 'users', action: 'write', description: 'Manage users' },
      { id: 'perm-5', name: 'admin:*', resource: '*', action: '*', description: 'Full admin access' },
    ];
    
    defaultPermissions.forEach(perm => {
      this.state.permissions.set(perm.id, {
        ...perm,
        createdAt: new Date(),
      });
    });
    
    // Create default roles
    const userRole = {
      id: 'role-user',
      name: 'user',
      description: 'Default user role',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const adminRole = {
      id: 'role-admin',
      name: 'admin',
      description: 'Administrator role',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.state.roles.set(userRole.id, userRole);
    this.state.roles.set(adminRole.id, adminRole);
    
    // Assign permissions to roles
    this.state.rolePermissions.set(userRole.id, ['perm-1', 'perm-2']);
    this.state.rolePermissions.set(adminRole.id, ['perm-5']);
  }

  /**
   * Register custom error transformers for auth-specific errors
   */
  private registerCustomErrorTransformers(): void {
    // Transform generic "User not found" errors into AI-friendly format
    this.errorTransformers.set('User not found', (error) => {
      return new ActorError(
        error.message,
        'USER_NOT_FOUND',
        {
          actor: this.config.name,
          fix: 'Check if the userId exists in the system. User might have been deleted or never created.',
          relatedFiles: ['src/state.ts', 'src/auth-actor.ts'],
          helpfulCommands: [
            'await actor.query({ type: "GET_USER", payload: { userId: "user-id" } })',
            'console.log(Array.from(actor.state.users.keys())) // List all user IDs'
          ],
          exampleCode: `
// Check if user exists before operations
const user = await actor.query({ type: 'GET_USER', payload: { userId } });
if (!user.data) {
  // Handle user not found case
  return { success: false, error: 'User does not exist' };
}`,
        },
        404,
        'User not found'
      );
    });

    // Transform "Session not found" errors
    this.errorTransformers.set('Session not found', (error) => {
      return new ActorError(
        error.message,
        'SESSION_NOT_FOUND',
        {
          actor: this.config.name,
          fix: 'Session may have expired or been revoked. Check session token validity.',
          relatedFiles: ['src/auth-actor.ts'],
          helpfulCommands: [
            'await actor.query({ type: "GET_SESSION", payload: { token: "jwt-token" } })',
            'await actor.query({ type: "GET_SESSIONS", payload: { userId: "user-id" } })'
          ],
        },
        401,
        'Session expired or invalid'
      );
    });

    // Transform "Role not found" errors  
    this.errorTransformers.set('User or role not found', (error) => {
      return new ActorError(
        error.message,
        'ROLE_ASSIGNMENT_FAILED',
        {
          actor: this.config.name,
          fix: 'Verify both user and role exist before assignment. Check role ID spelling.',
          relatedFiles: ['src/state.ts', 'src/auth-actor.ts'],
          helpfulCommands: [
            'console.log(Array.from(actor.state.roles.keys())) // List role IDs',
            'await actor.query({ type: "GET_ROLES", payload: { userId: "user-id" } })'
          ],
          exampleCode: `
// Validate role exists before assignment
const role = actor.state.roles.get(roleId);
if (!role) {
  throw new ActorError('Role not found', 'ROLE_NOT_FOUND', { ... });
}`,
        },
        400,
        'Invalid user or role'
      );
    });

    // Transform validation errors
    this.errorTransformers.set('Name cannot be empty', (error) => {
      return new ActorError(
        error.message,
        'VALIDATION_FAILED',
        {
          actor: this.config.name,
          command: 'UPDATE_PROFILE',
          fix: 'Ensure name field is not empty string when updating profile.',
          relatedFiles: ['src/auth-actor.ts'],
          exampleCode: `
// Validate profile updates
if (updates.name !== undefined && updates.name.trim() === '') {
  throw new ActorError('Name cannot be empty', 'VALIDATION_FAILED', { ... });
}`,
        },
        400,
        'Profile validation failed'
      );
    });
  }
}