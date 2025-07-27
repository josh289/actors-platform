import { RelayActor, Result } from '../../runtime/actor-base';
import { Event } from '../../services/event-catalog';
import * as crypto from 'crypto';

interface User {
  id: string;
  email: string;
  profile: UserProfile;
  createdAt: number;
  updatedAt: number;
  lastLogin?: number;
}

interface UserProfile {
  name?: string;
  avatar?: string;
  preferences?: Record<string, any>;
}

interface Session {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

interface MagicLink {
  token: string;
  email: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export class UserActor extends RelayActor {
  protected async processEvent(event: Event, handler: any): Promise<Result> {
    const events: Event[] = [];
    const users = this.getState('users') || new Map<string, User>();
    const sessions = this.getState('sessions') || new Map<string, Session>();
    const magicLinks = this.getState('magicLinks') || new Map<string, MagicLink>();

    switch (event.type) {
      case 'SEND_MAGIC_LINK': {
        const { email, redirectTo } = event.payload;
        
        // Generate magic link token
        const token = crypto.randomBytes(32).toString('hex');
        const magicLink: MagicLink = {
          token,
          email,
          createdAt: Date.now(),
          expiresAt: Date.now() + (15 * 60 * 1000), // 15 minutes
          used: false
        };
        
        magicLinks.set(token, magicLink);

        // Emit event to send email
        events.push({
          id: this.generateId(),
          type: 'SEND_EMAIL',
          payload: {
            to: email,
            template: 'magic-link',
            data: {
              token,
              redirectTo,
              expiresIn: '15 minutes'
            }
          },
          timestamp: Date.now(),
          actor: 'user'
        });

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: { email, timestamp: Date.now() },
            timestamp: Date.now(),
            actor: 'user'
          });
        }

        return {
          success: true,
          state: { users, sessions, magicLinks },
          events,
          response: { success: true, message: 'Magic link sent' }
        };
      }

      case 'VERIFY_TOKEN': {
        const { token, email } = event.payload;
        const magicLink = magicLinks.get(token);
        
        if (!magicLink || magicLink.email !== email) {
          throw new Error('Invalid token');
        }
        
        if (magicLink.used) {
          throw new Error('Token already used');
        }
        
        if (Date.now() > magicLink.expiresAt) {
          throw new Error('Token expired');
        }

        // Mark token as used
        magicLink.used = true;

        // Find or create user
        let user = Array.from(users.values()).find(u => u.email === email);
        const isNewUser = !user;
        
        if (!user) {
          user = {
            id: this.generateId(),
            email,
            profile: {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastLogin: Date.now()
          };
          users.set(user.id, user);
        } else {
          user.lastLogin = Date.now();
        }

        // Create session
        const session: Session = {
          id: this.generateId(),
          userId: user.id,
          createdAt: Date.now(),
          expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        };
        sessions.set(session.id, session);

        // Emit events
        if (isNewUser) {
          events.push({
            id: this.generateId(),
            type: 'USER_REGISTERED',
            payload: {
              userId: user.id,
              email: user.email,
              timestamp: Date.now()
            },
            timestamp: Date.now(),
            actor: 'user'
          });

          // Create billing customer
          events.push({
            id: this.generateId(),
            type: 'CREATE_CUSTOMER',
            payload: {
              userId: user.id,
              email: user.email
            },
            timestamp: Date.now(),
            actor: 'user'
          });
        }

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              userId: user.id,
              sessionId: session.id,
              timestamp: Date.now()
            },
            timestamp: Date.now(),
            actor: 'user'
          });
        }

        return {
          success: true,
          state: { users, sessions, magicLinks },
          events,
          response: {
            success: true,
            sessionId: session.id,
            user: {
              id: user.id,
              email: user.email,
              profile: user.profile
            }
          }
        };
      }

      case 'LOGOUT_USER': {
        const { sessionId } = event.payload;
        const session = sessions.get(sessionId);
        
        if (!session) {
          throw new Error('Session not found');
        }

        sessions.delete(sessionId);

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              userId: session.userId,
              timestamp: Date.now()
            },
            timestamp: Date.now(),
            actor: 'user'
          });
        }

        return {
          success: true,
          state: { users, sessions, magicLinks },
          events
        };
      }

      case 'UPDATE_PROFILE': {
        const { userId, updates } = event.payload;
        const user = users.get(userId);
        
        if (!user) {
          throw new Error('User not found');
        }

        user.profile = { ...user.profile, ...updates };
        user.updatedAt = Date.now();

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              userId,
              changes: Object.keys(updates),
              timestamp: Date.now()
            },
            timestamp: Date.now(),
            actor: 'user'
          });
        }

        return {
          success: true,
          state: { users, sessions, magicLinks },
          events,
          response: { user }
        };
      }

      default:
        throw new Error(`Unknown event type: ${event.type}`);
    }
  }

  protected async executeQuery(event: Event, queryDef: any): Promise<any> {
    const users = this.getState('users') || new Map<string, User>();
    const sessions = this.getState('sessions') || new Map<string, Session>();

    switch (event.type) {
      case 'GET_USER': {
        const { userId } = event.payload;
        return users.get(userId) || null;
      }

      case 'GET_SESSION': {
        const { sessionId } = event.payload;
        const session = sessions.get(sessionId);
        
        if (!session) {
          return { valid: false, user: null };
        }
        
        if (Date.now() > session.expiresAt) {
          sessions.delete(sessionId);
          return { valid: false, user: null };
        }

        const user = users.get(session.userId);
        return {
          valid: true,
          user: user ? {
            id: user.id,
            email: user.email,
            profile: user.profile
          } : null
        };
      }

      case 'GET_USER_BY_EMAIL': {
        const { email } = event.payload;
        return Array.from(users.values()).find(u => u.email === email) || null;
      }

      default:
        throw new Error(`Unknown query type: ${event.type}`);
    }
  }

  protected async handleSubscription(event: Event, handler: any): Promise<void> {
    const users = this.getState('users') || new Map<string, User>();

    switch (event.type) {
      case 'PAYMENT_PROCESSED': {
        const { userId } = event.payload;
        const user = users.get(userId);
        
        if (user) {
          user.profile.lastPurchase = Date.now();
          this.setState('users', users);
        }
        break;
      }

      case 'ORDER_CREATED': {
        const { userId } = event.payload;
        const user = users.get(userId);
        
        if (user) {
          const orderCount = (user.profile.orderCount || 0) + 1;
          user.profile.orderCount = orderCount;
          this.setState('users', users);
        }
        break;
      }
    }
  }

  protected async updateState(newState: any): Promise<void> {
    if (newState.users) this.setState('users', newState.users);
    if (newState.sessions) this.setState('sessions', newState.sessions);
    if (newState.magicLinks) this.setState('magicLinks', newState.magicLinks);
  }
}