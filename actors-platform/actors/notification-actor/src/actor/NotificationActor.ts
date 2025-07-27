import { Actor, ActorContext } from '../types/actor';
import { EventDefinition, ActorManifest, EventCategory } from '../types/event-registry';
import { NotificationState, Message, UserPreferences, MessageStatus } from '../types';
import {
  SendEmailCommand,
  SendSMSCommand,
  SendPushCommand,
  UpdatePreferencesCommand,
  GetMessageStatusQuery,
  SendResponse,
  MessageStatusResponse,
  PreferencesResponse
} from '../types/events';
import { EmailService } from '../services/EmailService';
import { SMSService } from '../services/SMSService';
import { PushService } from '../services/PushService';
import { PreferencesService } from '../services/PreferencesService';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// Enhanced types for event registry integration
interface Command {
  type: string;
  payload: any;
  metadata?: any;
}

interface Query {
  type: string;
  payload: any;
  metadata?: any;
}

interface ActorResult {
  success: boolean;
  data?: any;
  error?: Error;
  events?: any[];
}

interface QueryResult {
  success: boolean;
  data?: any;
  error?: Error;
}

export class NotificationActor implements Actor<NotificationState> {
  private state: NotificationState;
  private emailService!: EmailService;
  private smsService!: SMSService;
  private pushService!: PushService;
  private preferencesService!: PreferencesService;

  constructor(private context: ActorContext, initialState?: NotificationState) {
    this.state = initialState || {
      templates: {},
      messages: {},
      preferences: {},
      campaigns: {}
    };
  }

  /**
   * Initialize the actor and its services
   */
  async initialize(): Promise<void> {
    // Initialize services
    this.emailService = new EmailService(this.context.config.email);
    this.smsService = new SMSService(this.context.config.sms);
    this.pushService = new PushService(this.context.config.push);
    this.preferencesService = new PreferencesService();
  }

  /**
   * Declare the actor manifest for event registry
   */
  getActorManifest(): ActorManifest {
    return {
      actorName: 'notification',
      description: 'Handles multi-channel notifications (email, SMS, push)',
      version: '1.0.0',
      healthEndpoint: '/health',
      produces: [
        'NOTIFICATION_SENT',
        'NOTIFICATION_FAILED',
        'NOTIFICATION_READ',
        'NOTIFICATION_DELIVERED',
        'NOTIFICATION_BOUNCED'
      ],
      consumes: [
        // Commands from any actor
        'SEND_EMAIL',
        'SEND_SMS',
        'SEND_PUSH',
        'SEND_MULTI_CHANNEL',
        'MARK_AS_READ',
        'DELETE_NOTIFICATION',
        'UPDATE_PREFERENCES',
        // Queries from any actor
        'GET_NOTIFICATION',
        'GET_USER_NOTIFICATIONS',
        'GET_UNREAD_COUNT',
        'GET_MESSAGE_STATUS',
        // Events from other actors that trigger notifications
        'USER_CREATED',
        'USER_VERIFIED',
        'SESSION_CREATED',
        'PASSWORD_RESET_REQUESTED',
        'PASSWORD_CHANGED',
        'PAYMENT_SUCCESSFUL',
        'PAYMENT_FAILED',
        'SUBSCRIPTION_CREATED',
        'SUBSCRIPTION_CANCELLED',
        'SUBSCRIPTION_EXPIRED',
        'INVOICE_GENERATED'
      ]
    };
  }

  /**
   * Register event definitions with the event registry
   */
  async registerEventDefinitions(registry: any): Promise<void> {
    if (!registry) return;

    // Command Events
    const commandEvents: EventDefinition[] = [
      {
        name: 'SEND_EMAIL',
        category: 'command',
        description: 'Send an email notification',
        producerActor: 'any',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            to: { type: 'string', format: 'email' },
            template: { type: 'string' },
            data: { type: 'object' },
            priority: { type: 'string', enum: ['low', 'normal', 'high'] }
          },
          required: ['to', 'template', 'data'],
          additionalProperties: false
        }
      },
      {
        name: 'SEND_SMS',
        category: 'command',
        description: 'Send an SMS notification',
        producerActor: 'any',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            to: { type: 'string', pattern: '^\\+?[1-9]\\d{1,14}$' },
            message: { type: 'string', maxLength: 160 },
            urgent: { type: 'boolean' }
          },
          required: ['to', 'message'],
          additionalProperties: false
        }
      },
      {
        name: 'SEND_PUSH',
        category: 'command',
        description: 'Send a push notification',
        producerActor: 'any',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            title: { type: 'string' },
            body: { type: 'string' },
            data: { type: 'object' }
          },
          required: ['userId', 'title', 'body'],
          additionalProperties: false
        }
      },
      {
        name: 'SEND_MULTI_CHANNEL',
        category: 'command',
        description: 'Send notification across multiple channels',
        producerActor: 'any',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            channels: { type: 'array', items: { type: 'string', enum: ['email', 'sms', 'push'] } },
            template: { type: 'string' },
            data: { type: 'object' },
            priority: { type: 'string', enum: ['low', 'normal', 'high'] }
          },
          required: ['userId', 'channels', 'template', 'data'],
          additionalProperties: false
        }
      },
      {
        name: 'MARK_AS_READ',
        category: 'command',
        description: 'Mark a notification as read',
        producerActor: 'any',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            messageId: { type: 'string' },
            readAt: { type: 'string', format: 'date-time' }
          },
          required: ['messageId'],
          additionalProperties: false
        }
      },
      {
        name: 'DELETE_NOTIFICATION',
        category: 'command',
        description: 'Delete a notification',
        producerActor: 'any',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            messageId: { type: 'string' }
          },
          required: ['messageId'],
          additionalProperties: false
        }
      },
      {
        name: 'UPDATE_PREFERENCES',
        category: 'command',
        description: 'Update user notification preferences',
        producerActor: 'any',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            preferences: {
              type: 'object',
              properties: {
                email: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean' },
                    categories: { type: 'object' }
                  }
                },
                sms: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean' },
                    categories: { type: 'object' }
                  }
                },
                push: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean' },
                    categories: { type: 'object' }
                  }
                },
                quietHours: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean' },
                    start: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                    end: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                    timezone: { type: 'string' }
                  }
                }
              }
            }
          },
          required: ['userId', 'preferences'],
          additionalProperties: false
        }
      }
    ];

    // Query Events
    const queryEvents: EventDefinition[] = [
      {
        name: 'GET_NOTIFICATION',
        category: 'query',
        description: 'Get a specific notification by ID',
        producerActor: 'any',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            messageId: { type: 'string' }
          },
          required: ['messageId'],
          additionalProperties: false
        }
      },
      {
        name: 'GET_USER_NOTIFICATIONS',
        category: 'query',
        description: 'Get all notifications for a user',
        producerActor: 'any',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            offset: { type: 'integer', minimum: 0 },
            filter: {
              type: 'object',
              properties: {
                channel: { type: 'string', enum: ['email', 'sms', 'push'] },
                status: { type: 'string', enum: ['pending', 'sent', 'delivered', 'failed', 'bounced', 'read'] },
                startDate: { type: 'string', format: 'date-time' },
                endDate: { type: 'string', format: 'date-time' }
              }
            }
          },
          required: ['userId'],
          additionalProperties: false
        }
      },
      {
        name: 'GET_UNREAD_COUNT',
        category: 'query',
        description: 'Get count of unread notifications for a user',
        producerActor: 'any',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string' }
          },
          required: ['userId'],
          additionalProperties: false
        }
      },
      {
        name: 'GET_MESSAGE_STATUS',
        category: 'query',
        description: 'Get the status of a message',
        producerActor: 'any',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            messageId: { type: 'string' }
          },
          required: ['messageId'],
          additionalProperties: false
        }
      }
    ];

    // Notification Events (Published by this actor)
    const notificationEvents: EventDefinition[] = [
      {
        name: 'NOTIFICATION_SENT',
        category: 'notification',
        description: 'Notification was successfully sent',
        producerActor: 'notification',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            messageId: { type: 'string' },
            channel: { type: 'string', enum: ['email', 'sms', 'push'] },
            recipient: { type: 'string' },
            template: { type: 'string' },
            timestamp: { type: 'integer' }
          },
          required: ['messageId', 'channel', 'recipient', 'timestamp'],
          additionalProperties: false
        }
      },
      {
        name: 'NOTIFICATION_FAILED',
        category: 'notification',
        description: 'Notification failed to send',
        producerActor: 'notification',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            messageId: { type: 'string' },
            channel: { type: 'string', enum: ['email', 'sms', 'push'] },
            recipient: { type: 'string' },
            error: { type: 'string' },
            timestamp: { type: 'integer' }
          },
          required: ['messageId', 'channel', 'recipient', 'error', 'timestamp'],
          additionalProperties: false
        }
      },
      {
        name: 'NOTIFICATION_READ',
        category: 'notification',
        description: 'Notification was marked as read',
        producerActor: 'notification',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            messageId: { type: 'string' },
            userId: { type: 'string' },
            readAt: { type: 'string', format: 'date-time' }
          },
          required: ['messageId', 'userId', 'readAt'],
          additionalProperties: false
        }
      },
      {
        name: 'NOTIFICATION_DELIVERED',
        category: 'notification',
        description: 'Notification was delivered to recipient',
        producerActor: 'notification',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            messageId: { type: 'string' },
            deliveredAt: { type: 'integer' }
          },
          required: ['messageId', 'deliveredAt'],
          additionalProperties: false
        }
      },
      {
        name: 'NOTIFICATION_BOUNCED',
        category: 'notification',
        description: 'Notification bounced (e.g., invalid email)',
        producerActor: 'notification',
        version: 1,
        payloadSchema: {
          type: 'object',
          properties: {
            messageId: { type: 'string' },
            reason: { type: 'string' },
            timestamp: { type: 'integer' }
          },
          required: ['messageId', 'reason', 'timestamp'],
          additionalProperties: false
        }
      }
    ];

    // Register all events
    for (const event of [...commandEvents, ...queryEvents, ...notificationEvents]) {
      try {
        await registry.register(event);
      } catch (error) {
        // Event might already be registered
        logger.debug(`Event ${event.name} might already be registered: ${error}`);
      }
    }
  }

  /**
   * Main event handler (required by Actor interface)
   */
  async handleEvent(event: any): Promise<any> {
    // Route to appropriate handler based on event type
    if (this.isCommand(event.type)) {
      return this.onCommand(event as Command);
    } else if (this.isQuery(event.type)) {
      return this.onQuery(event as Query);
    } else {
      throw new Error(`Unknown event type: ${event.type}`);
    }
  }

  /**
   * Get current state (required by Actor interface)
   */
  getState(): NotificationState {
    return this.state;
  }

  /**
   * Set state (required by Actor interface)
   */
  setState(state: NotificationState): void {
    this.state = state;
  }

  /**
   * Check if event type is a command
   */
  private isCommand(type: string): boolean {
    const commands = [
      'SEND_EMAIL', 'SEND_SMS', 'SEND_PUSH', 'SEND_MULTI_CHANNEL',
      'MARK_AS_READ', 'DELETE_NOTIFICATION', 'UPDATE_PREFERENCES'
    ];
    return commands.includes(type);
  }

  /**
   * Check if event type is a query
   */
  private isQuery(type: string): boolean {
    const queries = [
      'GET_NOTIFICATION', 'GET_USER_NOTIFICATIONS', 
      'GET_UNREAD_COUNT', 'GET_MESSAGE_STATUS'
    ];
    return queries.includes(type);
  }

  /**
   * Handle incoming commands
   */
  private async onCommand(command: Command): Promise<ActorResult> {
    switch (command.type) {
      case 'SEND_EMAIL':
        return this.handleSendEmail(command);
      case 'SEND_SMS':
        return this.handleSendSMS(command);
      case 'SEND_PUSH':
        return this.handleSendPush(command);
      case 'SEND_MULTI_CHANNEL':
        return this.handleSendMultiChannel(command);
      case 'MARK_AS_READ':
        return this.handleMarkAsRead(command);
      case 'DELETE_NOTIFICATION':
        return this.handleDeleteNotification(command);
      case 'UPDATE_PREFERENCES':
        return this.handleUpdatePreferences(command);
      default:
        throw new Error(`Unknown command type: ${command.type}`);
    }
  }

  /**
   * Handle incoming queries
   */
  private async onQuery(query: Query): Promise<QueryResult> {
    switch (query.type) {
      case 'GET_NOTIFICATION':
        return this.handleGetNotification(query);
      case 'GET_USER_NOTIFICATIONS':
        return this.handleGetUserNotifications(query);
      case 'GET_UNREAD_COUNT':
        return this.handleGetUnreadCount(query);
      case 'GET_MESSAGE_STATUS':
        return this.handleGetMessageStatus(query);
      default:
        throw new Error(`Unknown query type: ${query.type}`);
    }
  }

  // Command Handlers
  private async handleSendEmail(command: Command): Promise<ActorResult> {
    try {
      const { to, template, data, priority } = command.payload;
      
      // Check user preferences
      const preferences = await this.getUserPreferences(to);
      if (!this.preferencesService.canSendEmail(preferences, template)) {
        return { success: false, error: new Error('User has disabled email notifications') };
      }

      // Check quiet hours
      if (this.preferencesService.isInQuietHours(preferences)) {
        // Queue for later delivery
        logger.info(`Queueing email for ${to} due to quiet hours`);
        // Implementation would queue the message
      }

      // Get template
      const emailTemplate = this.state.templates[template];
      if (!emailTemplate) {
        return { success: false, error: new Error(`Template ${template} not found`) };
      }

      // Create message record
      const messageId = uuidv4();
      const message: Message = {
        id: messageId,
        channel: 'email',
        recipient: to,
        template,
        status: MessageStatus.PENDING,
        priority: priority || 'normal',
        metadata: data
      };

      this.state.messages[messageId] = message;

      // Send email
      const result = await this.emailService.send({
        to,
        subject: emailTemplate.subject,
        html: emailTemplate.htmlTemplate,
        text: emailTemplate.textTemplate,
        data,
        messageId
      });

      if (result.success) {
        message.status = MessageStatus.SENT;
        message.sentAt = new Date();
        
        // Publish notification
        await this.publishEvent({
          type: 'MESSAGE_SENT',
          payload: {
            messageId,
            channel: 'email',
            recipient: to,
            template,
            timestamp: Date.now()
          }
        });

        return { success: true, data: { messageId } };
      } else {
        message.status = MessageStatus.FAILED;
        message.failedAt = new Date();
        message.failureReason = result.error;
        return { success: false, error: new Error(result.error || 'Failed to send') };
      }
    } catch (error) {
      logger.error('Failed to send email', error);
      return { success: false, error: new Error('Internal error sending email') };
    }
  }

  private async handleSendSMS(command: Command): Promise<ActorResult> {
    try {
      const { to, message: content, urgent } = command.payload;
      
      // Check user preferences
      const preferences = await this.getUserPreferences(to);
      if (!this.preferencesService.canSendSMS(preferences)) {
        return { success: false, error: new Error('User has disabled SMS notifications') };
      }

      // Create message record
      const messageId = uuidv4();
      const message: Message = {
        id: messageId,
        channel: 'sms',
        recipient: to,
        content,
        status: MessageStatus.PENDING,
        priority: urgent ? 'high' : 'normal'
      };

      this.state.messages[messageId] = message;

      // Send SMS
      const result = await this.smsService.send({
        to,
        message: content,
        messageId
      });

      if (result.success) {
        message.status = MessageStatus.SENT;
        message.sentAt = new Date();
        
        // Publish notification
        await this.publishEvent({
          type: 'MESSAGE_SENT',
          payload: {
            messageId,
            channel: 'sms',
            recipient: to,
            timestamp: Date.now()
          }
        });

        return { success: true, data: { messageId } };
      } else {
        message.status = MessageStatus.FAILED;
        message.failedAt = new Date();
        message.failureReason = result.error;
        return { success: false, error: new Error(result.error || 'Failed to send') };
      }
    } catch (error) {
      logger.error('Failed to send SMS', error);
      return { success: false, error: new Error('Internal error sending SMS') };
    }
  }

  private async handleSendPush(command: Command): Promise<ActorResult> {
    try {
      const { userId, title, body, data } = command.payload;
      
      // Get user info from user actor
      const userInfo = await this.context.ask('user', {
        type: 'GET_USER',
        payload: { userId }
      });

      if (!userInfo.deviceTokens || userInfo.deviceTokens.length === 0) {
        return { success: false, error: new Error('No device tokens found for user') };
      }

      // Check user preferences
      const preferences = await this.getUserPreferences(userId);
      if (!this.preferencesService.canSendPush(preferences)) {
        return { success: false, error: new Error('User has disabled push notifications') };
      }

      // Create message record
      const messageId = uuidv4();
      const message: Message = {
        id: messageId,
        channel: 'push',
        recipient: userId,
        content: body,
        status: MessageStatus.PENDING,
        priority: 'normal',
        metadata: { title, ...data }
      };

      this.state.messages[messageId] = message;

      // Send push notification
      const result = await this.pushService.send({
        tokens: userInfo.deviceTokens,
        title,
        body,
        data,
        messageId
      });

      if (result.success) {
        message.status = MessageStatus.SENT;
        message.sentAt = new Date();
        
        // Publish notification
        await this.publishEvent({
          type: 'MESSAGE_SENT',
          payload: {
            messageId,
            channel: 'push',
            recipient: userId,
            timestamp: Date.now()
          }
        });

        return { success: true, data: { messageId } };
      } else {
        message.status = MessageStatus.FAILED;
        message.failedAt = new Date();
        message.failureReason = result.error;
        return { success: false, error: new Error(result.error || 'Failed to send') };
      }
    } catch (error) {
      logger.error('Failed to send push notification', error);
      return { success: false, error: new Error('Internal error sending push notification') };
    }
  }

  private async handleUpdatePreferences(command: Command): Promise<ActorResult> {
    try {
      const { userId, preferences } = command.payload;
      
      // Merge with existing preferences
      const existing = this.state.preferences[userId] || {
        userId,
        email: { enabled: true, categories: {} },
        sms: { enabled: true, categories: {} },
        push: { enabled: true, categories: {} }
      };

      const updated: UserPreferences = {
        ...existing,
        ...preferences,
        email: { ...existing.email, ...preferences.email },
        sms: { ...existing.sms, ...preferences.sms },
        push: { ...existing.push, ...preferences.push }
      };

      this.state.preferences[userId] = updated;

      return { success: true, data: { preferences: updated } };
    } catch (error) {
      logger.error('Failed to update preferences', error);
      return { success: false, error: new Error('Failed to update preferences') };
    }
  }

  // New Command Handlers
  private async handleSendMultiChannel(command: Command): Promise<ActorResult> {
    try {
      const { userId, channels, template, data, priority } = command.payload;
      const results: any[] = [];
      
      // Get user info for email and phone
      const userInfo = await this.context.ask('user', {
        type: 'GET_USER',
        payload: { userId }
      });
      
      for (const channel of channels) {
        try {
          switch (channel) {
            case 'email':
              if (userInfo.email) {
                const emailResult = await this.handleSendEmail({
                  type: 'SEND_EMAIL',
                  payload: { to: userInfo.email, template, data, priority }
                } as Command);
                results.push({ channel: 'email', ...emailResult });
              }
              break;
            case 'sms':
              if (userInfo.phone) {
                const smsResult = await this.handleSendSMS({
                  type: 'SEND_SMS',
                  payload: { to: userInfo.phone, message: data.message || template }
                } as Command);
                results.push({ channel: 'sms', ...smsResult });
              }
              break;
            case 'push':
              const pushResult = await this.handleSendPush({
                type: 'SEND_PUSH',
                payload: { userId, title: data.title || template, body: data.body || data.message, data }
              } as Command);
              results.push({ channel: 'push', ...pushResult });
              break;
          }
        } catch (error) {
          results.push({ channel, success: false, error: (error as Error).message });
        }
      }
      
      const allSuccessful = results.every(r => r.success);
      return { 
        success: allSuccessful, 
        data: { results },
        error: allSuccessful ? undefined : new Error('Some channels failed') 
      };
    } catch (error) {
      logger.error('Failed to send multi-channel notification', error);
      return { success: false, error: error as Error };
    }
  }

  private async handleMarkAsRead(command: Command): Promise<ActorResult> {
    try {
      const { messageId, readAt } = command.payload;
      const message = this.state.messages[messageId];
      
      if (!message) {
        return { success: false, error: new Error(`Message ${messageId} not found`) };
      }
      
      message.status = MessageStatus.READ;
      message.readAt = new Date(readAt || Date.now());
      
      await this.publishEvent({
        type: 'NOTIFICATION_READ',
        payload: {
          messageId,
          userId: message.recipient,
          readAt: message.readAt.toISOString()
        }
      });
      
      return { success: true, data: { messageId } };
    } catch (error) {
      logger.error('Failed to mark notification as read', error);
      return { success: false, error: error as Error };
    }
  }

  private async handleDeleteNotification(command: Command): Promise<ActorResult> {
    try {
      const { messageId } = command.payload;
      
      if (!this.state.messages[messageId]) {
        return { success: false, error: new Error(`Message ${messageId} not found`) };
      }
      
      delete this.state.messages[messageId];
      
      return { success: true, data: { messageId } };
    } catch (error) {
      logger.error('Failed to delete notification', error);
      return { success: false, error: error as Error };
    }
  }

  // Query Handlers
  private async handleGetNotification(query: Query): Promise<QueryResult> {
    try {
      const { messageId } = query.payload;
      const message = this.state.messages[messageId];
      
      if (!message) {
        return { success: false, error: new Error(`Message ${messageId} not found`) };
      }
      
      return { success: true, data: message };
    } catch (error) {
      logger.error('Failed to get notification', error);
      return { success: false, error: error as Error };
    }
  }

  private async handleGetUserNotifications(query: Query): Promise<QueryResult> {
    try {
      const { userId, limit = 20, offset = 0, filter } = query.payload;
      
      let notifications = Object.values(this.state.messages)
        .filter(msg => msg.recipient === userId);
      
      // Apply filters
      if (filter) {
        if (filter.channel) {
          notifications = notifications.filter(msg => msg.channel === filter.channel);
        }
        if (filter.status) {
          notifications = notifications.filter(msg => msg.status === filter.status);
        }
        if (filter.startDate) {
          const startDate = new Date(filter.startDate);
          notifications = notifications.filter(msg => 
            msg.createdAt && new Date(msg.createdAt) >= startDate
          );
        }
        if (filter.endDate) {
          const endDate = new Date(filter.endDate);
          notifications = notifications.filter(msg => 
            msg.createdAt && new Date(msg.createdAt) <= endDate
          );
        }
      }
      
      // Sort by creation date (newest first)
      notifications.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      
      // Apply pagination
      const total = notifications.length;
      const paginatedNotifications = notifications.slice(offset, offset + limit);
      
      return { 
        success: true, 
        data: {
          notifications: paginatedNotifications,
          total,
          limit,
          offset
        }
      };
    } catch (error) {
      logger.error('Failed to get user notifications', error);
      return { success: false, error: error as Error };
    }
  }

  private async handleGetUnreadCount(query: Query): Promise<QueryResult> {
    try {
      const { userId } = query.payload;
      
      const unreadCount = Object.values(this.state.messages)
        .filter(msg => 
          msg.recipient === userId && 
          msg.status !== MessageStatus.READ
        ).length;
      
      return { success: true, data: { count: unreadCount } };
    } catch (error) {
      logger.error('Failed to get unread count', error);
      return { success: false, error: error as Error };
    }
  }

  private async handleGetMessageStatus(query: Query): Promise<QueryResult> {
    const { messageId } = query.payload;
    const message = this.state.messages[messageId];

    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    return {
      success: true,
      data: {
        status: message.status,
        sentAt: message.sentAt,
        deliveredAt: message.deliveredAt,
        failedAt: message.failedAt,
        failureReason: message.failureReason
      }
    };
  }

  // Helper methods
  private async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    return this.state.preferences[userId];
  }

  /**
   * Helper to publish events
   */
  private async publishEvent(event: any): Promise<void> {
    await this.context.publish(event);
    
    // Also send to analytics
    await this.context.tell('analytics', {
      type: 'TRACK_EVENT',
      payload: {
        event: event.type,
        properties: event.payload
      }
    });
  }

  /**
   * Subscribe to events from other actors that trigger notifications
   */
  async subscribeToEvents(on: (eventType: string, handler: (event: any) => Promise<void>) => void): Promise<void> {
    // User events
    on('USER_CREATED', async (event) => {
      await this.handleSendEmail({
        type: 'SEND_EMAIL',
        payload: {
          to: event.payload.email,
          template: 'welcome',
          data: {
            name: event.payload.name,
            activationUrl: event.payload.activationUrl
          }
        }
      } as Command);
    });
    
    on('USER_VERIFIED', async (event) => {
      await this.handleSendEmail({
        type: 'SEND_EMAIL',
        payload: {
          to: event.payload.email,
          template: 'email_verified',
          data: {
            name: event.payload.name
          }
        }
      } as Command);
    });
    
    on('PASSWORD_RESET_REQUESTED', async (event) => {
      await this.handleSendEmail({
        type: 'SEND_EMAIL',
        payload: {
          to: event.payload.email,
          template: 'password_reset',
          data: {
            name: event.payload.name,
            resetUrl: event.payload.resetUrl
          },
          priority: 'high'
        }
      } as Command);
    });
    
    // Billing events
    on('PAYMENT_SUCCESSFUL', async (event) => {
      await this.handleSendEmail({
        type: 'SEND_EMAIL',
        payload: {
          to: event.payload.email,
          template: 'payment_receipt',
          data: {
            amount: event.payload.amount,
            currency: event.payload.currency,
            invoiceUrl: event.payload.invoiceUrl
          }
        }
      } as Command);
    });
    
    on('SUBSCRIPTION_EXPIRED', async (event) => {
      await this.handleSendMultiChannel({
        type: 'SEND_MULTI_CHANNEL',
        payload: {
          userId: event.payload.userId,
          channels: ['email', 'push'],
          template: 'subscription_expired',
          data: {
            planName: event.payload.planName,
            renewUrl: event.payload.renewUrl
          },
          priority: 'high'
        }
      } as Command);
    });
  }

  /**
   * Custom health check for notification services
   */
  async performHealthCheck(): Promise<any> {
    const checks: any = {};
    
    // Check if services are initialized
    checks.emailService = {
      healthy: !!this.emailService,
      message: this.emailService ? 'Email service is initialized' : 'Email service not initialized'
    };
    
    checks.smsService = {
      healthy: !!this.smsService,
      message: this.smsService ? 'SMS service is initialized' : 'SMS service not initialized'
    };
    
    checks.pushService = {
      healthy: !!this.pushService,
      message: this.pushService ? 'Push service is initialized' : 'Push service not initialized'
    };
    
    // Check message queue size
    const messageCount = Object.keys(this.state.messages).length;
    checks.messageQueue = {
      healthy: messageCount < 10000, // Arbitrary threshold
      message: `${messageCount} messages in queue`
    };
    
    return checks;
  }
}