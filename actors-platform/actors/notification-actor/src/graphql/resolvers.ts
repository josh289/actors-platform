import { NotificationActor } from '../actor/NotificationActor';
import { ActorContext } from '../types/actor';
import { MessageStatus } from '../types';

interface ResolverContext {
  actor: NotificationActor;
  actorContext: ActorContext;
  userId?: string;
}

export const resolvers = {
  Query: {
    // Messages
    userNotifications: async (
      _: any,
      { userId, limit = 20, offset = 0 }: { userId: string; limit?: number; offset?: number },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      const userMessages = Object.values(state.messages)
        .filter(msg => msg.recipient === userId)
        .sort((a, b) => (b.sentAt?.getTime() || 0) - (a.sentAt?.getTime() || 0))
        .slice(offset, offset + limit);
      
      return userMessages;
    },

    getMessage: async (
      _: any,
      { id }: { id: string },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      return state.messages[id] || null;
    },

    messageStatus: async (
      _: any,
      { messageId }: { messageId: string },
      context: ResolverContext
    ) => {
      const result = await context.actor.handleEvent({
        type: 'GET_MESSAGE_STATUS',
        payload: { messageId }
      });
      return result.status;
    },

    // Preferences
    notificationPreferences: async (
      _: any,
      { userId }: { userId: string },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      return state.preferences[userId] || null;
    },

    // Templates
    templates: async (
      _: any,
      { channel }: { channel?: string },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      let templates = Object.values(state.templates);
      
      if (channel) {
        templates = templates.filter(t => (t as any).metadata?.channel === channel);
      }
      
      return templates;
    },

    template: async (
      _: any,
      { id }: { id: string },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      return state.templates[id] || null;
    },

    // Campaigns
    campaigns: async (
      _: any,
      { status }: { status?: string },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      let campaigns = Object.values(state.campaigns);
      
      if (status) {
        campaigns = campaigns.filter(c => c.status === status);
      }
      
      return campaigns;
    },

    campaign: async (
      _: any,
      { id }: { id: string },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      return state.campaigns[id] || null;
    },

    campaignMetrics: async (
      _: any,
      { campaignId }: { campaignId: string },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      const campaign = state.campaigns[campaignId];
      return campaign?.metrics || null;
    },

    // Analytics
    notificationStats: async (
      _: any,
      { userId: _userId }: { userId?: string; timeRange?: string },
      _context: ResolverContext
    ) => {
      // This would aggregate statistics from the state
      // For now, returning mock data
      return {
        totalSent: 150,
        totalDelivered: 145,
        totalFailed: 5,
        channels: {
          email: { sent: 100, delivered: 98, failed: 2 },
          sms: { sent: 30, delivered: 29, failed: 1 },
          push: { sent: 20, delivered: 18, failed: 2 }
        }
      };
    },

    deliveryRate: async (
      _: any,
      { channel }: { channel?: string; timeRange?: string },
      context: ResolverContext
    ) => {
      // Calculate delivery rate from state
      const state = context.actor.getState();
      const messages = Object.values(state.messages);
      
      let filteredMessages = messages;
      if (channel) {
        filteredMessages = messages.filter(m => m.channel === channel);
      }
      
      const delivered = filteredMessages.filter(m => m.status === MessageStatus.DELIVERED).length;
      const total = filteredMessages.length;
      
      return total > 0 ? delivered / total : 0;
    }
  },

  Mutation: {
    // Send notifications
    sendEmail: async (
      _: any,
      { input }: { input: any },
      context: ResolverContext
    ) => {
      return await context.actor.handleEvent({
        type: 'SEND_EMAIL',
        payload: input
      });
    },

    sendSMS: async (
      _: any,
      { input }: { input: any },
      context: ResolverContext
    ) => {
      return await context.actor.handleEvent({
        type: 'SEND_SMS',
        payload: input
      });
    },

    sendPush: async (
      _: any,
      { input }: { input: any },
      context: ResolverContext
    ) => {
      return await context.actor.handleEvent({
        type: 'SEND_PUSH',
        payload: input
      });
    },

    // Batch operations
    batchSendEmail: async (
      _: any,
      { emails }: { emails: any[] },
      context: ResolverContext
    ) => {
      const results = await Promise.all(
        emails.map(email => 
          context.actor.handleEvent({
            type: 'SEND_EMAIL',
            payload: email
          })
        )
      );
      
      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;
      
      return {
        successful,
        failed,
        results
      };
    },

    // Preferences
    updateNotificationPreferences: async (
      _: any,
      { userId, preferences }: { userId: string; preferences: any },
      context: ResolverContext
    ) => {
      const result = await context.actor.handleEvent({
        type: 'UPDATE_PREFERENCES',
        payload: { userId, preferences }
      });
      
      return result.preferences;
    },

    // Message operations
    markAsRead: async (
      _: any,
      { messageId }: { messageId: string },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      const message = state.messages[messageId];
      
      if (message) {
        message.status = MessageStatus.READ;
        context.actor.setState(state);
      }
      
      return message;
    },

    markAllAsRead: async (
      _: any,
      { userId }: { userId: string },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      let count = 0;
      
      Object.values(state.messages).forEach(message => {
        if (message.recipient === userId && message.status !== MessageStatus.READ) {
          message.status = MessageStatus.READ;
          count++;
        }
      });
      
      context.actor.setState(state);
      return count;
    },

    deleteNotification: async (
      _: any,
      { messageId }: { messageId: string },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      const existed = !!state.messages[messageId];
      
      if (existed) {
        delete state.messages[messageId];
        context.actor.setState(state);
      }
      
      return existed;
    },

    // Template management
    createTemplate: async (
      _: any,
      { input }: { input: any },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      const template = {
        ...input,
        id: `template_${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      state.templates[template.id] = template;
      context.actor.setState(state);
      
      return template;
    },

    updateTemplate: async (
      _: any,
      { id, input }: { id: string; input: any },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      const template = state.templates[id];
      
      if (template) {
        Object.assign(template, input, { updatedAt: new Date() });
        context.actor.setState(state);
      }
      
      return template;
    },

    deleteTemplate: async (
      _: any,
      { id }: { id: string },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      const existed = !!state.templates[id];
      
      if (existed) {
        delete state.templates[id];
        context.actor.setState(state);
      }
      
      return existed;
    },

    // Campaign management
    createCampaign: async (
      _: any,
      { input }: { input: any },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      const campaign = {
        ...input,
        id: `campaign_${Date.now()}`,
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
        metrics: {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          bounced: 0
        }
      };
      
      state.campaigns[campaign.id] = campaign;
      context.actor.setState(state);
      
      return campaign;
    },

    updateCampaign: async (
      _: any,
      { id, input }: { id: string; input: any },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      const campaign = state.campaigns[id];
      
      if (campaign) {
        Object.assign(campaign, input, { updatedAt: new Date() });
        context.actor.setState(state);
      }
      
      return campaign;
    },

    startCampaign: async (
      _: any,
      { id }: { id: string },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      const campaign = state.campaigns[id];
      
      if (campaign && campaign.status === 'draft') {
        campaign.status = 'active';
        campaign.updatedAt = new Date();
        context.actor.setState(state);
        
        // Here you would trigger the actual campaign execution
      }
      
      return campaign;
    },

    pauseCampaign: async (
      _: any,
      { id }: { id: string },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      const campaign = state.campaigns[id];
      
      if (campaign && campaign.status === 'active') {
        campaign.status = 'scheduled';
        campaign.updatedAt = new Date();
        context.actor.setState(state);
      }
      
      return campaign;
    },

    cancelCampaign: async (
      _: any,
      { id }: { id: string },
      context: ResolverContext
    ) => {
      const state = context.actor.getState();
      const campaign = state.campaigns[id];
      
      if (campaign && ['draft', 'scheduled', 'active'].includes(campaign.status)) {
        campaign.status = 'cancelled';
        campaign.updatedAt = new Date();
        context.actor.setState(state);
      }
      
      return campaign;
    },

    // Testing
    testEmail: async (
      _: any,
      { templateId, testData, recipient }: { templateId: string; testData: any; recipient: string },
      context: ResolverContext
    ) => {
      return await context.actor.handleEvent({
        type: 'SEND_EMAIL',
        payload: {
          to: recipient,
          template: templateId,
          data: testData,
          priority: 'normal'
        }
      });
    }
  },

  Subscription: {
    // Real-time notifications
    newNotification: {
      subscribe: async () => {
        // Implementation would use GraphQL subscriptions
        // This is a placeholder
        return {
          [Symbol.asyncIterator]: async function* () {
            // Yield new notifications as they come in
            yield;
          }
        };
      }
    },

    notificationStatusUpdate: {
      subscribe: async () => {
        // Implementation would use GraphQL subscriptions
        // This is a placeholder
        return {
          [Symbol.asyncIterator]: async function* () {
            // Yield status updates
            yield;
          }
        };
      }
    },

    campaignUpdate: {
      subscribe: async () => {
        // Implementation would use GraphQL subscriptions
        // This is a placeholder
        return {
          [Symbol.asyncIterator]: async function* () {
            // Yield campaign updates
            yield;
          }
        };
      }
    }
  },

  // Custom scalar resolvers
  Date: {
    __parseValue(value: any) {
      return new Date(value);
    },
    __serialize(value: any) {
      return value instanceof Date ? value.toISOString() : null;
    },
    __parseLiteral(ast: any) {
      if (ast.kind === 'StringValue') {
        return new Date(ast.value);
      }
      return null;
    }
  },

  JSON: {
    __parseValue(value: any) {
      return value;
    },
    __serialize(value: any) {
      return value;
    },
    __parseLiteral(ast: any) {
      return ast.value;
    }
  }
};