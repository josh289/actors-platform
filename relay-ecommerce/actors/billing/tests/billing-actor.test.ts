import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BillingActor } from '../index';
import {
  createMockStripe,
  createMockEventBus,
  createTestEvent,
  createTestCustomer,
  createTestSubscription,
  MockRelayActor
} from './test-utils';

// Mock the base class
vi.mock('../../../runtime/actor-base', () => ({
  RelayActor: MockRelayActor
}));

// Mock Stripe
vi.mock('stripe', () => ({
  default: vi.fn(() => createMockStripe())
}));

describe('BillingActor', () => {
  let actor: BillingActor;
  let eventBus: any;
  let mockStripe: any;

  beforeEach(async () => {
    eventBus = createMockEventBus();
    actor = new BillingActor(
      {
        name: 'billing',
        version: '1.0.0',
        catalog: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test'
        }
      },
      eventBus
    );
    
    await actor.initialize();
    
    // Get access to the mocked Stripe instance
    mockStripe = (actor as any).stripe;
  });

  describe('CREATE_CUSTOMER', () => {
    it('should create a new customer successfully', async () => {
      const event = createTestEvent('CREATE_CUSTOMER', {
        userId: 'user_123',
        email: 'test@example.com',
        metadata: { source: 'signup' }
      });

      const result = await actor.handle(event);

      expect(result.success).toBe(true);
      expect(result.response.customerId).toBe('user_123');
      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        metadata: { userId: 'user_123', source: 'signup' }
      });
      
      // Check that CUSTOMER_CREATED event was emitted
      expect(result.events).toHaveLength(2);
      expect(result.events[0].type).toBe('CREATE_CUSTOMER_COMPLETED');
      expect(result.events[1].type).toBe('SEND_EMAIL');
      expect(result.events[1].payload.template).toBe('billing-welcome');
    });

    it('should fail if customer already exists', async () => {
      // Create first customer
      await actor.handle(createTestEvent('CREATE_CUSTOMER', {
        userId: 'user_123',
        email: 'test@example.com'
      }));

      // Try to create same customer again
      const event = createTestEvent('CREATE_CUSTOMER', {
        userId: 'user_123',
        email: 'test@example.com'
      });

      await expect(actor.handle(event)).rejects.toThrow('Customer already exists');
    });
  });

  describe('CREATE_SUBSCRIPTION', () => {
    beforeEach(async () => {
      // Create a customer first
      await actor.handle(createTestEvent('CREATE_CUSTOMER', {
        userId: 'user_123',
        email: 'test@example.com'
      }));
    });

    it('should create a subscription successfully', async () => {
      const event = createTestEvent('CREATE_SUBSCRIPTION', {
        customerId: 'user_123',
        priceId: 'price_pro_monthly',
        trialDays: 14
      });

      const result = await actor.handle(event);

      expect(result.success).toBe(true);
      expect(result.response.subscriptionId).toBeDefined();
      expect(result.response.clientSecret).toContain('pi_');
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith({
        customer: expect.stringContaining('cus_'),
        items: [{ price: 'price_pro_monthly' }],
        trial_period_days: 14,
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent']
      });

      // Check events
      expect(result.events).toContainEqual(
        expect.objectContaining({
          type: 'CREATE_SUBSCRIPTION_COMPLETED',
          payload: expect.objectContaining({
            customerId: 'user_123',
            planId: 'price_pro_monthly',
            trialDays: 14
          })
        })
      );
    });

    it('should fail if customer does not exist', async () => {
      const event = createTestEvent('CREATE_SUBSCRIPTION', {
        customerId: 'nonexistent',
        priceId: 'price_pro_monthly'
      });

      await expect(actor.handle(event)).rejects.toThrow('Customer not found');
    });

    it('should track revenue for active subscriptions', async () => {
      const event = createTestEvent('CREATE_SUBSCRIPTION', {
        customerId: 'user_123',
        priceId: 'price_pro_monthly',
        trialDays: 0
      });

      const result = await actor.handle(event);

      expect(result.events).toContainEqual(
        expect.objectContaining({
          type: 'TRACK_REVENUE',
          payload: expect.objectContaining({
            customerId: 'user_123',
            type: 'subscription_created'
          })
        })
      );
    });
  });

  describe('CANCEL_SUBSCRIPTION', () => {
    let subscriptionId: string;

    beforeEach(async () => {
      // Create customer and subscription
      await actor.handle(createTestEvent('CREATE_CUSTOMER', {
        userId: 'user_123',
        email: 'test@example.com'
      }));

      const subResult = await actor.handle(createTestEvent('CREATE_SUBSCRIPTION', {
        customerId: 'user_123',
        priceId: 'price_pro_monthly'
      }));
      
      subscriptionId = subResult.response.subscriptionId;
    });

    it('should cancel subscription at period end', async () => {
      const event = createTestEvent('CANCEL_SUBSCRIPTION', {
        subscriptionId,
        immediately: false
      });

      const result = await actor.handle(event);

      expect(result.success).toBe(true);
      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        expect.any(String),
        { cancel_at_period_end: true }
      );

      // Check cancellation event
      expect(result.events).toContainEqual(
        expect.objectContaining({
          type: 'CANCEL_SUBSCRIPTION_COMPLETED',
          payload: expect.objectContaining({
            subscriptionId,
            immediately: false
          })
        })
      );
    });

    it('should cancel subscription immediately', async () => {
      const event = createTestEvent('CANCEL_SUBSCRIPTION', {
        subscriptionId,
        immediately: true
      });

      const result = await actor.handle(event);

      expect(result.success).toBe(true);
      expect(mockStripe.subscriptions.cancel).toHaveBeenCalled();
    });

    it('should fail if subscription does not exist', async () => {
      const event = createTestEvent('CANCEL_SUBSCRIPTION', {
        subscriptionId: 'nonexistent',
        immediately: false
      });

      await expect(actor.handle(event)).rejects.toThrow('Subscription not found');
    });
  });

  describe('UPDATE_PAYMENT_METHOD', () => {
    beforeEach(async () => {
      await actor.handle(createTestEvent('CREATE_CUSTOMER', {
        userId: 'user_123',
        email: 'test@example.com'
      }));
    });

    it('should update payment method successfully', async () => {
      const event = createTestEvent('UPDATE_PAYMENT_METHOD', {
        customerId: 'user_123',
        paymentMethodId: 'pm_test123'
      });

      const result = await actor.handle(event);

      expect(result.success).toBe(true);
      expect(mockStripe.paymentMethods.attach).toHaveBeenCalledWith('pm_test123', {
        customer: expect.stringContaining('cus_')
      });
      expect(mockStripe.customers.update).toHaveBeenCalled();
    });

    it('should fail if customer does not exist', async () => {
      const event = createTestEvent('UPDATE_PAYMENT_METHOD', {
        customerId: 'nonexistent',
        paymentMethodId: 'pm_test123'
      });

      await expect(actor.handle(event)).rejects.toThrow('Customer not found');
    });
  });

  describe('PROCESS_STRIPE_WEBHOOK', () => {
    it('should process invoice.payment_succeeded webhook', async () => {
      // Create customer first
      await actor.handle(createTestEvent('CREATE_CUSTOMER', {
        userId: 'user_123',
        email: 'test@example.com'
      }));

      const webhookEvent = {
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'inv_123',
            customer: (await actor.query(createTestEvent('GET_CUSTOMER', { customerId: 'user_123' }))).stripeCustomerId,
            subscription: 'sub_123',
            amount_paid: 2999,
            currency: 'usd',
            due_date: Math.floor(Date.now() / 1000)
          }
        }
      };

      const event = createTestEvent('PROCESS_STRIPE_WEBHOOK', {
        event: webhookEvent,
        signature: 'test_signature'
      });

      const result = await actor.handle(event);

      expect(result.success).toBe(true);
      expect(result.events).toContainEqual(
        expect.objectContaining({
          type: 'TRACK_REVENUE',
          payload: expect.objectContaining({
            amount: 29.99,
            type: 'invoice_paid'
          })
        })
      );

      // Check invoice was created
      const invoices = await actor.query(createTestEvent('LIST_INVOICES', {
        customerId: 'user_123'
      }));
      expect(invoices).toHaveLength(1);
      expect(invoices[0].amount).toBe(2999);
    });
  });

  describe('Queries', () => {
    beforeEach(async () => {
      // Set up test data
      await actor.handle(createTestEvent('CREATE_CUSTOMER', {
        userId: 'user_123',
        email: 'test@example.com'
      }));

      await actor.handle(createTestEvent('CREATE_SUBSCRIPTION', {
        customerId: 'user_123',
        priceId: 'price_pro_monthly'
      }));
    });

    describe('GET_CUSTOMER', () => {
      it('should return customer with details', async () => {
        const result = await actor.query(createTestEvent('GET_CUSTOMER', {
          customerId: 'user_123'
        }));

        expect(result).toMatchObject({
          id: 'user_123',
          email: 'test@example.com',
          subscriptions: expect.any(Array),
          metrics: {
            activeSubscriptions: 1,
            totalRevenue: 0
          }
        });
        expect(result.subscriptions).toHaveLength(1);
      });

      it('should return null for non-existent customer', async () => {
        const result = await actor.query(createTestEvent('GET_CUSTOMER', {
          customerId: 'nonexistent'
        }));

        expect(result).toBeNull();
      });
    });

    describe('LIST_INVOICES', () => {
      it('should return empty array when no invoices', async () => {
        const result = await actor.query(createTestEvent('LIST_INVOICES', {
          customerId: 'user_123',
          limit: 10
        }));

        expect(result).toEqual([]);
      });

      it('should respect limit parameter', async () => {
        // Process webhook to create invoices
        for (let i = 0; i < 5; i++) {
          const webhookEvent = {
            type: 'invoice.payment_succeeded',
            data: {
              object: {
                id: `inv_${i}`,
                customer: (await actor.query(createTestEvent('GET_CUSTOMER', { customerId: 'user_123' }))).stripeCustomerId,
                subscription: 'sub_123',
                amount_paid: 2999,
                currency: 'usd',
                due_date: Math.floor(Date.now() / 1000) - i * 24 * 60 * 60
              }
            }
          };

          await actor.handle(createTestEvent('PROCESS_STRIPE_WEBHOOK', {
            event: webhookEvent,
            signature: 'test_signature'
          }));
        }

        const result = await actor.query(createTestEvent('LIST_INVOICES', {
          customerId: 'user_123',
          limit: 3
        }));

        expect(result).toHaveLength(3);
      });
    });
  });

  describe('Event Subscriptions', () => {
    it('should handle USER_REGISTERED event', async () => {
      const handler = { handler: 'createCustomerForUser' };
      await (actor as any).handleSubscription(
        createTestEvent('USER_REGISTERED', {
          userId: 'user_456',
          email: 'newuser@example.com'
        }),
        handler
      );

      // Verify customer was created
      const customer = await actor.query(createTestEvent('GET_CUSTOMER', {
        customerId: 'user_456'
      }));

      expect(customer).toMatchObject({
        id: 'user_456',
        email: 'newuser@example.com'
      });
    });

    it('should handle PAYMENT_FAILED event', async () => {
      // Create customer and subscription
      await actor.handle(createTestEvent('CREATE_CUSTOMER', {
        userId: 'user_123',
        email: 'test@example.com'
      }));

      const subResult = await actor.handle(createTestEvent('CREATE_SUBSCRIPTION', {
        customerId: 'user_123',
        priceId: 'price_pro_monthly'
      }));

      const handler = { handler: 'handleFailedPayment' };
      await (actor as any).handleSubscription(
        createTestEvent('PAYMENT_FAILED', {
          subscriptionId: subResult.response.subscriptionId,
          attemptCount: 4
        }),
        handler
      );

      // Verify subscription status was updated
      const subscription = await actor.query(createTestEvent('GET_SUBSCRIPTION', {
        subscriptionId: subResult.response.subscriptionId
      }));

      expect(subscription.status).toBe('past_due');
    });
  });
});