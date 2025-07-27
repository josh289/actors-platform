import * as sgMail from '@sendgrid/mail';
import Handlebars from 'handlebars';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { logger } from '../utils/logger';

export interface EmailConfig {
  provider: 'sendgrid' | 'resend';
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  circuitBreaker?: {
    failureThreshold: number;
    timeout: number;
    resetTimeout: number;
  };
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  data?: Record<string, any>;
  messageId: string;
  attachments?: Array<{
    content: string;
    filename: string;
    type?: string;
    disposition?: string;
  }>;
}

export class EmailService {
  private circuitBreaker: CircuitBreaker;
  private compiledTemplates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor(private config: EmailConfig) {
    if (config.provider === 'sendgrid') {
      sgMail.setApiKey(config.apiKey);
    }

    this.circuitBreaker = new CircuitBreaker('email-service', {
      failureThreshold: config.circuitBreaker?.failureThreshold || 5,
      timeout: config.circuitBreaker?.timeout || 10000,
      resetTimeout: config.circuitBreaker?.resetTimeout || 60000,
      monitoringInterval: 300000 // 5 minutes
    });

    this.registerHelpers();
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('formatDate', (date: Date) => {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(date);
    });

    Handlebars.registerHelper('formatCurrency', (amount: number, currency = 'USD') => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency
      }).format(amount);
    });

    Handlebars.registerHelper('uppercase', (str: string) => {
      return str?.toUpperCase() || '';
    });

    Handlebars.registerHelper('lowercase', (str: string) => {
      return str?.toLowerCase() || '';
    });
  }

  async send(params: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      return await this.circuitBreaker.execute(async () => {
        const compiledHtml = this.compileTemplate(params.html, params.data || {});
        const compiledText = params.text ? this.compileTemplate(params.text, params.data || {}) : undefined;
        const compiledSubject = this.compileTemplate(params.subject, params.data || {});

        if (this.config.provider === 'sendgrid') {
          const msg = {
            to: params.to,
            from: {
              email: this.config.fromEmail,
              name: this.config.fromName
            },
            subject: compiledSubject,
            html: compiledHtml,
            text: compiledText,
            replyTo: this.config.replyTo,
            customArgs: {
              messageId: params.messageId
            },
            attachments: params.attachments
          };

          const [response] = await sgMail.send(msg);
          
          logger.info('Email sent successfully', {
            messageId: params.messageId,
            to: params.to,
            subject: compiledSubject,
            provider: 'sendgrid',
            statusCode: response.statusCode
          });

          return { success: true, messageId: params.messageId };
        }

        // Add support for other providers here (e.g., Resend)
        throw new Error(`Unsupported email provider: ${this.config.provider}`);
      });
    } catch (error: any) {
      logger.error('Failed to send email', {
        error: error.message,
        messageId: params.messageId,
        to: params.to,
        provider: this.config.provider
      });

      return { 
        success: false, 
        error: error.message || 'Failed to send email' 
      };
    }
  }

  async sendBatch(emails: SendEmailParams[]): Promise<Array<{ success: boolean; messageId?: string; error?: string }>> {
    const results = [];
    const batchSize = 100; // SendGrid batch limit

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(email => this.send(email))
      );
      results.push(...batchResults);
    }

    return results;
  }

  compileTemplate(template: string, data: Record<string, any>): string {
    try {
      let compiled = this.compiledTemplates.get(template);
      
      if (!compiled) {
        compiled = Handlebars.compile(template);
        this.compiledTemplates.set(template, compiled);
      }

      return compiled(data);
    } catch (error: any) {
      logger.error('Template compilation error', {
        error: error.message,
        template: template.substring(0, 100) // Log first 100 chars
      });
      throw new Error(`Template compilation failed: ${error.message}`);
    }
  }

  validateEmailAddress(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async verifyWebhook(): Promise<boolean> {
    // Implementation depends on provider
    if (this.config.provider === 'sendgrid') {
      // SendGrid webhook verification logic
      // This would use the webhook signing key to verify the signature
      return true; // Placeholder
    }
    
    return false;
  }

  getCircuitBreakerStatus() {
    return this.circuitBreaker.getMetrics();
  }
}