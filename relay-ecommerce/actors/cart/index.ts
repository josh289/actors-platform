import { RelayActor, Result } from '../../runtime/actor-base';
import { Event } from '../../services/event-catalog';

interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  total: number;
  createdAt: number;
  updatedAt: number;
}

interface CartItem {
  productId: string;
  quantity: number;
  price: number;
  name: string;
}

export class CartActor extends RelayActor {
  protected async processEvent(event: Event, handler: any): Promise<Result> {
    const events: Event[] = [];
    const carts = this.getState('carts') || new Map<string, Cart>();

    switch (event.type) {
      case 'ADD_TO_CART': {
        const { userId, productId, quantity, price, name } = event.payload;
        
        // Find or create cart for user
        let cart = Array.from(carts.values()).find(c => c.userId === userId);
        
        if (!cart) {
          cart = {
            id: this.generateId(),
            userId,
            items: [],
            total: 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          carts.set(cart.id, cart);
        }

        // Check if item already in cart
        const existingItem = cart.items.find(item => item.productId === productId);
        
        if (existingItem) {
          existingItem.quantity += quantity;
        } else {
          cart.items.push({ productId, quantity, price, name });
        }

        // Recalculate total
        cart.total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cart.updatedAt = Date.now();

        // Emit event
        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              userId,
              cartId: cart.id,
              productId,
              quantity,
              price,
              total: cart.total
            },
            timestamp: Date.now(),
            actor: 'cart'
          });
        }

        return {
          success: true,
          state: { carts },
          events,
          response: { cartId: cart.id, total: cart.total }
        };
      }

      case 'REMOVE_FROM_CART': {
        const { cartId, productId } = event.payload;
        const cart = carts.get(cartId);
        
        if (!cart) {
          throw new Error('Cart not found');
        }

        cart.items = cart.items.filter(item => item.productId !== productId);
        cart.total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cart.updatedAt = Date.now();

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: { cartId, productId },
            timestamp: Date.now(),
            actor: 'cart'
          });
        }

        return {
          success: true,
          state: { carts },
          events
        };
      }

      case 'CHECKOUT_CART': {
        const { cartId } = event.payload;
        const cart = carts.get(cartId);
        
        if (!cart) {
          throw new Error('Cart not found');
        }

        if (cart.items.length === 0) {
          throw new Error('Cart is empty');
        }

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              cartId: cart.id,
              userId: cart.userId,
              items: cart.items,
              total: cart.total
            },
            timestamp: Date.now(),
            actor: 'cart'
          });
        }

        return {
          success: true,
          state: { carts },
          events,
          response: {
            cartId: cart.id,
            items: cart.items,
            total: cart.total
          }
        };
      }

      case 'CLEAR_CART': {
        const { cartId } = event.payload;
        const cart = carts.get(cartId);
        
        if (!cart) {
          throw new Error('Cart not found');
        }

        cart.items = [];
        cart.total = 0;
        cart.updatedAt = Date.now();

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: { cartId, userId: cart.userId },
            timestamp: Date.now(),
            actor: 'cart'
          });
        }

        return {
          success: true,
          state: { carts },
          events
        };
      }

      default:
        throw new Error(`Unknown event type: ${event.type}`);
    }
  }

  protected async executeQuery(event: Event, queryDef: any): Promise<any> {
    const carts = this.getState('carts') || new Map<string, Cart>();

    switch (event.type) {
      case 'GET_CART': {
        const { userId } = event.payload;
        const cart = Array.from(carts.values()).find(c => c.userId === userId);
        return cart || null;
      }

      case 'GET_CART_BY_ID': {
        const { cartId } = event.payload;
        return carts.get(cartId) || null;
      }

      case 'GET_CART_TOTAL': {
        const { cartId } = event.payload;
        const cart = carts.get(cartId);
        
        if (!cart) {
          return { total: 0, itemCount: 0, items: [] };
        }

        return {
          total: cart.total,
          itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
          items: cart.items
        };
      }

      default:
        throw new Error(`Unknown query type: ${event.type}`);
    }
  }

  protected async handleSubscription(event: Event, handler: any): Promise<void> {
    const carts = this.getState('carts') || new Map<string, Cart>();

    switch (event.type) {
      case 'STOCK_INSUFFICIENT': {
        const { orderId, unavailable } = event.payload;
        
        // Find cart associated with order (would need order-cart mapping in real app)
        // For now, just log the issue
        console.log(`Stock insufficient for order ${orderId}:`, unavailable);
        break;
      }

      case 'ORDER_CREATED': {
        const { orderId, userId } = event.payload;
        
        // Find and clear user's cart
        const cart = Array.from(carts.values()).find(c => c.userId === userId);
        if (cart) {
          cart.items = [];
          cart.total = 0;
          cart.updatedAt = Date.now();
          this.setState('carts', carts);
        }
        break;
      }

      case 'PAYMENT_FAILED': {
        const { orderId, userId } = event.payload;
        
        // In real app, would restore cart from order details
        console.log(`Payment failed for order ${orderId}, cart preserved for user ${userId}`);
        break;
      }
    }
  }

  protected async updateState(newState: any): Promise<void> {
    if (newState.carts) {
      this.setState('carts', newState.carts);
    }
  }
}