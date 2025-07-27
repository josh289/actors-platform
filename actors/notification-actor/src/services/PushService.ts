import * as admin from 'firebase-admin';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { logger } from '../utils/logger';

export interface PushConfig {
  provider: 'firebase';
  serviceAccount: any;
  databaseURL?: string;
  circuitBreaker?: {
    failureThreshold: number;
    timeout: number;
    resetTimeout: number;
  };
}

export interface SendPushParams {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  messageId: string;
  badge?: number;
  sound?: string;
  icon?: string;
  image?: string;
  clickAction?: string;
  priority?: 'normal' | 'high';
}

export class PushService {
  private app: admin.app.App;
  private messaging: admin.messaging.Messaging;
  private circuitBreaker: CircuitBreaker;

  constructor(private readonly config: PushConfig) {
    if (config.provider === 'firebase') {
      this.app = admin.initializeApp({
        credential: admin.credential.cert(config.serviceAccount),
        databaseURL: config.databaseURL
      });
      this.messaging = admin.messaging(this.app);
    } else {
      throw new Error(`Unsupported push provider: ${config.provider}`);
    }

    this.circuitBreaker = new CircuitBreaker('push-service', {
      failureThreshold: config.circuitBreaker?.failureThreshold || 5,
      timeout: config.circuitBreaker?.timeout || 10000,
      resetTimeout: config.circuitBreaker?.resetTimeout || 60000,
      monitoringInterval: 300000 // 5 minutes
    });
  }

  async send(params: SendPushParams): Promise<{ success: boolean; messageId?: string; error?: string; failedTokens?: string[] }> {
    try {
      return await this.circuitBreaker.execute(async () => {
        // Filter out invalid tokens
        const validTokens = params.tokens.filter(token => this.validateToken(token));
        
        if (validTokens.length === 0) {
          throw new Error('No valid device tokens provided');
        }

        const message: admin.messaging.MulticastMessage = {
          tokens: validTokens,
          notification: {
            title: params.title,
            body: params.body,
            imageUrl: params.image
          },
          data: {
            ...params.data,
            messageId: params.messageId,
            clickAction: params.clickAction || ''
          },
          android: {
            priority: params.priority === 'high' ? 'high' : 'normal',
            notification: {
              icon: params.icon || 'ic_notification',
              sound: params.sound || 'default',
              clickAction: params.clickAction || undefined
            }
          },
          apns: {
            payload: {
              aps: {
                alert: {
                  title: params.title,
                  body: params.body
                },
                badge: params.badge,
                sound: params.sound || 'default'
              }
            }
          },
          webpush: {
            notification: {
              title: params.title,
              body: params.body,
              icon: params.icon,
              image: params.image
            },
            fcmOptions: {
              link: params.clickAction
            }
          }
        };

        const response = await this.messaging.sendMulticast(message);

        const failedTokens: string[] = [];
        if (response.failureCount > 0) {
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              failedTokens.push(validTokens[idx]);
              logger.warn('Failed to send push to token', {
                token: validTokens[idx],
                error: resp.error?.message,
                code: resp.error?.code
              });
            }
          });
        }

        logger.info('Push notifications sent', {
          messageId: params.messageId,
          successCount: response.successCount,
          failureCount: response.failureCount,
          totalTokens: validTokens.length
        });

        return {
          success: response.successCount > 0,
          messageId: params.messageId,
          failedTokens: failedTokens.length > 0 ? failedTokens : undefined
        };
      });
    } catch (error: any) {
      logger.error('Failed to send push notification', {
        error: error.message,
        messageId: params.messageId,
        tokenCount: params.tokens.length
      });

      return { 
        success: false, 
        error: error.message || 'Failed to send push notification' 
      };
    }
  }

  async sendTopic(topic: string, params: Omit<SendPushParams, 'tokens'>): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      return await this.circuitBreaker.execute(async () => {
        const message: admin.messaging.Message = {
          topic: topic,
          notification: {
            title: params.title,
            body: params.body,
            imageUrl: params.image
          },
          data: {
            ...params.data,
            messageId: params.messageId
          }
        };

        const response = await this.messaging.send(message);

        logger.info('Topic push notification sent', {
          messageId: params.messageId,
          topic,
          firebaseMessageId: response
        });

        return { 
          success: true, 
          messageId: response 
        };
      });
    } catch (error: any) {
      logger.error('Failed to send topic push notification', {
        error: error.message,
        messageId: params.messageId,
        topic
      });

      return { 
        success: false, 
        error: error.message || 'Failed to send topic push notification' 
      };
    }
  }

  async subscribeToTopic(tokens: string[], topic: string): Promise<{ success: boolean; errors?: any[] }> {
    try {
      const response = await this.messaging.subscribeToTopic(tokens, topic);
      
      if (response.errors.length > 0) {
        logger.warn('Some tokens failed to subscribe to topic', {
          topic,
          errorCount: response.errors.length,
          errors: response.errors
        });
      }

      return {
        success: response.successCount > 0,
        errors: response.errors.length > 0 ? response.errors : undefined
      };
    } catch (error: any) {
      logger.error('Failed to subscribe to topic', {
        error: error.message,
        topic,
        tokenCount: tokens.length
      });
      throw error;
    }
  }

  async unsubscribeFromTopic(tokens: string[], topic: string): Promise<{ success: boolean; errors?: any[] }> {
    try {
      const response = await this.messaging.unsubscribeFromTopic(tokens, topic);
      
      if (response.errors.length > 0) {
        logger.warn('Some tokens failed to unsubscribe from topic', {
          topic,
          errorCount: response.errors.length,
          errors: response.errors
        });
      }

      return {
        success: response.successCount > 0,
        errors: response.errors.length > 0 ? response.errors : undefined
      };
    } catch (error: any) {
      logger.error('Failed to unsubscribe from topic', {
        error: error.message,
        topic,
        tokenCount: tokens.length
      });
      throw error;
    }
  }

  private validateToken(token: string): boolean {
    // Basic FCM token validation
    // FCM tokens are typically 152+ characters long
    return Boolean(token && token.length > 100 && /^[a-zA-Z0-9\-_:]+$/.test(token));
  }

  getCircuitBreakerStatus() {
    return this.circuitBreaker.getMetrics();
  }

  async cleanup(): Promise<void> {
    await this.app.delete();
  }
}