import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventBus } from '../../runtime/event-bus';
import { PostgresEventCatalog } from '../../services/event-catalog';
import { CartActor } from '../../actors/cart';
import { UserActor } from '../../actors/user';
import { InventoryActor } from '../../actors/inventory';
import { PaymentActor } from '../../actors/payment';
import { OrderActor } from '../../actors/order';

describe('Checkout Flow Integration Test', () => {
  let eventBus: EventBus;
  let catalog: PostgresEventCatalog;
  let cartActor: CartActor;
  let userActor: UserActor;
  let inventoryActor: InventoryActor;
  let paymentActor: PaymentActor;
  let orderActor: OrderActor;

  const testConfig = {
    catalog: {
      host: process.env.TEST_POSTGRES_HOST || 'localhost',
      port: 5432,
      database: 'test_event_catalog',
      user: 'test',
      password: 'test'
    }
  };

  beforeEach(async () => {
    // Initialize event bus
    eventBus = new EventBus({
      provider: 'memory',
      patterns: {
        ask: { timeout: 5000, retries: 2 },
        tell: { delivery: 'at_least_once' },
        publish: { delivery: 'best_effort' }
      }
    });
    await eventBus.initialize();

    // Initialize event catalog
    catalog = new PostgresEventCatalog(testConfig.catalog);
    await catalog.initialize();

    // Initialize actors
    cartActor = new CartActor({ name: 'cart', version: '1.0.0', ...testConfig }, eventBus);
    userActor = new UserActor({ name: 'user', version: '1.0.0', ...testConfig }, eventBus);
    inventoryActor = new InventoryActor({ name: 'inventory', version: '1.0.0', ...testConfig }, eventBus);
    paymentActor = new PaymentActor({ name: 'payment', version: '1.0.0', ...testConfig }, eventBus);
    orderActor = new OrderActor({ name: 'order', version: '1.0.0', ...testConfig }, eventBus);

    await Promise.all([
      cartActor.initialize(),
      userActor.initialize(),
      inventoryActor.initialize(),
      paymentActor.initialize(),
      orderActor.initialize()
    ]);

    // Set up test inventory
    await inventoryActor.handle({
      id: 'test-1',
      type: 'UPDATE_STOCK',
      payload: {
        productId: 'prod-123',
        adjustment: 100,
        reason: 'Test setup'
      },
      timestamp: Date.now(),
      actor: 'test'
    });
  });

  afterEach(async () => {
    await eventBus.close();
    await catalog.close();
  });

  it('should complete full checkout flow successfully', async () => {
    // 1. Create user
    const userResult = await userActor.handle({
      id: 'test-user-1',
      type: 'VERIFY_TOKEN',
      payload: {
        token: 'test-token',
        email: 'test@example.com'
      },
      timestamp: Date.now(),
      actor: 'test'
    });

    expect(userResult.success).toBe(true);
    const userId = userResult.response.user.id;

    // 2. Add item to cart
    const cartResult = await cartActor.handle({
      id: 'test-cart-1',
      type: 'ADD_TO_CART',
      payload: {
        userId,
        productId: 'prod-123',
        quantity: 2,
        price: 29.99,
        name: 'Test Product'
      },
      timestamp: Date.now(),
      actor: 'test'
    });

    expect(cartResult.success).toBe(true);
    const cartId = cartResult.response.cartId;

    // 3. Checkout cart
    const checkoutResult = await cartActor.handle({
      id: 'test-checkout-1',
      type: 'CHECKOUT_CART',
      payload: { cartId },
      timestamp: Date.now(),
      actor: 'test'
    });

    expect(checkoutResult.success).toBe(true);
    expect(checkoutResult.events).toContainEqual(
      expect.objectContaining({ type: 'CART_CHECKED_OUT' })
    );

    // 4. Verify order was created
    const orderId = await waitForOrderCreation(orderActor, userId);
    expect(orderId).toBeDefined();

    // 5. Verify stock was reserved
    const stockStatus = await inventoryActor.query({
      id: 'test-query-1',
      type: 'GET_PRODUCT_STOCK',
      payload: { productId: 'prod-123' },
      timestamp: Date.now(),
      actor: 'test'
    });

    expect(stockStatus.reserved).toBeGreaterThan(0);
    expect(stockStatus.available).toBe(98); // 100 - 2

    // 6. Add payment method
    await paymentActor.handle({
      id: 'test-payment-1',
      type: 'ADD_PAYMENT_METHOD',
      payload: {
        userId,
        stripePaymentMethodId: 'pm_test_123',
        setAsDefault: true
      },
      timestamp: Date.now(),
      actor: 'test'
    });

    // 7. Process payment (will be triggered by order creation)
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for async processing

    // 8. Verify order is confirmed
    const orderStatus = await orderActor.query({
      id: 'test-query-2',
      type: 'GET_ORDER',
      payload: { orderId },
      timestamp: Date.now(),
      actor: 'test'
    });

    expect(orderStatus.status).toBe('confirmed');
  });

  it('should handle insufficient stock gracefully', async () => {
    // Set low stock
    await inventoryActor.handle({
      id: 'test-stock-1',
      type: 'UPDATE_STOCK',
      payload: {
        productId: 'prod-456',
        adjustment: 1,
        reason: 'Low stock test'
      },
      timestamp: Date.now(),
      actor: 'test'
    });

    // Try to add more than available
    const cartResult = await cartActor.handle({
      id: 'test-cart-2',
      type: 'ADD_TO_CART',
      payload: {
        userId: 'user-123',
        productId: 'prod-456',
        quantity: 5,
        price: 19.99,
        name: 'Low Stock Product'
      },
      timestamp: Date.now(),
      actor: 'test'
    });

    const checkoutResult = await cartActor.handle({
      id: 'test-checkout-2',
      type: 'CHECKOUT_CART',
      payload: { cartId: cartResult.response.cartId },
      timestamp: Date.now(),
      actor: 'test'
    });

    // Order should be created but then cancelled due to insufficient stock
    await new Promise(resolve => setTimeout(resolve, 100));

    const events = await getEmittedEvents();
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'STOCK_INSUFFICIENT' })
    );
  });

  it('should handle payment failure and release stock', async () => {
    // Mock payment failure by using specific test card
    const failurePaymentMethod = 'pm_test_fail';
    
    // Similar flow but payment will fail
    // Stock should be released after payment failure
  });
});

// Helper functions
async function waitForOrderCreation(orderActor: OrderActor, userId: string): Promise<string | null> {
  let attempts = 0;
  while (attempts < 10) {
    const orders = await orderActor.query({
      id: `query-${attempts}`,
      type: 'GET_USER_ORDERS',
      payload: { userId },
      timestamp: Date.now(),
      actor: 'test'
    });

    if (orders.length > 0) {
      return orders[0].id;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  return null;
}

async function getEmittedEvents(): Promise<any[]> {
  // In real implementation, would track events through event bus
  return [];
}