import { RelayActor, Result } from '../../runtime/actor-base';
import { Event } from '../../services/event-catalog';

interface Product {
  id: string;
  sku: string;
  name: string;
  stock: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  updatedAt: number;
}

interface Reservation {
  id: string;
  orderId: string;
  items: ReservedItem[];
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'confirmed' | 'released';
}

interface ReservedItem {
  productId: string;
  quantity: number;
}

export class InventoryActor extends RelayActor {
  protected async processEvent(event: Event, handler: any): Promise<Result> {
    const events: Event[] = [];
    const products = this.getState('products') || new Map<string, Product>();
    const reservations = this.getState('reservations') || new Map<string, Reservation>();

    switch (event.type) {
      case 'CHECK_STOCK': {
        const { items } = event.payload;
        const unavailable: Array<{productId: string, requested: number, available: number}> = [];
        
        for (const item of items) {
          const product = products.get(item.productId);
          
          if (!product || product.available < item.quantity) {
            unavailable.push({
              productId: item.productId,
              requested: item.quantity,
              available: product?.available || 0
            });
          }
        }

        return {
          success: true,
          state: { products, reservations },
          events,
          response: {
            available: unavailable.length === 0,
            unavailable
          }
        };
      }

      case 'RESERVE_STOCK': {
        const { orderId, items } = event.payload;
        
        // Check availability first
        const unavailable: Array<{productId: string, requested: number, available: number}> = [];
        
        for (const item of items) {
          const product = products.get(item.productId);
          
          if (!product || product.available < item.quantity) {
            unavailable.push({
              productId: item.productId,
              requested: item.quantity,
              available: product?.available || 0
            });
          }
        }

        if (unavailable.length > 0) {
          events.push({
            id: this.generateId(),
            type: 'STOCK_INSUFFICIENT',
            payload: {
              orderId,
              unavailable
            },
            timestamp: Date.now(),
            actor: 'inventory'
          });

          return {
            success: false,
            state: { products, reservations },
            events,
            response: { reserved: false, unavailable }
          };
        }

        // Reserve stock
        const reservation: Reservation = {
          id: this.generateId(),
          orderId,
          items: items.map(item => ({
            productId: item.productId,
            quantity: item.quantity
          })),
          createdAt: Date.now(),
          expiresAt: Date.now() + (15 * 60 * 1000), // 15 minutes
          status: 'pending'
        };

        // Update product availability
        for (const item of items) {
          const product = products.get(item.productId)!;
          product.reserved += item.quantity;
          product.available = product.stock - product.reserved;
          product.updatedAt = Date.now();

          // Check low stock
          if (product.available <= product.lowStockThreshold) {
            events.push({
              id: this.generateId(),
              type: 'LOW_STOCK_ALERT',
              payload: {
                productId: product.id,
                sku: product.sku,
                name: product.name,
                available: product.available,
                threshold: product.lowStockThreshold
              },
              timestamp: Date.now(),
              actor: 'inventory'
            });
          }
        }

        reservations.set(reservation.id, reservation);

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              reservationId: reservation.id,
              orderId,
              items,
              expiresAt: reservation.expiresAt
            },
            timestamp: Date.now(),
            actor: 'inventory'
          });
        }

        return {
          success: true,
          state: { products, reservations },
          events,
          response: {
            reserved: true,
            reservationId: reservation.id
          }
        };
      }

      case 'RELEASE_STOCK': {
        const { reservationId } = event.payload;
        const reservation = reservations.get(reservationId);
        
        if (!reservation) {
          throw new Error('Reservation not found');
        }

        // Release reserved stock
        for (const item of reservation.items) {
          const product = products.get(item.productId);
          if (product) {
            product.reserved -= item.quantity;
            product.available = product.stock - product.reserved;
            product.updatedAt = Date.now();
          }
        }

        reservation.status = 'released';

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              reservationId,
              orderId: reservation.orderId,
              items: reservation.items
            },
            timestamp: Date.now(),
            actor: 'inventory'
          });
        }

        return {
          success: true,
          state: { products, reservations },
          events
        };
      }

      case 'UPDATE_STOCK': {
        const { productId, adjustment, reason } = event.payload;
        const product = products.get(productId);
        
        if (!product) {
          throw new Error('Product not found');
        }

        product.stock += adjustment;
        product.available = product.stock - product.reserved;
        product.updatedAt = Date.now();

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              productId,
              adjustment,
              reason,
              newStock: product.stock,
              timestamp: Date.now()
            },
            timestamp: Date.now(),
            actor: 'inventory'
          });
        }

        return {
          success: true,
          state: { products, reservations },
          events
        };
      }

      case 'CONFIRM_RESERVATION': {
        const { reservationId } = event.payload;
        const reservation = reservations.get(reservationId);
        
        if (!reservation) {
          throw new Error('Reservation not found');
        }

        reservation.status = 'confirmed';

        // Deduct from actual stock
        for (const item of reservation.items) {
          const product = products.get(item.productId);
          if (product) {
            product.stock -= item.quantity;
            product.reserved -= item.quantity;
            product.available = product.stock - product.reserved;
            product.updatedAt = Date.now();
          }
        }

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              reservationId,
              orderId: reservation.orderId
            },
            timestamp: Date.now(),
            actor: 'inventory'
          });
        }

        return {
          success: true,
          state: { products, reservations },
          events
        };
      }

      default:
        throw new Error(`Unknown event type: ${event.type}`);
    }
  }

  protected async executeQuery(event: Event, queryDef: any): Promise<any> {
    const products = this.getState('products') || new Map<string, Product>();
    const reservations = this.getState('reservations') || new Map<string, Reservation>();

    switch (event.type) {
      case 'GET_PRODUCT_STOCK': {
        const { productId } = event.payload;
        const product = products.get(productId);
        
        if (!product) {
          return null;
        }

        return {
          productId: product.id,
          stock: product.stock,
          reserved: product.reserved,
          available: product.available
        };
      }

      case 'GET_LOW_STOCK_PRODUCTS': {
        const lowStockProducts = Array.from(products.values())
          .filter(p => p.available <= p.lowStockThreshold);
        return lowStockProducts;
      }

      case 'GET_RESERVATION': {
        const { reservationId } = event.payload;
        return reservations.get(reservationId) || null;
      }

      default:
        throw new Error(`Unknown query type: ${event.type}`);
    }
  }

  protected async handleSubscription(event: Event, handler: any): Promise<void> {
    const products = this.getState('products') || new Map<string, Product>();
    const reservations = this.getState('reservations') || new Map<string, Reservation>();

    switch (event.type) {
      case 'CART_CHECKED_OUT': {
        const { cartId, items, userId } = event.payload;
        
        // Reserve stock for checkout
        await this.emit('RESERVE_STOCK', {
          orderId: `order_${cartId}`,
          items: items.map((item: any) => ({
            productId: item.productId,
            quantity: item.quantity
          }))
        });
        break;
      }

      case 'PAYMENT_PROCESSED': {
        const { orderId } = event.payload;
        
        // Find reservation by orderId
        const reservation = Array.from(reservations.values())
          .find(r => r.orderId === orderId && r.status === 'pending');
          
        if (reservation) {
          await this.emit('CONFIRM_RESERVATION', {
            reservationId: reservation.id
          });
        }
        break;
      }

      case 'PAYMENT_FAILED': {
        const { orderId } = event.payload;
        
        // Find and release reservation
        const reservation = Array.from(reservations.values())
          .find(r => r.orderId === orderId && r.status === 'pending');
          
        if (reservation) {
          await this.emit('RELEASE_STOCK', {
            reservationId: reservation.id
          });
        }
        break;
      }

      case 'ORDER_CANCELLED': {
        const { orderId } = event.payload;
        
        // Return stock to inventory
        const reservation = Array.from(reservations.values())
          .find(r => r.orderId === orderId && r.status === 'confirmed');
          
        if (reservation) {
          for (const item of reservation.items) {
            await this.emit('UPDATE_STOCK', {
              productId: item.productId,
              adjustment: item.quantity,
              reason: 'Order cancelled'
            });
          }
        }
        break;
      }
    }
  }

  protected async updateState(newState: any): Promise<void> {
    if (newState.products) this.setState('products', newState.products);
    if (newState.reservations) this.setState('reservations', newState.reservations);
  }
}