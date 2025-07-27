import { Event } from '../../../services/event-catalog';
import { vi } from 'vitest';

// Mock Stripe types
export interface MockStripeCustomer {
  id: string;
  email: string;
  metadata: Record<string, string>;
}

export interface MockStripeSubscription {
  id: string;
  customer: string;
  status: string;
  items: { data: Array<{ price: string }> };
  current_period_start: number;
  current_period_end: number;
  trial_period_days?: number;
  latest_invoice?: {
    payment_intent?: {
      client_secret: string;
    };
  };
}

export interface MockStripePaymentMethod {
  id: string;
  customer?: string;
}

// Create mock Stripe instance
export const createMockStripe = () => ({
  customers: {
    create: vi.fn().mockImplementation(async (params: any) => ({
      id: `cus_${Date.now()}`,
      email: params.email,
      metadata: params.metadata || {}
    } as MockStripeCustomer)),
    
    update: vi.fn().mockImplementation(async (id: string, params: any) => ({
      id,
      ...params
    }))
  },
  
  subscriptions: {
    create: vi.fn().mockImplementation(async (params: any) => ({
      id: `sub_${Date.now()}`,
      customer: params.customer,
      status: 'active',
      items: { data: params.items },
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      trial_period_days: params.trial_period_days,
      latest_invoice: {
        payment_intent: {
          client_secret: `pi_${Date.now()}_secret`
        }
      }
    } as MockStripeSubscription)),
    
    update: vi.fn().mockImplementation(async (id: string, params: any) => ({
      id,
      ...params
    })),
    
    cancel: vi.fn().mockResolvedValue({ id: 'sub_cancelled', status: 'canceled' })
  },
  
  paymentMethods: {
    attach: vi.fn().mockResolvedValue({ id: 'pm_attached' })
  },
  
  webhooks: {
    constructEvent: vi.fn().mockImplementation((payload: any, sig: string, secret: string) => {
      return JSON.parse(payload);
    })
  }
});

// Create mock event bus
export const createMockEventBus = () => ({
  emit: vi.fn().mockResolvedValue(undefined),
  ask: vi.fn().mockResolvedValue({ success: true }),
  subscribe: vi.fn(),
  unsubscribe: vi.fn()
});

// Create test event
export const createTestEvent = (type: string, payload: any): Event => ({
  id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  type,
  payload,
  timestamp: Date.now(),
  actor: 'test'
});

// Mock actor base class
export class MockRelayActor {
  private state = new Map<string, any>();
  protected eventBus: any;
  
  constructor(config: any, eventBus: any) {
    this.eventBus = eventBus;
  }
  
  async initialize() {
    // Set up initial state
    this.state.set('customers', new Map());
    this.state.set('subscriptions', new Map());
    this.state.set('invoices', new Map());
  }
  
  protected getState(key: string) {
    return this.state.get(key);
  }
  
  protected setState(key: string, value: any) {
    this.state.set(key, value);
  }
  
  protected generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  protected async emit(type: string, payload: any) {
    return this.eventBus.emit({ type, payload });
  }
  
  async handle(event: Event) {
    const handler = { emits: `${event.type}_COMPLETED` };
    return this.processEvent(event, handler);
  }
  
  async query(event: Event) {
    return this.executeQuery(event, {});
  }
  
  protected async processEvent(event: Event, handler: any): Promise<any> {
    throw new Error('Must be implemented by subclass');
  }
  
  protected async executeQuery(event: Event, queryDef: any): Promise<any> {
    throw new Error('Must be implemented by subclass');
  }
}

// Test data factories
export const createTestCustomer = (overrides = {}) => ({
  id: 'user_123',
  email: 'test@example.com',
  stripeCustomerId: 'cus_test123',
  subscriptions: [],
  totalRevenue: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides
});

export const createTestSubscription = (overrides = {}) => ({
  id: 'sub_123',
  customerId: 'user_123',
  stripeSubscriptionId: 'stripe_sub_123',
  status: 'active',
  planId: 'pro_monthly',
  currentPeriodStart: Date.now(),
  currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
  cancelAtPeriodEnd: false,
  ...overrides
});

export const createTestInvoice = (overrides = {}) => ({
  id: 'inv_123',
  customerId: 'user_123',
  subscriptionId: 'sub_123',
  amount: 2999,
  currency: 'usd',
  status: 'paid',
  dueDate: Date.now(),
  paidAt: Date.now(),
  ...overrides
});

// Wait for async operations
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));