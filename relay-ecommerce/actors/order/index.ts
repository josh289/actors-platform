import { RelayActor, Result } from '../../runtime/actor-base';
import { Event } from '../../services/event-catalog';

interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  shippingAddress: Address;
  billingAddress: Address;
  paymentId?: string;
  reservationId?: string;
  trackingNumber?: string;
  createdAt: number;
  updatedAt: number;
}

interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export class OrderActor extends RelayActor {
  protected async processEvent(event: Event, handler: any): Promise<Result> {
    const events: Event[] = [];
    const orders = this.getState('orders') || new Map<string, Order>();

    switch (event.type) {
      case 'CREATE_ORDER': {
        const { cartId, userId, items, shippingAddress, billingAddress } = event.payload;
        
        // Calculate order totals
        const subtotal = items.reduce((sum: number, item: any) => 
          sum + (item.price * item.quantity), 0
        );
        const tax = subtotal * 0.08; // 8% tax
        const shipping = subtotal > 50 ? 0 : 9.99; // Free shipping over $50
        const total = subtotal + tax + shipping;

        const order: Order = {
          id: this.generateId(),
          userId,
          items: items.map((item: any) => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity
          })),
          subtotal,
          tax,
          shipping,
          total,
          status: 'pending',
          shippingAddress,
          billingAddress,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        orders.set(order.id, order);

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              orderId: order.id,
              userId,
              items: order.items,
              total: order.total,
              status: order.status,
              timestamp: Date.now()
            },
            timestamp: Date.now(),
            actor: 'order'
          });
        }

        // Request stock reservation
        events.push({
          id: this.generateId(),
          type: 'RESERVE_STOCK',
          payload: {
            orderId: order.id,
            items: items.map((item: any) => ({
              productId: item.productId,
              quantity: item.quantity
            }))
          },
          timestamp: Date.now(),
          actor: 'order'
        });

        // Send order confirmation email
        events.push({
          id: this.generateId(),
          type: 'SEND_EMAIL',
          payload: {
            userId,
            template: 'order-confirmation',
            data: {
              orderId: order.id,
              items: order.items,
              total: order.total,
              shippingAddress
            }
          },
          timestamp: Date.now(),
          actor: 'order'
        });

        return {
          success: true,
          state: { orders },
          events,
          response: {
            orderId: order.id,
            total: order.total
          }
        };
      }

      case 'UPDATE_ORDER_STATUS': {
        const { orderId, status, reason } = event.payload;
        const order = orders.get(orderId);
        
        if (!order) {
          throw new Error('Order not found');
        }

        const oldStatus = order.status;
        order.status = status;
        order.updatedAt = Date.now();

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              orderId,
              oldStatus,
              newStatus: status,
              reason,
              timestamp: Date.now()
            },
            timestamp: Date.now(),
            actor: 'order'
          });
        }

        // Track status change
        events.push({
          id: this.generateId(),
          type: 'TRACK_EVENT',
          payload: {
            event: 'order_status_changed',
            properties: {
              orderId,
              from: oldStatus,
              to: status,
              reason
            }
          },
          timestamp: Date.now(),
          actor: 'order'
        });

        return {
          success: true,
          state: { orders },
          events
        };
      }

      case 'CANCEL_ORDER': {
        const { orderId, reason } = event.payload;
        const order = orders.get(orderId);
        
        if (!order) {
          throw new Error('Order not found');
        }

        if (['shipped', 'delivered', 'cancelled'].includes(order.status)) {
          throw new Error(`Cannot cancel order in ${order.status} status`);
        }

        order.status = 'cancelled';
        order.updatedAt = Date.now();

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              orderId,
              userId: order.userId,
              reason,
              hadPayment: !!order.paymentId,
              timestamp: Date.now()
            },
            timestamp: Date.now(),
            actor: 'order'
          });
        }

        // Release stock reservation if exists
        if (order.reservationId) {
          events.push({
            id: this.generateId(),
            type: 'RELEASE_STOCK',
            payload: {
              reservationId: order.reservationId
            },
            timestamp: Date.now(),
            actor: 'order'
          });
        }

        // Notify user
        events.push({
          id: this.generateId(),
          type: 'SEND_EMAIL',
          payload: {
            userId: order.userId,
            template: 'order-cancelled',
            data: {
              orderId,
              reason,
              refundExpected: !!order.paymentId
            }
          },
          timestamp: Date.now(),
          actor: 'order'
        });

        return {
          success: true,
          state: { orders },
          events
        };
      }

      case 'CONFIRM_ORDER': {
        const { orderId, paymentId } = event.payload;
        const order = orders.get(orderId);
        
        if (!order) {
          throw new Error('Order not found');
        }

        if (order.status !== 'pending') {
          throw new Error('Can only confirm pending orders');
        }

        order.status = 'confirmed';
        order.paymentId = paymentId;
        order.updatedAt = Date.now();

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              orderId,
              userId: order.userId,
              total: order.total,
              timestamp: Date.now()
            },
            timestamp: Date.now(),
            actor: 'order'
          });
        }

        // Create shipment
        events.push({
          id: this.generateId(),
          type: 'CREATE_SHIPMENT',
          payload: {
            orderId,
            items: order.items,
            shippingAddress: order.shippingAddress
          },
          timestamp: Date.now(),
          actor: 'order'
        });

        return {
          success: true,
          state: { orders },
          events
        };
      }

      default:
        throw new Error(`Unknown event type: ${event.type}`);
    }
  }

  protected async executeQuery(event: Event, queryDef: any): Promise<any> {
    const orders = this.getState('orders') || new Map<string, Order>();

    switch (event.type) {
      case 'GET_ORDER': {
        const { orderId } = event.payload;
        return orders.get(orderId) || null;
      }

      case 'GET_USER_ORDERS': {
        const { userId, status } = event.payload;
        let userOrders = Array.from(orders.values())
          .filter(o => o.userId === userId);
        
        if (status) {
          userOrders = userOrders.filter(o => o.status === status);
        }
        
        return userOrders.sort((a, b) => b.createdAt - a.createdAt);
      }

      case 'GET_ORDER_STATUS': {
        const { orderId } = event.payload;
        const order = orders.get(orderId);
        
        if (!order) {
          return null;
        }

        return {
          orderId,
          status: order.status,
          updatedAt: order.updatedAt
        };
      }

      default:
        throw new Error(`Unknown query type: ${event.type}`);
    }
  }

  protected async handleSubscription(event: Event, handler: any): Promise<void> {
    const orders = this.getState('orders') || new Map<string, Order>();

    switch (event.type) {
      case 'CART_CHECKED_OUT': {
        const { cartId, userId, items, total } = event.payload;
        
        // Create order from cart
        await this.emit('CREATE_ORDER', {
          cartId,
          userId,
          items,
          // In real app, would get addresses from user profile or checkout form
          shippingAddress: {
            street: '123 Main St',
            city: 'San Francisco',
            state: 'CA',
            zip: '94105',
            country: 'US'
          },
          billingAddress: {
            street: '123 Main St',
            city: 'San Francisco',
            state: 'CA',
            zip: '94105',
            country: 'US'
          }
        });
        break;
      }

      case 'STOCK_RESERVED': {
        const { orderId, reservationId } = event.payload;
        const order = orders.get(orderId);
        
        if (order) {
          order.reservationId = reservationId;
          
          // Initiate payment
          await this.emit('PROCESS_PAYMENT', {
            orderId,
            userId: order.userId,
            amount: order.total,
            currency: 'usd'
          });
        }
        break;
      }

      case 'STOCK_INSUFFICIENT': {
        const { orderId, unavailable } = event.payload;
        const order = orders.get(orderId);
        
        if (order && order.status === 'pending') {
          // Cancel order due to stock issues
          await this.emit('CANCEL_ORDER', {
            orderId,
            reason: 'Insufficient stock'
          });
        }
        break;
      }

      case 'PAYMENT_PROCESSED': {
        const { orderId, paymentId } = event.payload;
        
        await this.emit('CONFIRM_ORDER', {
          orderId,
          paymentId
        });
        break;
      }

      case 'PAYMENT_FAILED': {
        const { orderId, reason } = event.payload;
        const order = orders.get(orderId);
        
        if (order && order.status === 'pending') {
          await this.emit('UPDATE_ORDER_STATUS', {
            orderId,
            status: 'cancelled',
            reason: `Payment failed: ${reason}`
          });
        }
        break;
      }

      case 'ORDER_SHIPPED': {
        const { orderId, trackingNumber } = event.payload;
        const order = orders.get(orderId);
        
        if (order) {
          order.trackingNumber = trackingNumber;
          await this.emit('UPDATE_ORDER_STATUS', {
            orderId,
            status: 'shipped',
            reason: 'Shipment created'
          });
        }
        break;
      }

      case 'DELIVERY_CONFIRMED': {
        const { orderId } = event.payload;
        
        await this.emit('UPDATE_ORDER_STATUS', {
          orderId,
          status: 'delivered',
          reason: 'Package delivered'
        });
        break;
      }
    }
  }

  protected async updateState(newState: any): Promise<void> {
    if (newState.orders) this.setState('orders', newState.orders);
  }
}