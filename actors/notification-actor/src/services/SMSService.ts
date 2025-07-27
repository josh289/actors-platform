import twilio from 'twilio';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { logger } from '../utils/logger';

export interface SMSConfig {
  provider: 'twilio';
  accountSid: string;
  authToken: string;
  fromNumber: string;
  messagingServiceSid?: string;
  circuitBreaker?: {
    failureThreshold: number;
    timeout: number;
    resetTimeout: number;
  };
}

export interface SendSMSParams {
  to: string;
  message: string;
  messageId: string;
  mediaUrls?: string[];
}

export class SMSService {
  private client: twilio.Twilio;
  private circuitBreaker: CircuitBreaker;

  constructor(private config: SMSConfig) {
    if (config.provider === 'twilio') {
      this.client = twilio(config.accountSid, config.authToken);
    } else {
      throw new Error(`Unsupported SMS provider: ${config.provider}`);
    }

    this.circuitBreaker = new CircuitBreaker('sms-service', {
      failureThreshold: config.circuitBreaker?.failureThreshold || 5,
      timeout: config.circuitBreaker?.timeout || 10000,
      resetTimeout: config.circuitBreaker?.resetTimeout || 60000,
      monitoringInterval: 300000 // 5 minutes
    });
  }

  async send(params: SendSMSParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      return await this.circuitBreaker.execute(async () => {
        const phoneNumber = this.normalizePhoneNumber(params.to);
        
        if (!this.validatePhoneNumber(phoneNumber)) {
          throw new Error('Invalid phone number format');
        }

        if (params.message.length > 1600) {
          throw new Error('SMS message exceeds character limit (1600)');
        }

        const messageOptions: any = {
          body: params.message,
          to: phoneNumber,
          statusCallback: process.env.SMS_STATUS_WEBHOOK_URL
        };

        // Use messaging service SID if configured, otherwise use from number
        if (this.config.messagingServiceSid) {
          messageOptions.messagingServiceSid = this.config.messagingServiceSid;
        } else {
          messageOptions.from = this.config.fromNumber;
        }

        // Add media URLs for MMS if provided
        if (params.mediaUrls && params.mediaUrls.length > 0) {
          messageOptions.mediaUrl = params.mediaUrls;
        }

        const message = await this.client.messages.create(messageOptions);

        logger.info('SMS sent successfully', {
          messageId: params.messageId,
          twilioSid: message.sid,
          to: params.to,
          status: message.status,
          segmentCount: Math.ceil(params.message.length / 160)
        });

        return { 
          success: true, 
          messageId: message.sid 
        };
      });
    } catch (error: any) {
      logger.error('Failed to send SMS', {
        error: error.message,
        messageId: params.messageId,
        to: params.to,
        code: error.code
      });

      return { 
        success: false, 
        error: error.message || 'Failed to send SMS' 
      };
    }
  }

  async sendBatch(messages: SendSMSParams[]): Promise<Array<{ success: boolean; messageId?: string; error?: string }>> {
    // Twilio doesn't have native batch sending, so we'll send in parallel with rate limiting
    const results = [];
    const batchSize = 10; // Send 10 messages in parallel
    const delayBetweenBatches = 1000; // 1 second delay between batches

    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(message => this.send(message))
      );
      results.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + batchSize < messages.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    return results;
  }

  private normalizePhoneNumber(phone: string): string {
    // Remove all non-numeric characters
    let normalized = phone.replace(/\D/g, '');

    // Add country code if not present (assuming US for this example)
    if (normalized.length === 10) {
      normalized = '1' + normalized;
    }

    // Add + prefix for E.164 format
    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }

    return normalized;
  }

  private validatePhoneNumber(phone: string): boolean {
    // E.164 format validation
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phone);
  }

  async getMessageStatus(messageSid: string): Promise<{ status: string; errorCode?: string; errorMessage?: string }> {
    try {
      const message = await this.client.messages(messageSid).fetch();
      return {
        status: message.status,
        errorCode: message.errorCode?.toString(),
        errorMessage: message.errorMessage
      };
    } catch (error: any) {
      logger.error('Failed to get message status', {
        error: error.message,
        messageSid
      });
      throw error;
    }
  }

  async handleStatusCallback(payload: any): Promise<void> {
    // Handle Twilio status callbacks
    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = payload;

    logger.info('SMS status update received', {
      messageSid: MessageSid,
      status: MessageStatus,
      errorCode: ErrorCode,
      errorMessage: ErrorMessage
    });

    // You would typically update your message record here
    // and possibly publish events based on the status
  }

  getCircuitBreakerStatus() {
    return this.circuitBreaker.getMetrics();
  }
}