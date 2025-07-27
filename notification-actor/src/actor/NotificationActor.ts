import { Actor, ActorContext } from '../types/actor';
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

export class NotificationActor implements Actor<NotificationState> {
  private state: NotificationState;
  private emailService: EmailService;
  private smsService: SMSService;
  private pushService: PushService;
  private preferencesService: PreferencesService;
  private context: ActorContext;

  constructor(context: ActorContext, initialState?: NotificationState) {
    this.context = context;
    this.state = initialState || {
      templates: {},
      messages: {},
      preferences: {},
      campaigns: {}
    };

    // Initialize services
    this.emailService = new EmailService(context.config.email);
    this.smsService = new SMSService(context.config.sms);
    this.pushService = new PushService(context.config.push);
    this.preferencesService = new PreferencesService();
  }

  // Command Handlers
  async handleSendEmail(command: SendEmailCommand): Promise<SendResponse> {
    try {
      const { to, template, data, priority } = command.payload;
      
      // Check user preferences
      const preferences = await this.getUserPreferences(to);
      if (!this.preferencesService.canSendEmail(preferences, template)) {
        return { success: false, error: 'User has disabled email notifications' };
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
        return { success: false, error: `Template ${template} not found` };
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

        return { success: true, messageId };
      } else {
        message.status = MessageStatus.FAILED;
        message.failedAt = new Date();
        message.failureReason = result.error;
        return { success: false, error: result.error };
      }
    } catch (error) {
      logger.error('Failed to send email', error);
      return { success: false, error: 'Internal error sending email' };
    }
  }

  async handleSendSMS(command: SendSMSCommand): Promise<SendResponse> {
    try {
      const { to, message: content, urgent } = command.payload;
      
      // Check user preferences
      const preferences = await this.getUserPreferences(to);
      if (!this.preferencesService.canSendSMS(preferences)) {
        return { success: false, error: 'User has disabled SMS notifications' };
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

        return { success: true, messageId };
      } else {
        message.status = MessageStatus.FAILED;
        message.failedAt = new Date();
        message.failureReason = result.error;
        return { success: false, error: result.error };
      }
    } catch (error) {
      logger.error('Failed to send SMS', error);
      return { success: false, error: 'Internal error sending SMS' };
    }
  }

  async handleSendPush(command: SendPushCommand): Promise<SendResponse> {
    try {
      const { userId, title, body, data } = command.payload;
      
      // Get user info from user actor
      const userInfo = await this.context.ask('user', {
        type: 'GET_USER',
        payload: { userId }
      });

      if (!userInfo.deviceTokens || userInfo.deviceTokens.length === 0) {
        return { success: false, error: 'No device tokens found for user' };
      }

      // Check user preferences
      const preferences = await this.getUserPreferences(userId);
      if (!this.preferencesService.canSendPush(preferences)) {
        return { success: false, error: 'User has disabled push notifications' };
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

        return { success: true, messageId };
      } else {
        message.status = MessageStatus.FAILED;
        message.failedAt = new Date();
        message.failureReason = result.error;
        return { success: false, error: result.error };
      }
    } catch (error) {
      logger.error('Failed to send push notification', error);
      return { success: false, error: 'Internal error sending push notification' };
    }
  }

  async handleUpdatePreferences(command: UpdatePreferencesCommand): Promise<PreferencesResponse> {
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

      return { success: true, preferences: updated };
    } catch (error) {
      logger.error('Failed to update preferences', error);
      return { success: false, error: 'Failed to update preferences' };
    }
  }

  // Query Handlers
  async handleGetMessageStatus(query: GetMessageStatusQuery): Promise<MessageStatusResponse> {
    const { messageId } = query.payload;
    const message = this.state.messages[messageId];

    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    return {
      status: message.status,
      sentAt: message.sentAt,
      deliveredAt: message.deliveredAt,
      failedAt: message.failedAt,
      failureReason: message.failureReason
    };
  }

  // Helper methods
  private async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    return this.state.preferences[userId];
  }

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

  // State management
  getState(): NotificationState {
    return this.state;
  }

  setState(state: NotificationState): void {
    this.state = state;
  }

  // Event router
  async handleEvent(event: any): Promise<any> {
    switch (event.type) {
      case 'SEND_EMAIL':
        return this.handleSendEmail(event);
      case 'SEND_SMS':
        return this.handleSendSMS(event);
      case 'SEND_PUSH':
        return this.handleSendPush(event);
      case 'UPDATE_PREFERENCES':
        return this.handleUpdatePreferences(event);
      case 'GET_MESSAGE_STATUS':
        return this.handleGetMessageStatus(event);
      default:
        throw new Error(`Unknown event type: ${event.type}`);
    }
  }
}