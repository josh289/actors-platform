import { 
  EnhancedActor,
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
 * Enhanced Authentication Actor with AI-Friendly Features
 * 
 * This version uses the EnhancedActor base class which provides:
 * - Automatic state validation and reconstruction
 * - AI-friendly error messages with context and fixes
 * - Built-in lifecycle hooks
 * - Better testing utilities
 * - Development mode with state tracking
 */
export class EnhancedAuthActor extends EnhancedActor<AuthState> {
  // Infrastructure as private properties (not in state)
  private jwtManager: JWTManager;
  
  // Define state schema for automatic validation
  protected stateSchema = AuthStateSchema;
  
  // Define configuration schema
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
   * Create default state - required by EnhancedActor
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
   * Lifecycle hook - called after state is loaded
   */
  protected async afterStateLoad(state: AuthState): Promise<void> {
    // Initialize default roles and permissions if needed
    this.initializeDefaultRolesAndPermissions();
    
    // Log state statistics
    this.log.info('Auth state loaded', {
      users: state.users.size,
      sessions: state.sessions.size,
      roles: state.roles.size,
      permissions: state.permissions.size,
    });
  }

  /**
   * Lifecycle hook - called before command execution
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

  protected async onInitialize(): Promise<void> {
    // Subscribe to external events
    this.on('billing.CUSTOMER_CREATED', async (event) => {
      // Link billing customer to user
      this.log.info(`User ${event.payload.userId} linked to billing`);
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
        
        this.log.info('JWT secret rotated', {
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
          `Unknown command type: ${(command as any).type}`,
          'UNKNOWN_COMMAND',
          {
            actor: this.actorConfig.name,
            command: (command as any).type,
            fix: `Valid commands are: ${Object.values(AuthCommands).join(', ')}`,
            relatedFiles: [
              'src/events.ts',
              'src/enhanced-auth-actor.ts',
            ],
            helpfulCommands: [
              `grep -n "${(command as any).type}" src/`,
            ],
            documentation: 'See AuthCommands enum in events.ts',
          },
          400,
          'Invalid command'
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
      
      default:
        throw new ActorError(
          `Unknown query type: ${(query as any).type}`,
          'UNKNOWN_QUERY',
          {
            actor: this.actorConfig.name,
            query: (query as any).type,
            fix: `Valid queries are: ${Object.values(AuthQueries).join(', ')}`,
            relatedFiles: [
              'src/events.ts',
              'src/enhanced-auth-actor.ts',
            ],
            documentation: 'See AuthQueries enum in events.ts',
          },
          400,
          'Invalid query'
        );
    }
  }

  // Command handlers

  private async sendMagicLink(payload: any): Promise<ActorResult> {
    const { email, ipAddress = '0.0.0.0' } = payload;
    
    this.log.info('sendMagicLink called', { email });
    
    // Check if account is locked
    if (AuthStateHelpers.isAccountLocked(this.state, email)) {
      throw new ActorError(
        'Account is temporarily locked due to too many failed attempts',
        'ACCOUNT_LOCKED',
        {
          actor: this.actorConfig.name,
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

    // Send email via notifications actor
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
      // Log error but don't fail - token is still created
      this.log.warn('Failed to send magic link email', error as Error);
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
        severity: 'medium' as const,
        userId: null,
        details: { email },
        timestamp: new Date(),
      };
      
      this.trackSecurityEvent(securityEvent);
      
      throw new ActorError(
        'Invalid or expired magic link token',
        'INVALID_TOKEN',
        {
          actor: this.actorConfig.name,
          command: 'VERIFY_MAGIC_LINK',
          fix: 'Request a new magic link. Tokens are valid for 15 minutes.',
          helpfulCommands: [
            `await actor.handle({ type: 'SEND_MAGIC_LINK', payload: { email: '${email}' } })`,
          ],
        },
        401,
        'Invalid or expired token'
      );
    }

    if (verificationToken.expires < new Date()) {
      this.state.verificationTokens.delete(token);
      
      throw new ActorError(
        'Magic link token has expired',
        'TOKEN_EXPIRED',
        {
          actor: this.actorConfig.name,
          command: 'VERIFY_MAGIC_LINK',
          fix: 'Request a new magic link. Tokens expire after 15 minutes.',
          helpfulCommands: [
            `await actor.handle({ type: 'SEND_MAGIC_LINK', payload: { email: '${email}' } })`,
          ],
        },
        401,
        'Token has expired'
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
        const userRoles = this.state.userRoles.get(user.id) || [];
        userRoles.push({
          userId: user.id,
          roleId: defaultRole.id,
          grantedBy: null,
          expiresAt: null,
          createdAt: new Date(),
        });
        this.state.userRoles.set(user.id, userRoles);
      }

      // Notify other actors
      await this.publish(EventBuilder.notification(AuthNotifications.USER_REGISTERED, {
        userId: user.id,
        email: user.email,
        method: 'magic_link',
      }));
      
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

  // ... (implement other command handlers similarly)

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

  // ... (implement other query handlers)

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
    
    const activeSessions = Array.from(this.state.sessions.values())
      .filter(s => s.expiresAt > now).length;
    
    const pendingLinks = Array.from(this.state.verificationTokens.values())
      .filter(t => t.expires > now).length;
    
    const jwtStatus = this.jwtManager.getRotationStatus();
    
    return {
      auth: {
        healthy: true,
        message: `Active sessions: ${activeSessions}, Pending magic links: ${pendingLinks}`,
      },
      jwt: {
        healthy: jwtStatus.totalSecrets > 0,
        message: `JWT secrets: ${jwtStatus.totalSecrets}, Next rotation: ${new Date(jwtStatus.nextRotation).toISOString()}`,
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
      keyGenerator: (email) => email,
    });
    
    // Rate limit login attempts
    this.createRateLimiter(AuthCommands.VERIFY_MAGIC_LINK, {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 5,
      keyGenerator: (email) => email,
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
    
    const activeSessions = Array.from(this.state.sessions.values())
      .filter(s => s.expiresAt > now);
    
    const activeUserIds = new Set(activeSessions.map(s => s.userId));
    
    const pendingLinks = Array.from(this.state.verificationTokens.values())
      .filter(t => t.expires > now).length;
    
    const jwtStatus = this.jwtManager.getRotationStatus();
    
    this.monitoring.setGauge('active_sessions', activeSessions.length);
    this.monitoring.setGauge('active_users', activeUserIds.size);
    this.monitoring.setGauge('pending_magic_links', pendingLinks);
    this.monitoring.setGauge('jwt_secrets_active', jwtStatus.totalSecrets - jwtStatus.expiredSecrets);
  }

  private registerCustomErrorTransformers(): void {
    // User not found
    this.registerErrorTransformer('User not found', (error) => new ActorError(
      'User not found',
      'USER_NOT_FOUND',
      {
        actor: this.actorConfig.name,
        fix: 'Verify the user ID exists. You can list users or create a new one.',
        helpfulCommands: [
          `await actor.query({ type: 'LIST_USERS', payload: {} })`,
          `await actor.handle({ type: 'CREATE_USER', payload: { email: 'user@example.com' } })`,
        ],
      },
      404,
      'User not found'
    ));
    
    // Session expired
    this.registerErrorTransformer('Session expired', (error) => new ActorError(
      'Session has expired',
      'SESSION_EXPIRED',
      {
        actor: this.actorConfig.name,
        fix: 'Create a new session by logging in again.',
        helpfulCommands: [
          `await actor.handle({ type: 'SEND_MAGIC_LINK', payload: { email: 'user@example.com' } })`,
        ],
      },
      401,
      'Your session has expired. Please log in again.'
    ));
    
    // Permission denied
    this.registerErrorTransformer('Permission denied', (error) => new ActorError(
      'Insufficient permissions',
      'PERMISSION_DENIED',
      {
        actor: this.actorConfig.name,
        fix: 'Check user roles and permissions. May need to assign appropriate role.',
        helpfulCommands: [
          `await actor.query({ type: 'GET_ROLES', payload: { userId: 'user-id' } })`,
          `await actor.handle({ type: 'ASSIGN_ROLE', payload: { userId: 'user-id', roleId: 'role-id' } })`,
        ],
      },
      403,
      'You do not have permission to perform this action'
    ));
  }
  
  private initializeDefaultRolesAndPermissions(): void {
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
   * Get command example for error messages
   */
  protected getCommandExample(commandType: string): string {
    const examples: Record<string, string> = {
      [AuthCommands.SEND_MAGIC_LINK]: `
await actor.handle({
  type: '${AuthCommands.SEND_MAGIC_LINK}',
  payload: {
    email: 'user@example.com',
    ipAddress: '127.0.0.1', // optional
    userAgent: 'Mozilla/5.0...' // optional
  },
});`,
      [AuthCommands.VERIFY_MAGIC_LINK]: `
await actor.handle({
  type: '${AuthCommands.VERIFY_MAGIC_LINK}',
  payload: {
    token: 'abc123...', // 32 character token from email
    email: 'user@example.com'
  },
});`,
      [AuthCommands.UPDATE_PROFILE]: `
await actor.handle({
  type: '${AuthCommands.UPDATE_PROFILE}',
  payload: {
    userId: 'user-123',
    updates: {
      name: 'John Doe',
      bio: 'Software Developer'
    }
  },
});`,
    };
    
    return examples[commandType] || super.getCommandExample(commandType);
  }

  // Implement remaining command handlers...
  private async createSession(payload: any): Promise<ActorResult> {
    // Implementation...
    throw new Error('Not implemented');
  }

  private async updateProfile(payload: any): Promise<ActorResult> {
    // Implementation...
    throw new Error('Not implemented');
  }

  private async assignRole(payload: any): Promise<ActorResult> {
    // Implementation...
    throw new Error('Not implemented');
  }

  private async revokeSession(payload: any): Promise<ActorResult> {
    // Implementation...
    throw new Error('Not implemented');
  }

  private async deleteUser(payload: any): Promise<ActorResult> {
    // Implementation...
    throw new Error('Not implemented');
  }

  private async lockAccount(payload: any): Promise<ActorResult> {
    // Implementation...
    throw new Error('Not implemented');
  }

  private async getPermission(payload: any): Promise<QueryResult> {
    // Implementation...
    throw new Error('Not implemented');
  }

  private async getSessions(payload: any): Promise<QueryResult> {
    // Implementation...
    throw new Error('Not implemented');
  }

  private async getRoles(payload: any): Promise<QueryResult> {
    // Implementation...
    throw new Error('Not implemented');
  }

  private async getSecurityEvents(payload: any): Promise<QueryResult> {
    // Implementation...
    throw new Error('Not implemented');
  }
}