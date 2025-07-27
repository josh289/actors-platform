import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailService } from '../../../services/EmailService';

// Mock SendGrid with factory function to avoid hoisting issues
vi.mock('@sendgrid/mail', () => ({
  setApiKey: vi.fn(),
  send: vi.fn(),
}));

// Import the mocked module
import * as sgMail from '@sendgrid/mail';
const mockSgMail = vi.mocked(sgMail);

describe('EmailService', () => {
  let emailService: EmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    emailService = new EmailService({
      provider: 'sendgrid',
      apiKey: 'test-api-key',
      fromEmail: 'test@example.com',
      fromName: 'Test Sender',
    });
  });

  describe('send', () => {
    it('should send email successfully', async () => {
      mockSgMail.send.mockResolvedValue([{ statusCode: 202 }]);

      const result = await emailService.send({
        to: 'recipient@example.com',
        subject: 'Hello {{name}}',
        html: '<p>Welcome {{name}}!</p>',
        data: { name: 'John' },
        messageId: 'msg_123',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg_123');
      expect(mockSgMail.send).toHaveBeenCalledWith({
        to: 'recipient@example.com',
        from: {
          email: 'test@example.com',
          name: 'Test Sender',
        },
        subject: 'Hello John',
        html: '<p>Welcome John!</p>',
        text: undefined,
        replyTo: undefined,
        customArgs: {
          messageId: 'msg_123',
        },
        attachments: undefined,
      });
    });

    it('should handle template compilation errors', async () => {
      const result = await emailService.send({
        to: 'recipient@example.com',
        subject: 'Hello {{name',  // Invalid template
        html: '<p>Welcome!</p>',
        data: {},
        messageId: 'msg_123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Template compilation failed');
    });

    it('should handle SendGrid API errors', async () => {
      mockSgMail.send.mockRejectedValue(new Error('API Error'));

      const result = await emailService.send({
        to: 'recipient@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        data: {},
        messageId: 'msg_123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
    });

    it('should validate email addresses', () => {
      expect(emailService.validateEmailAddress('valid@email.com')).toBe(true);
      expect(emailService.validateEmailAddress('invalid-email')).toBe(false);
      expect(emailService.validateEmailAddress('@invalid.com')).toBe(false);
      expect(emailService.validateEmailAddress('invalid@')).toBe(false);
    });
  });

  describe('compileTemplate', () => {
    it('should compile and cache templates', () => {
      const template = 'Hello {{name}}, your balance is {{formatCurrency balance "USD"}}';
      const data = { name: 'John', balance: 1234.56 };

      const result1 = emailService.compileTemplate(template, data);
      expect(result1).toBe('Hello John, your balance is $1,234.56');

      // Second call should use cached template
      const result2 = emailService.compileTemplate(template, data);
      expect(result2).toBe(result1);
    });

    it('should handle missing data gracefully', () => {
      const template = 'Hello {{name}}';
      const data = {};

      const result = emailService.compileTemplate(template, data);
      expect(result).toBe('Hello ');
    });
  });

  describe('sendBatch', () => {
    it('should send emails in batches', async () => {
      mockSgMail.send.mockResolvedValue([{ statusCode: 202 }]);

      const emails = Array(250).fill(null).map((_, i) => ({
        to: `user${i}@example.com`,
        subject: 'Test',
        html: '<p>Test</p>',
        data: {},
        messageId: `msg_${i}`,
      }));

      const results = await emailService.sendBatch(emails);

      expect(results).toHaveLength(250);
      expect(results.every(r => r.success)).toBe(true);
      // Should have been called 250 times (once per email)
      expect(mockSgMail.send).toHaveBeenCalledTimes(250);
    });
  });
});