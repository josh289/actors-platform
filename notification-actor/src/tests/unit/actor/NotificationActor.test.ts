import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationActor } from '../../../actor/NotificationActor';
import { ActorContext } from '../../../types/actor';

// Create mock implementations
const mockEmailSend = vi.fn();
const mockSMSSend = vi.fn();
const mockPushSend = vi.fn();

vi.mock('../../../services/EmailService', () => ({
  EmailService: vi.fn().mockImplementation(() => ({
    send: mockEmailSend,
    validateEmailAddress: vi.fn().mockReturnValue(true),
  })),
}));

vi.mock('../../../services/SMSService', () => ({
  SMSService: vi.fn().mockImplementation(() => ({
    send: mockSMSSend,
  })),
}));

vi.mock('../../../services/PushService', () => ({
  PushService: vi.fn().mockImplementation(() => ({
    send: mockPushSend,
  })),
}));

const mockCanSendEmail = vi.fn();
const mockCanSendSMS = vi.fn();
const mockCanSendPush = vi.fn();
const mockIsInQuietHours = vi.fn();

vi.mock('../../../services/PreferencesService', () => ({
  PreferencesService: vi.fn().mockImplementation(() => ({
    canSendEmail: mockCanSendEmail,
    canSendSMS: mockCanSendSMS,
    canSendPush: mockCanSendPush,
    isInQuietHours: mockIsInQuietHours,
  })),
}));

describe('NotificationActor', () => {
  let actor: NotificationActor;
  let mockContext: ActorContext;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset mock implementations to defaults
    mockCanSendEmail.mockReturnValue(true);
    mockCanSendSMS.mockReturnValue(true);
    mockCanSendPush.mockReturnValue(true);
    mockIsInQuietHours.mockReturnValue(false);
    
    mockContext = {
      actorId: 'notification-test',
      config: {
        email: { provider: 'sendgrid', apiKey: 'test', fromEmail: 'test@example.com', fromName: 'Test' },
        sms: { provider: 'twilio', accountSid: 'test', authToken: 'test', fromNumber: '+1234567890' },
        push: { provider: 'firebase', serviceAccount: {} },
      },
      ask: vi.fn(),
      tell: vi.fn(),
      publish: vi.fn(),
    };

    actor = new NotificationActor(mockContext);
  });

  describe('handleSendEmail', () => {
    it('should send email successfully', async () => {
      // Setup initial state with template
      actor.setState({
        templates: {
          welcome: {
            id: 'welcome',
            name: 'Welcome Email',
            subject: 'Welcome {{name}}!',
            htmlTemplate: '<h1>Welcome {{name}}!</h1>',
            variables: ['name'],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        messages: {},
        preferences: {},
        campaigns: {},
      });

      mockEmailSend.mockResolvedValue({
        success: true,
        messageId: 'msg_123',
      });

      const result = await actor.handleEvent({
        type: 'SEND_EMAIL',
        payload: {
          to: 'user@example.com',
          template: 'welcome',
          data: { name: 'John' },
          priority: 'normal',
        },
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(mockEmailSend).toHaveBeenCalled();
      expect(mockContext.publish).toHaveBeenCalledWith({
        type: 'MESSAGE_SENT',
        payload: expect.objectContaining({
          channel: 'email',
          recipient: 'user@example.com',
          template: 'welcome',
        }),
      });
    });

    it('should respect user preferences', async () => {
      // Mock preferences service to deny email sending
      mockCanSendEmail.mockReturnValue(false);
      
      actor.setState({
        templates: {
          marketing: {
            id: 'marketing',
            name: 'Marketing Email',
            subject: 'Special Offer!',
            htmlTemplate: '<h1>Sale!</h1>',
            variables: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        messages: {},
        preferences: {
          'user@example.com': {
            userId: 'user@example.com',
            email: { enabled: false, categories: {} },
            sms: { enabled: true, categories: {} },
            push: { enabled: true, categories: {} },
          },
        },
        campaigns: {},
      });

      const result = await actor.handleEvent({
        type: 'SEND_EMAIL',
        payload: {
          to: 'user@example.com',
          template: 'marketing',
          data: {},
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User has disabled email notifications');
      expect(mockEmailSend).not.toHaveBeenCalled();
    });

    it('should handle missing template', async () => {
      const result = await actor.handleEvent({
        type: 'SEND_EMAIL',
        payload: {
          to: 'user@example.com',
          template: 'non-existent',
          data: {},
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Template non-existent not found');
    });
  });

  describe('handleSendSMS', () => {
    it('should send SMS successfully', async () => {
      mockSMSSend.mockResolvedValue({
        success: true,
        messageId: 'sms_123',
      });

      const result = await actor.handleEvent({
        type: 'SEND_SMS',
        payload: {
          to: '+1234567890',
          message: 'Your code is 123456',
          urgent: true,
        },
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(mockSMSSend).toHaveBeenCalledWith({
        to: '+1234567890',
        message: 'Your code is 123456',
        messageId: expect.any(String),
      });
    });
  });

  describe('handleSendPush', () => {
    it('should send push notification successfully', async () => {
      mockContext.ask = vi.fn().mockResolvedValue({
        deviceTokens: ['token1', 'token2'],
      });

      mockPushSend.mockResolvedValue({
        success: true,
        messageId: 'push_123',
      });

      const result = await actor.handleEvent({
        type: 'SEND_PUSH',
        payload: {
          userId: 'user_123',
          title: 'New Message',
          body: 'You have a new message',
          data: { messageId: 'msg_456' },
        },
      });

      expect(result.success).toBe(true);
      expect(mockContext.ask).toHaveBeenCalledWith('user', {
        type: 'GET_USER',
        payload: { userId: 'user_123' },
      });
      expect(mockPushSend).toHaveBeenCalled();
    });

    it('should handle missing device tokens', async () => {
      mockContext.ask = vi.fn().mockResolvedValue({
        deviceTokens: [],
      });

      const result = await actor.handleEvent({
        type: 'SEND_PUSH',
        payload: {
          userId: 'user_123',
          title: 'Test',
          body: 'Test',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No device tokens found for user');
    });
  });

  describe('handleUpdatePreferences', () => {
    it('should update preferences successfully', async () => {
      const result = await actor.handleEvent({
        type: 'UPDATE_PREFERENCES',
        payload: {
          userId: 'user_123',
          preferences: {
            email: { enabled: false, categories: {} },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.preferences).toBeDefined();
      
      const state = actor.getState();
      expect(state.preferences['user_123'].email.enabled).toBe(false);
    });
  });

  describe('handleGetMessageStatus', () => {
    it('should get message status', async () => {
      actor.setState({
        templates: {},
        messages: {
          msg_123: {
            id: 'msg_123',
            channel: 'email',
            recipient: 'user@example.com',
            status: 'delivered',
            priority: 'normal',
            sentAt: new Date('2024-01-01'),
            deliveredAt: new Date('2024-01-01'),
          },
        },
        preferences: {},
        campaigns: {},
      });

      const result = await actor.handleEvent({
        type: 'GET_MESSAGE_STATUS',
        payload: { messageId: 'msg_123' },
      });

      expect(result.status).toBe('delivered');
      expect(result.sentAt).toBeDefined();
      expect(result.deliveredAt).toBeDefined();
    });

    it('should throw error for non-existent message', async () => {
      await expect(
        actor.handleEvent({
          type: 'GET_MESSAGE_STATUS',
          payload: { messageId: 'non-existent' },
        })
      ).rejects.toThrow('Message non-existent not found');
    });
  });
});