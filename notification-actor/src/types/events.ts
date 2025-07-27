import { z } from 'zod';

// Command Events
export const SendEmailCommand = z.object({
  type: z.literal('SEND_EMAIL'),
  payload: z.object({
    to: z.string().email(),
    template: z.string(),
    data: z.record(z.any()),
    priority: z.enum(['low', 'normal', 'high']).optional().default('normal')
  })
});

export const SendSMSCommand = z.object({
  type: z.literal('SEND_SMS'),
  payload: z.object({
    to: z.string().regex(/^\+?[1-9]\d{1,14}$/), // E.164 format
    message: z.string().max(160),
    urgent: z.boolean().optional().default(false)
  })
});

export const SendPushCommand = z.object({
  type: z.literal('SEND_PUSH'),
  payload: z.object({
    userId: z.string(),
    title: z.string(),
    body: z.string(),
    data: z.record(z.any()).optional()
  })
});

export const UpdatePreferencesCommand = z.object({
  type: z.literal('UPDATE_PREFERENCES'),
  payload: z.object({
    userId: z.string(),
    preferences: z.object({
      email: z.object({
        enabled: z.boolean(),
        categories: z.record(z.boolean())
      }).optional(),
      sms: z.object({
        enabled: z.boolean(),
        categories: z.record(z.boolean())
      }).optional(),
      push: z.object({
        enabled: z.boolean(),
        categories: z.record(z.boolean())
      }).optional(),
      quietHours: z.object({
        enabled: z.boolean(),
        start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        timezone: z.string()
      }).optional()
    })
  })
});

// Query Events
export const GetMessageStatusQuery = z.object({
  type: z.literal('GET_MESSAGE_STATUS'),
  payload: z.object({
    messageId: z.string()
  })
});

// Notification Events (Published)
export const MessageSentNotification = z.object({
  type: z.literal('MESSAGE_SENT'),
  payload: z.object({
    messageId: z.string(),
    channel: z.enum(['email', 'sms', 'push']),
    recipient: z.string(),
    template: z.string().optional(),
    timestamp: z.number()
  })
});

export const MessageDeliveredNotification = z.object({
  type: z.literal('MESSAGE_DELIVERED'),
  payload: z.object({
    messageId: z.string(),
    deliveredAt: z.number()
  })
});

export const MessageBouncedNotification = z.object({
  type: z.literal('MESSAGE_BOUNCED'),
  payload: z.object({
    messageId: z.string(),
    reason: z.string(),
    timestamp: z.number()
  })
});

// Response Types
export const SendResponse = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
  error: z.string().optional()
});

export const MessageStatusResponse = z.object({
  status: z.enum(['pending', 'sent', 'delivered', 'failed', 'bounced', 'read']),
  sentAt: z.date().optional(),
  deliveredAt: z.date().optional(),
  failedAt: z.date().optional(),
  failureReason: z.string().optional()
});

export const PreferencesResponse = z.object({
  success: z.boolean(),
  preferences: z.any().optional(),
  error: z.string().optional()
});

// Type exports
export type SendEmailCommand = z.infer<typeof SendEmailCommand>;
export type SendSMSCommand = z.infer<typeof SendSMSCommand>;
export type SendPushCommand = z.infer<typeof SendPushCommand>;
export type UpdatePreferencesCommand = z.infer<typeof UpdatePreferencesCommand>;
export type GetMessageStatusQuery = z.infer<typeof GetMessageStatusQuery>;
export type MessageSentNotification = z.infer<typeof MessageSentNotification>;
export type MessageDeliveredNotification = z.infer<typeof MessageDeliveredNotification>;
export type MessageBouncedNotification = z.infer<typeof MessageBouncedNotification>;
export type SendResponse = z.infer<typeof SendResponse>;
export type MessageStatusResponse = z.infer<typeof MessageStatusResponse>;
export type PreferencesResponse = z.infer<typeof PreferencesResponse>;