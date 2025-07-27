import { GraphQLResolveInfo } from 'graphql';
import { PubSub } from 'graphql-subscriptions';

const pubsub = new PubSub();

// Topics for real-time subscriptions
const SUBSCRIPTION_UPDATED = 'SUBSCRIPTION_UPDATED';
const PAYMENT_STATUS_CHANGED = 'PAYMENT_STATUS_CHANGED';

export const billingResolvers = {
  Query: {
    customer: async (_: any, { id }: { id: string }, context: any) => {
      const response = await context.billingActor.query({
        type: 'GET_CUSTOMER',
        payload: { customerId: id }
      });
      return response;
    },

    subscription: async (_: any, { id }: { id: string }, context: any) => {
      const response = await context.billingActor.query({
        type: 'GET_SUBSCRIPTION',
        payload: { subscriptionId: id }
      });
      return response;
    },

    customerSubscriptions: async (_: any, { customerId }: { customerId: string }, context: any) => {
      const customer = await context.billingActor.query({
        type: 'GET_CUSTOMER',
        payload: { customerId }
      });
      return customer?.subscriptions || [];
    },

    customerInvoices: async (_: any, { customerId, limit = 10 }: { customerId: string; limit?: number }, context: any) => {
      const response = await context.billingActor.query({
        type: 'LIST_INVOICES',
        payload: { customerId, limit }
      });
      return response || [];
    },

    availablePlans: async () => {
      // In production, this would fetch from configuration or database
      return [
        {
          id: 'basic_monthly',
          name: 'Basic',
          price: 9.99,
          currency: 'usd',
          interval: 'month',
          features: [
            '10 projects',
            '2 team members',
            'Basic support',
            '1GB storage'
          ],
          popular: false
        },
        {
          id: 'pro_monthly',
          name: 'Pro',
          price: 29.99,
          currency: 'usd',
          interval: 'month',
          features: [
            'Unlimited projects',
            '10 team members',
            'Priority support',
            '10GB storage',
            'Advanced analytics',
            'API access'
          ],
          popular: true
        },
        {
          id: 'enterprise_monthly',
          name: 'Enterprise',
          price: 99.99,
          currency: 'usd',
          interval: 'month',
          features: [
            'Unlimited everything',
            'Unlimited team members',
            'Dedicated support',
            'Unlimited storage',
            'Advanced analytics',
            'API access',
            'Custom integrations',
            'SLA guarantee'
          ],
          popular: false
        }
      ];
    }
  },

  Mutation: {
    createCustomer: async (_: any, args: any, context: any) => {
      try {
        const result = await context.billingActor.handle({
          type: 'CREATE_CUSTOMER',
          payload: args
        });
        
        return {
          success: result.success,
          customerId: result.response?.customerId,
          error: null
        };
      } catch (error) {
        return {
          success: false,
          customerId: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    },

    createSubscription: async (_: any, args: any, context: any) => {
      try {
        const result = await context.billingActor.handle({
          type: 'CREATE_SUBSCRIPTION',
          payload: args
        });
        
        // Publish update for real-time subscribers
        if (result.success) {
          pubsub.publish(SUBSCRIPTION_UPDATED, {
            subscriptionUpdated: result.response,
            customerId: args.customerId
          });
        }
        
        return {
          success: result.success,
          subscriptionId: result.response?.subscriptionId,
          clientSecret: result.response?.clientSecret,
          error: null
        };
      } catch (error) {
        return {
          success: false,
          subscriptionId: null,
          clientSecret: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    },

    updatePaymentMethod: async (_: any, args: any, context: any) => {
      try {
        const result = await context.billingActor.handle({
          type: 'UPDATE_PAYMENT_METHOD',
          payload: args
        });
        
        return {
          success: result.success,
          error: null
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    },

    cancelSubscription: async (_: any, args: any, context: any) => {
      try {
        const result = await context.billingActor.handle({
          type: 'CANCEL_SUBSCRIPTION',
          payload: {
            subscriptionId: args.id,
            immediately: args.immediately
          }
        });
        
        // Publish update for real-time subscribers
        if (result.success) {
          const effectiveDate = args.immediately 
            ? new Date().toISOString() 
            : result.response?.effectiveDate;
            
          pubsub.publish(SUBSCRIPTION_UPDATED, {
            subscriptionUpdated: result.response,
            customerId: result.response?.customerId
          });
        }
        
        return {
          success: result.success,
          effectiveDate: result.response?.effectiveDate,
          error: null
        };
      } catch (error) {
        return {
          success: false,
          effectiveDate: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    },

    processStripeWebhook: async (_: any, args: any, context: any) => {
      try {
        const result = await context.billingActor.handle({
          type: 'PROCESS_STRIPE_WEBHOOK',
          payload: args
        });
        
        // Check if this was a payment-related webhook
        if (args.event.type.includes('invoice.')) {
          pubsub.publish(PAYMENT_STATUS_CHANGED, {
            paymentStatusChanged: args.event.data.object,
            customerId: args.event.data.object.customer
          });
        }
        
        return result.success;
      } catch (error) {
        console.error('Webhook processing error:', error);
        return false;
      }
    }
  },

  Subscription: {
    subscriptionUpdated: {
      subscribe: (_: any, { customerId }: { customerId: string }) => {
        return pubsub.asyncIterator(SUBSCRIPTION_UPDATED);
      },
      resolve: (payload: any, { customerId }: { customerId: string }) => {
        // Only send updates for the requested customer
        if (payload.customerId === customerId) {
          return payload.subscriptionUpdated;
        }
        return null;
      }
    },

    paymentStatusChanged: {
      subscribe: (_: any, { customerId }: { customerId: string }) => {
        return pubsub.asyncIterator(PAYMENT_STATUS_CHANGED);
      },
      resolve: (payload: any, { customerId }: { customerId: string }) => {
        // Only send updates for the requested customer
        if (payload.customerId === customerId) {
          return payload.paymentStatusChanged;
        }
        return null;
      }
    }
  },

  // Type resolvers for custom scalars
  Customer: {
    createdAt: (customer: any) => new Date(customer.createdAt).toISOString(),
    updatedAt: (customer: any) => new Date(customer.updatedAt).toISOString(),
    metrics: (customer: any) => ({
      activeSubscriptions: customer.metrics?.activeSubscriptions || 0,
      totalRevenue: customer.metrics?.totalRevenue || 0
    })
  },

  Subscription: {
    currentPeriodStart: (subscription: any) => new Date(subscription.currentPeriodStart).toISOString(),
    currentPeriodEnd: (subscription: any) => new Date(subscription.currentPeriodEnd).toISOString()
  },

  Invoice: {
    dueDate: (invoice: any) => new Date(invoice.dueDate).toISOString(),
    paidAt: (invoice: any) => invoice.paidAt ? new Date(invoice.paidAt).toISOString() : null
  }
};