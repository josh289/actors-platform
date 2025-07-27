export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlTemplate: string;
  textTemplate?: string;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  channel: 'email' | 'sms' | 'push';
  recipient: string;
  template?: string;
  content?: string;
  status: MessageStatus;
  priority: 'low' | 'normal' | 'high';
  createdAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  metadata?: Record<string, any>;
}

export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  BOUNCED = 'bounced',
  READ = 'read'
}

export interface UserPreferences {
  userId: string;
  email: {
    enabled: boolean;
    categories: Record<string, boolean>;
  };
  sms: {
    enabled: boolean;
    categories: Record<string, boolean>;
  };
  push: {
    enabled: boolean;
    categories: Record<string, boolean>;
  };
  quietHours?: {
    enabled: boolean;
    start: string; // HH:mm format
    end: string;   // HH:mm format
    timezone: string;
  };
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  channel: 'email' | 'sms' | 'push';
  template: string;
  audience: string[];
  scheduled?: Date;
  status: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';
  metrics?: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationState {
  templates: Record<string, EmailTemplate>;
  messages: Record<string, Message>;
  preferences: Record<string, UserPreferences>;
  campaigns: Record<string, Campaign>;
}