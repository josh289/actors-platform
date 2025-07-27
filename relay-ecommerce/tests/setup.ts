// Test setup file
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock external services
jest.mock('stripe', () => ({
  Stripe: jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        status: 'succeeded'
      })
    },
    paymentMethods: {
      retrieve: jest.fn().mockResolvedValue({
        id: 'pm_test_123',
        type: 'card',
        card: {
          brand: 'visa',
          last4: '4242',
          exp_month: 12,
          exp_year: 2025
        }
      })
    }
  }))
}));

// Global test utilities
global.testUtils = {
  generateId: () => `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  
  waitFor: async (condition: () => boolean, timeout = 5000) => {
    const start = Date.now();
    while (!condition() && Date.now() - start < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!condition()) {
      throw new Error('Timeout waiting for condition');
    }
  }
};