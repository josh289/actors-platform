import { gql } from 'graphql-tag';

export const typeDefs = gql`
  scalar Date
  scalar JSON

  type Message {
    id: ID!
    channel: NotificationChannel!
    recipient: String!
    template: String
    content: String
    status: MessageStatus!
    priority: Priority!
    sentAt: Date
    deliveredAt: Date
    failedAt: Date
    failureReason: String
    metadata: JSON
  }

  type EmailTemplate {
    id: ID!
    name: String!
    subject: String!
    htmlTemplate: String!
    textTemplate: String
    variables: [String!]!
    createdAt: Date!
    updatedAt: Date!
  }

  type NotificationPreferences {
    userId: ID!
    email: ChannelPreferences!
    sms: ChannelPreferences!
    push: ChannelPreferences!
    quietHours: QuietHours
  }

  type ChannelPreferences {
    enabled: Boolean!
    categories: JSON!
  }

  type QuietHours {
    enabled: Boolean!
    start: String!
    end: String!
    timezone: String!
  }

  type Campaign {
    id: ID!
    name: String!
    description: String!
    channel: NotificationChannel!
    template: String!
    audience: [String!]!
    scheduled: Date
    status: CampaignStatus!
    metrics: CampaignMetrics
    createdAt: Date!
    updatedAt: Date!
  }

  type CampaignMetrics {
    sent: Int!
    delivered: Int!
    opened: Int!
    clicked: Int!
    bounced: Int!
  }

  enum NotificationChannel {
    email
    sms
    push
  }

  enum MessageStatus {
    pending
    sent
    delivered
    failed
    bounced
  }

  enum Priority {
    low
    normal
    high
  }

  enum CampaignStatus {
    draft
    scheduled
    active
    completed
    cancelled
  }

  type SendResult {
    success: Boolean!
    messageId: String
    error: String
  }

  type BatchSendResult {
    successful: Int!
    failed: Int!
    results: [SendResult!]!
  }

  input SendEmailInput {
    to: String!
    template: String!
    data: JSON!
    priority: Priority
    scheduledFor: Date
  }

  input SendSMSInput {
    to: String!
    message: String!
    urgent: Boolean
  }

  input SendPushInput {
    userId: ID!
    title: String!
    body: String!
    data: JSON
    badge: Int
    sound: String
  }

  input PreferencesInput {
    email: ChannelPreferencesInput
    sms: ChannelPreferencesInput
    push: ChannelPreferencesInput
    quietHours: QuietHoursInput
  }

  input ChannelPreferencesInput {
    enabled: Boolean!
    categories: JSON!
  }

  input QuietHoursInput {
    enabled: Boolean!
    start: String!
    end: String!
    timezone: String!
  }

  input CreateCampaignInput {
    name: String!
    description: String!
    channel: NotificationChannel!
    template: String!
    audience: [String!]!
    scheduled: Date
  }

  input CreateTemplateInput {
    name: String!
    subject: String!
    htmlTemplate: String!
    textTemplate: String
    variables: [String!]!
  }

  type Query {
    # Messages
    userNotifications(userId: ID!, limit: Int, offset: Int): [Message!]!
    getMessage(id: ID!): Message
    messageStatus(messageId: ID!): MessageStatus!
    
    # Preferences
    notificationPreferences(userId: ID!): NotificationPreferences
    
    # Templates
    templates(channel: NotificationChannel): [EmailTemplate!]!
    template(id: ID!): EmailTemplate
    
    # Campaigns
    campaigns(status: CampaignStatus): [Campaign!]!
    campaign(id: ID!): Campaign
    campaignMetrics(campaignId: ID!): CampaignMetrics
    
    # Analytics
    notificationStats(userId: ID, timeRange: String): JSON
    deliveryRate(channel: NotificationChannel, timeRange: String): Float!
  }

  type Mutation {
    # Send notifications
    sendEmail(input: SendEmailInput!): SendResult!
    sendSMS(input: SendSMSInput!): SendResult!
    sendPush(input: SendPushInput!): SendResult!
    
    # Batch operations
    batchSendEmail(emails: [SendEmailInput!]!): BatchSendResult!
    
    # Preferences
    updateNotificationPreferences(
      userId: ID!
      preferences: PreferencesInput!
    ): NotificationPreferences!
    
    # Message operations
    markAsRead(messageId: ID!): Message!
    markAllAsRead(userId: ID!): Int!
    deleteNotification(messageId: ID!): Boolean!
    
    # Template management
    createTemplate(input: CreateTemplateInput!): EmailTemplate!
    updateTemplate(id: ID!, input: CreateTemplateInput!): EmailTemplate!
    deleteTemplate(id: ID!): Boolean!
    
    # Campaign management
    createCampaign(input: CreateCampaignInput!): Campaign!
    updateCampaign(id: ID!, input: CreateCampaignInput!): Campaign!
    startCampaign(id: ID!): Campaign!
    pauseCampaign(id: ID!): Campaign!
    cancelCampaign(id: ID!): Campaign!
    
    # Testing
    testEmail(templateId: ID!, testData: JSON!, recipient: String!): SendResult!
  }

  type Subscription {
    # Real-time notifications
    newNotification(userId: ID!): Message!
    notificationStatusUpdate(messageId: ID!): Message!
    
    # Campaign updates
    campaignUpdate(campaignId: ID!): Campaign!
  }
`;