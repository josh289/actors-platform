import { RelayActor, Result } from '../../runtime/actor-base';
import { Event } from '../../services/event-catalog';

interface PaymentMethod {
  id: string;
  userId: string;
  type: 'card' | 'bank_account';
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  stripePaymentMethodId: string;
  createdAt: number;
}

interface Transaction {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  method: string;
  stripePaymentId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface Refund {
  id: string;
  transactionId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'succeeded' | 'failed';
  stripeRefundId?: string;
  createdAt: number;
}

// Mock Stripe integration
class MockStripe {
  async processPayment(amount: number, currency: string, paymentMethodId: string): Promise<{success: boolean; paymentId?: string; error?: string}> {
    // Simulate payment processing
    const success = Math.random() > 0.1; // 90% success rate
    
    if (success) {
      return {
        success: true,
        paymentId: `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
    } else {
      return {
        success: false,
        error: 'Card declined'
      };
    }
  }

  async refundPayment(paymentId: string, amount: number): Promise<{success: boolean; refundId?: string; error?: string}> {
    return {
      success: true,
      refundId: `re_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  async getPaymentMethod(stripePaymentMethodId: string): Promise<any> {
    return {
      id: stripePaymentMethodId,
      type: 'card',
      card: {
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2025
      }
    };
  }
}

export class PaymentActor extends RelayActor {
  private stripe = new MockStripe();

  protected async processEvent(event: Event, handler: any): Promise<Result> {
    const events: Event[] = [];
    const paymentMethods = this.getState('paymentMethods') || new Map<string, PaymentMethod>();
    const transactions = this.getState('transactions') || new Map<string, Transaction>();
    const refunds = this.getState('refunds') || new Map<string, Refund>();

    switch (event.type) {
      case 'PROCESS_PAYMENT': {
        const { orderId, userId, amount, currency, paymentMethodId } = event.payload;
        
        // Create transaction record
        const transaction: Transaction = {
          id: this.generateId(),
          orderId,
          userId,
          amount,
          currency,
          status: 'pending',
          method: paymentMethodId,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        transactions.set(transaction.id, transaction);

        // Process payment with Stripe
        const result = await this.stripe.processPayment(amount, currency, paymentMethodId);

        if (result.success) {
          transaction.status = 'succeeded';
          transaction.stripePaymentId = result.paymentId;
          
          if (handler.emits) {
            events.push({
              id: this.generateId(),
              type: handler.emits,
              payload: {
                transactionId: transaction.id,
                orderId,
                userId,
                amount,
                currency,
                method: paymentMethodId,
                paymentId: result.paymentId,
                timestamp: Date.now()
              },
              timestamp: Date.now(),
              actor: 'payment'
            });
          }

          // Track revenue
          events.push({
            id: this.generateId(),
            type: 'TRACK_REVENUE',
            payload: {
              userId,
              amount,
              currency,
              orderId
            },
            timestamp: Date.now(),
            actor: 'payment'
          });

          // Send receipt
          events.push({
            id: this.generateId(),
            type: 'SEND_EMAIL',
            payload: {
              userId,
              template: 'payment-receipt',
              data: {
                orderId,
                amount,
                currency,
                paymentId: result.paymentId
              }
            },
            timestamp: Date.now(),
            actor: 'payment'
          });
        } else {
          transaction.status = 'failed';
          transaction.error = result.error;
          
          events.push({
            id: this.generateId(),
            type: 'PAYMENT_FAILED',
            payload: {
              orderId,
              userId,
              reason: result.error,
              code: 'payment_declined',
              timestamp: Date.now()
            },
            timestamp: Date.now(),
            actor: 'payment'
          });
        }

        transaction.updatedAt = Date.now();

        return {
          success: result.success,
          state: { paymentMethods, transactions, refunds },
          events,
          response: {
            success: result.success,
            transactionId: transaction.id,
            error: result.error
          }
        };
      }

      case 'REFUND_PAYMENT': {
        const { transactionId, amount, reason } = event.payload;
        const transaction = transactions.get(transactionId);
        
        if (!transaction) {
          throw new Error('Transaction not found');
        }

        if (transaction.status !== 'succeeded') {
          throw new Error('Can only refund successful transactions');
        }

        if (amount > transaction.amount) {
          throw new Error('Refund amount exceeds transaction amount');
        }

        const refund: Refund = {
          id: this.generateId(),
          transactionId,
          amount,
          reason,
          status: 'pending',
          createdAt: Date.now()
        };

        refunds.set(refund.id, refund);

        // Process refund with Stripe
        const result = await this.stripe.refundPayment(transaction.stripePaymentId!, amount);

        if (result.success) {
          refund.status = 'succeeded';
          refund.stripeRefundId = result.refundId;
          
          // Update transaction status if fully refunded
          if (amount === transaction.amount) {
            transaction.status = 'refunded';
          }

          if (handler.emits) {
            events.push({
              id: this.generateId(),
              type: handler.emits,
              payload: {
                refundId: refund.id,
                transactionId,
                amount,
                reason,
                timestamp: Date.now()
              },
              timestamp: Date.now(),
              actor: 'payment'
            });
          }
        } else {
          refund.status = 'failed';
        }

        return {
          success: result.success,
          state: { paymentMethods, transactions, refunds },
          events,
          response: {
            success: result.success,
            refundId: refund.id
          }
        };
      }

      case 'ADD_PAYMENT_METHOD': {
        const { userId, stripePaymentMethodId, setAsDefault } = event.payload;
        
        // Get payment method details from Stripe
        const stripeMethod = await this.stripe.getPaymentMethod(stripePaymentMethodId);
        
        const paymentMethod: PaymentMethod = {
          id: this.generateId(),
          userId,
          type: stripeMethod.type,
          last4: stripeMethod.card.last4,
          brand: stripeMethod.card.brand,
          expiryMonth: stripeMethod.card.exp_month,
          expiryYear: stripeMethod.card.exp_year,
          isDefault: setAsDefault || paymentMethods.size === 0,
          stripePaymentMethodId,
          createdAt: Date.now()
        };

        // If setting as default, update other methods
        if (paymentMethod.isDefault) {
          for (const method of paymentMethods.values()) {
            if (method.userId === userId) {
              method.isDefault = false;
            }
          }
        }

        paymentMethods.set(paymentMethod.id, paymentMethod);

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              paymentMethodId: paymentMethod.id,
              userId,
              last4: paymentMethod.last4,
              brand: paymentMethod.brand
            },
            timestamp: Date.now(),
            actor: 'payment'
          });
        }

        return {
          success: true,
          state: { paymentMethods, transactions, refunds },
          events,
          response: { paymentMethodId: paymentMethod.id }
        };
      }

      case 'REMOVE_PAYMENT_METHOD': {
        const { paymentMethodId, userId } = event.payload;
        const paymentMethod = paymentMethods.get(paymentMethodId);
        
        if (!paymentMethod || paymentMethod.userId !== userId) {
          throw new Error('Payment method not found');
        }

        paymentMethods.delete(paymentMethodId);

        // If was default, set another as default
        if (paymentMethod.isDefault) {
          const userMethods = Array.from(paymentMethods.values())
            .filter(m => m.userId === userId);
          
          if (userMethods.length > 0) {
            userMethods[0].isDefault = true;
          }
        }

        if (handler.emits) {
          events.push({
            id: this.generateId(),
            type: handler.emits,
            payload: {
              paymentMethodId,
              userId
            },
            timestamp: Date.now(),
            actor: 'payment'
          });
        }

        return {
          success: true,
          state: { paymentMethods, transactions, refunds },
          events
        };
      }

      default:
        throw new Error(`Unknown event type: ${event.type}`);
    }
  }

  protected async executeQuery(event: Event, queryDef: any): Promise<any> {
    const paymentMethods = this.getState('paymentMethods') || new Map<string, PaymentMethod>();
    const transactions = this.getState('transactions') || new Map<string, Transaction>();

    switch (event.type) {
      case 'GET_PAYMENT_METHODS': {
        const { userId } = event.payload;
        return Array.from(paymentMethods.values())
          .filter(m => m.userId === userId)
          .sort((a, b) => b.isDefault ? 1 : -1);
      }

      case 'GET_TRANSACTION': {
        const { transactionId } = event.payload;
        return transactions.get(transactionId) || null;
      }

      case 'GET_ORDER_PAYMENT': {
        const { orderId } = event.payload;
        return Array.from(transactions.values())
          .find(t => t.orderId === orderId) || null;
      }

      default:
        throw new Error(`Unknown query type: ${event.type}`);
    }
  }

  protected async handleSubscription(event: Event, handler: any): Promise<void> {
    switch (event.type) {
      case 'ORDER_CREATED': {
        const { orderId, userId, total } = event.payload;
        
        // Get default payment method
        const paymentMethods = this.getState('paymentMethods') || new Map<string, PaymentMethod>();
        const defaultMethod = Array.from(paymentMethods.values())
          .find(m => m.userId === userId && m.isDefault);
        
        if (defaultMethod) {
          await this.emit('PROCESS_PAYMENT', {
            orderId,
            userId,
            amount: total,
            currency: 'usd',
            paymentMethodId: defaultMethod.stripePaymentMethodId
          });
        }
        break;
      }

      case 'ORDER_CANCELLED': {
        const { orderId } = event.payload;
        const transactions = this.getState('transactions') || new Map<string, Transaction>();
        
        const transaction = Array.from(transactions.values())
          .find(t => t.orderId === orderId && t.status === 'succeeded');
        
        if (transaction) {
          await this.emit('REFUND_PAYMENT', {
            transactionId: transaction.id,
            amount: transaction.amount,
            reason: 'Order cancelled'
          });
        }
        break;
      }
    }
  }

  protected async updateState(newState: any): Promise<void> {
    if (newState.paymentMethods) this.setState('paymentMethods', newState.paymentMethods);
    if (newState.transactions) this.setState('transactions', newState.transactions);
    if (newState.refunds) this.setState('refunds', newState.refunds);
  }
}