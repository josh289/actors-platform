// Billing Actor - Minimal TypeScript Implementation (250 lines)
import { RelayActor, Result } from '../../runtime/actor-base';
import { Event } from '../../services/event-catalog';
import Stripe from 'stripe';

// Types match YAML schemas exactly
interface Customer {
  id: string;
  email: string;
  stripeCustomerId: string;
  defaultPaymentMethod?: string;
  subscriptions: string[];
  totalRevenue: number;
  createdAt: number;
  updatedAt: number;
}

interface Subscription {
  id: string;
  customerId: string;
  stripeSubscriptionId: string;
  status: string;
  planId: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
}

interface Invoice {
  id: string;
  customerId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: string;
  dueDate: number;
  paidAt?: number;
}

export class BillingActor extends RelayActor {
  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2023-10-16'
  });

  protected async processEvent(event: Event, handler: any): Promise<Result> {
    const events: Event[] = [];
    const customers = this.getState('customers') || new Map<string, Customer>();
    const subscriptions = this.getState('subscriptions') || new Map<string, Subscription>();
    const invoices = this.getState('invoices') || new Map<string, Invoice>();

    switch (event.type) {
      case 'CREATE_CUSTOMER': {
        const { userId, email, metadata } = event.payload;
        
        // Check if already exists
        if (customers.has(userId)) {
          throw new Error('Customer already exists');
        }

        // Create in Stripe
        const stripeCustomer = await this.stripe.customers.create({
          email,
          metadata: { userId, ...metadata }
        });

        // Create local record
        const customer: Customer = {
          id: userId,
          email,
          stripeCustomerId: stripeCustomer.id,
          subscriptions: [],
          totalRevenue: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        customers.set(customer.id, customer);

        // Emit event
        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              customerId: customer.id,
              email,
              stripeCustomerId: stripeCustomer.id
            },
            timestamp: Date.now(),
            actor: 'billing'
          });
        }

        // Send welcome email
        events.push({
          id: this.generateId(),
          type: 'SEND_EMAIL',
          payload: {
            to: email,
            template: 'billing-welcome',
            data: { customerId: customer.id }
          },
          timestamp: Date.now(),
          actor: 'billing'
        });

        return {
          success: true,
          state: { customers, subscriptions, invoices },
          events,
          response: { customerId: customer.id }
        };
      }

      case 'CREATE_SUBSCRIPTION': {
        const { customerId, priceId, trialDays } = event.payload;
        const customer = customers.get(customerId);
        
        if (!customer) {
          throw new Error('Customer not found');
        }

        // Create in Stripe
        const stripeSubscription = await this.stripe.subscriptions.create({
          customer: customer.stripeCustomerId,
          items: [{ price: priceId }],
          trial_period_days: trialDays,
          payment_behavior: 'default_incomplete',
          expand: ['latest_invoice.payment_intent']
        });

        // Create local record
        const subscription: Subscription = {
          id: this.generateId(),
          customerId,
          stripeSubscriptionId: stripeSubscription.id,
          status: stripeSubscription.status,
          planId: priceId,
          currentPeriodStart: stripeSubscription.current_period_start * 1000,
          currentPeriodEnd: stripeSubscription.current_period_end * 1000,
          cancelAtPeriodEnd: false
        };

        subscriptions.set(subscription.id, subscription);
        customer.subscriptions.push(subscription.id);
        customer.updatedAt = Date.now();

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              subscriptionId: subscription.id,
              customerId,
              planId: priceId,
              status: subscription.status,
              trialDays
            },
            timestamp: Date.now(),
            actor: 'billing'
          });
        }

        // Track revenue event
        if (subscription.status === 'active') {
          events.push({
            id: this.generateId(),
            type: 'TRACK_REVENUE',
            payload: {
              customerId,
              amount: 0, // Will be updated when invoice paid
              type: 'subscription_created'
            },
            timestamp: Date.now(),
            actor: 'billing'
          });
        }

        return {
          success: true,
          state: { customers, subscriptions, invoices },
          events,
          response: {
            subscriptionId: subscription.id,
            clientSecret: (stripeSubscription.latest_invoice as any)?.payment_intent?.client_secret
          }
        };
      }

      case 'CANCEL_SUBSCRIPTION': {
        const { subscriptionId, immediately } = event.payload;
        const subscription = subscriptions.get(subscriptionId);
        
        if (!subscription) {
          throw new Error('Subscription not found');
        }

        // Cancel in Stripe
        const updated = await this.stripe.subscriptions.update(
          subscription.stripeSubscriptionId,
          immediately ? { cancel_at: null } : { cancel_at_period_end: true }
        );

        if (immediately) {
          await this.stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
          subscription.status = 'canceled';
        } else {
          subscription.cancelAtPeriodEnd = true;
        }

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              subscriptionId,
              customerId: subscription.customerId,
              immediately,
              effectiveDate: immediately ? Date.now() : subscription.currentPeriodEnd
            },
            timestamp: Date.now(),
            actor: 'billing'
          });
        }

        return {
          success: true,
          state: { customers, subscriptions, invoices },
          events
        };
      }

      case 'UPDATE_PAYMENT_METHOD': {
        const { customerId, paymentMethodId } = event.payload;
        const customer = customers.get(customerId);
        
        if (!customer) {
          throw new Error('Customer not found');
        }

        // Attach payment method to customer
        await this.stripe.paymentMethods.attach(paymentMethodId, {
          customer: customer.stripeCustomerId
        });

        // Set as default
        await this.stripe.customers.update(customer.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId
          }
        });

        customer.defaultPaymentMethod = paymentMethodId;
        customer.updatedAt = Date.now();

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              customerId,
              paymentMethodId
            },
            timestamp: Date.now(),
            actor: 'billing'
          });
        }

        return {
          success: true,
          state: { customers, subscriptions, invoices },
          events
        };
      }

      case 'PROCESS_STRIPE_WEBHOOK': {
        const { event: webhookEvent, signature } = event.payload;
        
        // Verify webhook signature
        const stripeEvent = this.stripe.webhooks.constructEvent(
          JSON.stringify(webhookEvent),
          signature,
          process.env.STRIPE_WEBHOOK_SECRET!
        );

        // Handle specific webhook events
        switch (stripeEvent.type) {
          case 'invoice.payment_succeeded': {
            const invoice = stripeEvent.data.object as Stripe.Invoice;
            
            // Create invoice record
            const newInvoice: Invoice = {
              id: invoice.id,
              customerId: invoice.customer as string,
              subscriptionId: invoice.subscription as string,
              amount: invoice.amount_paid,
              currency: invoice.currency,
              status: 'paid',
              dueDate: invoice.due_date! * 1000,
              paidAt: Date.now()
            };

            invoices.set(newInvoice.id, newInvoice);

            // Update customer revenue
            const customer = Array.from(customers.values())
              .find(c => c.stripeCustomerId === invoice.customer);
            
            if (customer) {
              customer.totalRevenue += invoice.amount_paid / 100;
              customer.updatedAt = Date.now();
            }

            // Track revenue
            events.push({
              id: this.generateId(),
              type: 'TRACK_REVENUE',
              payload: {
                customerId: customer?.id,
                amount: invoice.amount_paid / 100,
                type: 'invoice_paid'
              },
              timestamp: Date.now(),
              actor: 'billing'
            });
            break;
          }
        }

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              eventType: stripeEvent.type,
              processed: true
            },
            timestamp: Date.now(),
            actor: 'billing'
          });
        }

        return {
          success: true,
          state: { customers, subscriptions, invoices },
          events
        };
      }
      
      default:
        throw new Error(`Unknown event type: ${event.type}`);
    }
  }

  protected async executeQuery(event: Event, queryDef: any): Promise<any> {
    const customers = this.getState('customers') || new Map<string, Customer>();
    const subscriptions = this.getState('subscriptions') || new Map<string, Subscription>();
    const invoices = this.getState('invoices') || new Map<string, Invoice>();

    switch (event.type) {
      case 'GET_CUSTOMER': {
        const { customerId } = event.payload;
        const customer = customers.get(customerId);
        
        if (!customer) return null;

        // Enrich with subscriptions
        const customerSubs = customer.subscriptions
          .map(id => subscriptions.get(id))
          .filter(Boolean);

        return {
          ...customer,
          subscriptions: customerSubs,
          metrics: {
            activeSubscriptions: customerSubs.filter(s => s.status === 'active').length,
            totalRevenue: customer.totalRevenue
          }
        };
      }

      case 'GET_SUBSCRIPTION': {
        const { subscriptionId } = event.payload;
        return subscriptions.get(subscriptionId) || null;
      }

      case 'LIST_INVOICES': {
        const { customerId, limit = 10 } = event.payload;
        
        const customerInvoices = Array.from(invoices.values())
          .filter(inv => inv.customerId === customerId)
          .sort((a, b) => b.dueDate - a.dueDate)
          .slice(0, limit);

        return customerInvoices;
      }

      default:
        throw new Error(`Unknown query type: ${event.type}`);
    }
  }

  protected async handleSubscription(event: Event, handler: any): Promise<void> {
    switch (event.type) {
      case 'USER_REGISTERED': {
        const { userId, email } = event.payload;
        
        // Auto-create billing customer
        await this.emit('CREATE_CUSTOMER', {
          userId,
          email,
          metadata: { source: 'auto_registration' }
        });
        break;
      }

      case 'PAYMENT_FAILED': {
        const { subscriptionId, attemptCount } = event.payload;
        const subscriptions = this.getState('subscriptions') || new Map();
        const subscription = subscriptions.get(subscriptionId);
        
        if (subscription) {
          subscription.status = attemptCount > 3 ? 'past_due' : 'active';
          this.setState('subscriptions', subscriptions);
        }
        break;
      }
    }
  }

  protected async updateState(newState: any): Promise<void> {
    if (newState.customers) this.setState('customers', newState.customers);
    if (newState.subscriptions) this.setState('subscriptions', newState.subscriptions);
    if (newState.invoices) this.setState('invoices', newState.invoices);
  }
}