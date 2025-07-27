import { describe, it, expect, vi, beforeEach } from 'vitest';
import { billingResolvers } from '../../graphql/resolvers';
import { PubSub } from 'graphql-subscriptions';

// Mock PubSub
vi.mock('graphql-subscriptions', () => ({
  PubSub: vi.fn(() => ({
    publish: vi.fn(),
    asyncIterator: vi.fn(() => ({
      next: vi.fn(),
      return: vi.fn(),
      throw: vi.fn(),
      [Symbol.asyncIterator]: vi.fn()
    }))
  }))
}));

describe('Billing GraphQL Resolvers', () => {
  let mockContext: any;
  let mockPubSub: any;

  beforeEach(() => {
    mockPubSub = new PubSub();
    
    mockContext = {
      billingActor: {
        query: vi.fn(),
        handle: vi.fn()
      }
    };
  });

  describe('Query Resolvers', () => {
    describe('customer', () => {
      it('fetches customer by ID', async () => {
        const mockCustomer = {
          id: 'user_123',
          email: 'test@example.com',
          subscriptions: []
        };
        
        mockContext.billingActor.query.mockResolvedValue(mockCustomer);

        const result = await billingResolvers.Query.customer(
          {},
          { id: 'user_123' },
          mockContext
        );

        expect(mockContext.billingActor.query).toHaveBeenCalledWith({
          type: 'GET_CUSTOMER',
          payload: { customerId: 'user_123' }
        });
        expect(result).toEqual(mockCustomer);
      });
    });

    describe('subscription', () => {
      it('fetches subscription by ID', async () => {
        const mockSubscription = {
          id: 'sub_123',
          status: 'active'
        };
        
        mockContext.billingActor.query.mockResolvedValue(mockSubscription);

        const result = await billingResolvers.Query.subscription(
          {},
          { id: 'sub_123' },
          mockContext
        );

        expect(mockContext.billingActor.query).toHaveBeenCalledWith({
          type: 'GET_SUBSCRIPTION',
          payload: { subscriptionId: 'sub_123' }
        });
        expect(result).toEqual(mockSubscription);
      });
    });

    describe('customerSubscriptions', () => {
      it('fetches customer subscriptions', async () => {
        const mockCustomer = {
          id: 'user_123',
          subscriptions: [
            { id: 'sub_1', status: 'active' },
            { id: 'sub_2', status: 'canceled' }
          ]
        };
        
        mockContext.billingActor.query.mockResolvedValue(mockCustomer);

        const result = await billingResolvers.Query.customerSubscriptions(
          {},
          { customerId: 'user_123' },
          mockContext
        );

        expect(result).toEqual(mockCustomer.subscriptions);
      });

      it('returns empty array when customer not found', async () => {
        mockContext.billingActor.query.mockResolvedValue(null);

        const result = await billingResolvers.Query.customerSubscriptions(
          {},
          { customerId: 'nonexistent' },
          mockContext
        );

        expect(result).toEqual([]);
      });
    });

    describe('customerInvoices', () => {
      it('fetches customer invoices with default limit', async () => {
        const mockInvoices = [
          { id: 'inv_1', amount: 2999 },
          { id: 'inv_2', amount: 2999 }
        ];
        
        mockContext.billingActor.query.mockResolvedValue(mockInvoices);

        const result = await billingResolvers.Query.customerInvoices(
          {},
          { customerId: 'user_123' },
          mockContext
        );

        expect(mockContext.billingActor.query).toHaveBeenCalledWith({
          type: 'LIST_INVOICES',
          payload: { customerId: 'user_123', limit: 10 }
        });
        expect(result).toEqual(mockInvoices);
      });

      it('respects custom limit', async () => {
        mockContext.billingActor.query.mockResolvedValue([]);

        await billingResolvers.Query.customerInvoices(
          {},
          { customerId: 'user_123', limit: 20 },
          mockContext
        );

        expect(mockContext.billingActor.query).toHaveBeenCalledWith({
          type: 'LIST_INVOICES',
          payload: { customerId: 'user_123', limit: 20 }
        });
      });
    });

    describe('availablePlans', () => {
      it('returns hardcoded plans', async () => {
        const plans = await billingResolvers.Query.availablePlans();

        expect(plans).toHaveLength(3);
        expect(plans[0]).toMatchObject({
          id: 'basic_monthly',
          name: 'Basic',
          price: 9.99
        });
        expect(plans[1]).toMatchObject({
          id: 'pro_monthly',
          name: 'Pro',
          popular: true
        });
      });
    });
  });

  describe('Mutation Resolvers', () => {
    describe('createCustomer', () => {
      it('creates customer successfully', async () => {
        mockContext.billingActor.handle.mockResolvedValue({
          success: true,
          response: { customerId: 'user_123' }
        });

        const result = await billingResolvers.Mutation.createCustomer(
          {},
          {
            userId: 'user_123',
            email: 'test@example.com',
            metadata: { source: 'signup' }
          },
          mockContext
        );

        expect(mockContext.billingActor.handle).toHaveBeenCalledWith({
          type: 'CREATE_CUSTOMER',
          payload: {
            userId: 'user_123',
            email: 'test@example.com',
            metadata: { source: 'signup' }
          }
        });
        expect(result).toEqual({
          success: true,
          customerId: 'user_123',
          error: null
        });
      });

      it('handles creation failure', async () => {
        mockContext.billingActor.handle.mockRejectedValue(new Error('Customer exists'));

        const result = await billingResolvers.Mutation.createCustomer(
          {},
          { userId: 'user_123', email: 'test@example.com' },
          mockContext
        );

        expect(result).toEqual({
          success: false,
          customerId: null,
          error: 'Customer exists'
        });
      });
    });

    describe('createSubscription', () => {
      it('creates subscription and publishes update', async () => {
        mockContext.billingActor.handle.mockResolvedValue({
          success: true,
          response: {
            subscriptionId: 'sub_123',
            clientSecret: 'secret_123'
          }
        });

        const result = await billingResolvers.Mutation.createSubscription(
          {},
          {
            customerId: 'user_123',
            priceId: 'price_pro',
            trialDays: 14
          },
          mockContext
        );

        expect(result).toEqual({
          success: true,
          subscriptionId: 'sub_123',
          clientSecret: 'secret_123',
          error: null
        });

        expect(mockPubSub.publish).toHaveBeenCalledWith(
          'SUBSCRIPTION_UPDATED',
          expect.objectContaining({
            customerId: 'user_123'
          })
        );
      });
    });

    describe('updatePaymentMethod', () => {
      it('updates payment method successfully', async () => {
        mockContext.billingActor.handle.mockResolvedValue({
          success: true
        });

        const result = await billingResolvers.Mutation.updatePaymentMethod(
          {},
          {
            customerId: 'user_123',
            paymentMethodId: 'pm_123'
          },
          mockContext
        );

        expect(result).toEqual({
          success: true,
          error: null
        });
      });
    });

    describe('cancelSubscription', () => {
      it('cancels subscription immediately', async () => {
        mockContext.billingActor.handle.mockResolvedValue({
          success: true,
          response: {
            customerId: 'user_123',
            effectiveDate: new Date().toISOString()
          }
        });

        const result = await billingResolvers.Mutation.cancelSubscription(
          {},
          { id: 'sub_123', immediately: true },
          mockContext
        );

        expect(mockContext.billingActor.handle).toHaveBeenCalledWith({
          type: 'CANCEL_SUBSCRIPTION',
          payload: {
            subscriptionId: 'sub_123',
            immediately: true
          }
        });
        expect(result.success).toBe(true);
        expect(mockPubSub.publish).toHaveBeenCalled();
      });

      it('cancels subscription at period end', async () => {
        const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        mockContext.billingActor.handle.mockResolvedValue({
          success: true,
          response: {
            customerId: 'user_123',
            effectiveDate: futureDate
          }
        });

        const result = await billingResolvers.Mutation.cancelSubscription(
          {},
          { id: 'sub_123' },
          mockContext
        );

        expect(mockContext.billingActor.handle).toHaveBeenCalledWith({
          type: 'CANCEL_SUBSCRIPTION',
          payload: {
            subscriptionId: 'sub_123',
            immediately: false
          }
        });
        expect(result.effectiveDate).toBe(futureDate);
      });
    });

    describe('processStripeWebhook', () => {
      it('processes webhook successfully', async () => {
        const webhookEvent = {
          type: 'invoice.payment_succeeded',
          data: {
            object: {
              customer: 'cus_123',
              amount: 2999
            }
          }
        };

        mockContext.billingActor.handle.mockResolvedValue({
          success: true
        });

        const result = await billingResolvers.Mutation.processStripeWebhook(
          {},
          {
            event: webhookEvent,
            signature: 'sig_123'
          },
          mockContext
        );

        expect(result).toBe(true);
        expect(mockPubSub.publish).toHaveBeenCalledWith(
          'PAYMENT_STATUS_CHANGED',
          expect.objectContaining({
            customerId: 'cus_123'
          })
        );
      });

      it('handles webhook processing failure', async () => {
        mockContext.billingActor.handle.mockRejectedValue(new Error('Invalid signature'));

        const result = await billingResolvers.Mutation.processStripeWebhook(
          {},
          { event: {}, signature: 'invalid' },
          mockContext
        );

        expect(result).toBe(false);
      });
    });
  });

  describe('Subscription Resolvers', () => {
    describe('subscriptionUpdated', () => {
      it('subscribes to subscription updates', () => {
        const subscription = billingResolvers.Subscription.subscriptionUpdated.subscribe(
          {},
          { customerId: 'user_123' }
        );

        expect(mockPubSub.asyncIterator).toHaveBeenCalledWith('SUBSCRIPTION_UPDATED');
      });

      it('filters updates by customer ID', () => {
        const payload = {
          customerId: 'user_123',
          subscriptionUpdated: { id: 'sub_123', status: 'active' }
        };

        const result = billingResolvers.Subscription.subscriptionUpdated.resolve(
          payload,
          { customerId: 'user_123' }
        );

        expect(result).toEqual({ id: 'sub_123', status: 'active' });
      });

      it('returns null for different customer', () => {
        const payload = {
          customerId: 'user_456',
          subscriptionUpdated: { id: 'sub_456' }
        };

        const result = billingResolvers.Subscription.subscriptionUpdated.resolve(
          payload,
          { customerId: 'user_123' }
        );

        expect(result).toBeNull();
      });
    });

    describe('paymentStatusChanged', () => {
      it('subscribes to payment status updates', () => {
        const subscription = billingResolvers.Subscription.paymentStatusChanged.subscribe(
          {},
          { customerId: 'user_123' }
        );

        expect(mockPubSub.asyncIterator).toHaveBeenCalledWith('PAYMENT_STATUS_CHANGED');
      });
    });
  });

  describe('Type Resolvers', () => {
    describe('Customer', () => {
      it('formats timestamps correctly', () => {
        const customer = {
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        const createdAt = billingResolvers.Customer.createdAt(customer);
        const updatedAt = billingResolvers.Customer.updatedAt(customer);

        expect(createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });

      it('provides default metrics', () => {
        const customer = {};
        const metrics = billingResolvers.Customer.metrics(customer);

        expect(metrics).toEqual({
          activeSubscriptions: 0,
          totalRevenue: 0
        });
      });
    });

    describe('Subscription', () => {
      it('formats period timestamps', () => {
        const subscription = {
          currentPeriodStart: Date.now(),
          currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000
        };

        const start = billingResolvers.Subscription.currentPeriodStart(subscription);
        const end = billingResolvers.Subscription.currentPeriodEnd(subscription);

        expect(start).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(end).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });
    });

    describe('Invoice', () => {
      it('formats dates correctly', () => {
        const invoice = {
          dueDate: Date.now(),
          paidAt: Date.now()
        };

        const dueDate = billingResolvers.Invoice.dueDate(invoice);
        const paidAt = billingResolvers.Invoice.paidAt(invoice);

        expect(dueDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(paidAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });

      it('handles null paidAt', () => {
        const invoice = {
          dueDate: Date.now(),
          paidAt: null
        };

        const paidAt = billingResolvers.Invoice.paidAt(invoice);
        expect(paidAt).toBeNull();
      });
    });
  });
});