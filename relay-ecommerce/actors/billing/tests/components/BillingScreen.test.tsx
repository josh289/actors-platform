import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { BillingScreen } from '../../components/mobile/BillingScreen';

// Mock fetch
global.fetch = vi.fn();

// Mock Alert
vi.spyOn(Alert, 'alert');

// Mock PaymentSheet
vi.mock('../../components/mobile/PaymentSheet', () => ({
  PaymentSheet: ({ onComplete }: any) => {
    return (
      <MockModal testID="payment-sheet">
        <MockButton
          onPress={() => onComplete({ success: true })}
          title="Complete Payment"
        />
      </MockModal>
    );
  }
}));

// Mock components for React Native testing
const MockModal = ({ children, testID }: any) => (
  <div data-testid={testID}>{children}</div>
);

const MockButton = ({ onPress, title }: any) => (
  <button onClick={onPress}>{title}</button>
);

describe('BillingScreen', () => {
  const mockCustomerData = {
    id: 'user_123',
    email: 'test@example.com',
    defaultPaymentMethod: 'pm_123',
    subscriptions: [
      {
        id: 'sub_123',
        status: 'active',
        planId: 'pro_monthly',
        currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false
      }
    ],
    metrics: {
      activeSubscriptions: 1,
      totalRevenue: 299.99
    }
  };

  const mockInvoices = [
    {
      id: 'inv_123',
      amount: 2999,
      currency: 'usd',
      status: 'paid',
      dueDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
      paidAt: Date.now() - 30 * 24 * 60 * 60 * 1000
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockImplementation((url: string, options: any) => {
      const body = JSON.parse(options.body);
      
      if (body.event_type === 'GET_CUSTOMER') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: mockCustomerData })
        });
      }
      
      if (body.event_type === 'LIST_INVOICES') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: mockInvoices })
        });
      }

      if (body.event_type === 'CANCEL_SUBSCRIPTION') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        });
      }
      
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'Unknown request' })
      });
    });
  });

  it('renders loading state initially', () => {
    const { getByTestId } = render(<BillingScreen customerId="user_123" />);
    expect(getByTestId('activity-indicator')).toBeTruthy();
  });

  it('renders billing data after loading', async () => {
    const { getByText } = render(<BillingScreen customerId="user_123" />);

    await waitFor(() => {
      expect(getByText('Active Subscriptions')).toBeTruthy();
      expect(getByText('1')).toBeTruthy();
      expect(getByText('$299.99')).toBeTruthy();
    });
  });

  it('handles error when loading fails', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));
    
    render(<BillingScreen customerId="user_123" />);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to load billing information');
    });
  });

  it('shows payment method section', async () => {
    const { getByText } = render(<BillingScreen customerId="user_123" />);

    await waitFor(() => {
      expect(getByText('Payment Method')).toBeTruthy();
      expect(getByText('•••• •••• •••• 4242')).toBeTruthy();
      expect(getByText('Update')).toBeTruthy();
    });
  });

  it('shows no payment method when not set', async () => {
    const customerWithoutPayment = { ...mockCustomerData, defaultPaymentMethod: null };
    (global.fetch as any).mockImplementation((url: string, options: any) => {
      const body = JSON.parse(options.body);
      
      if (body.event_type === 'GET_CUSTOMER') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: customerWithoutPayment })
        });
      }
      
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [] })
      });
    });

    const { getByText } = render(<BillingScreen customerId="user_123" />);

    await waitFor(() => {
      expect(getByText('No payment method on file')).toBeTruthy();
      expect(getByText('Add')).toBeTruthy();
    });
  });

  it('opens payment sheet when payment method button is pressed', async () => {
    const { getByText, getByTestId } = render(<BillingScreen customerId="user_123" />);

    await waitFor(() => {
      fireEvent.press(getByText('Update'));
    });

    expect(getByTestId('payment-sheet')).toBeTruthy();
  });

  it('displays subscription details', async () => {
    const { getByText, getByTestId } = render(<BillingScreen customerId="user_123" />);

    await waitFor(() => {
      expect(getByText('PRO MONTHLY Plan')).toBeTruthy();
      expect(getByTestId('subscription-badge')).toBeTruthy();
      expect(getByText(/Renews on/)).toBeTruthy();
    });
  });

  it('handles subscription cancellation', async () => {
    Alert.alert = vi.fn((title, message, buttons) => {
      // Simulate pressing "Yes, Cancel"
      buttons?.[1]?.onPress?.();
    });
    
    const { getByText } = render(<BillingScreen customerId="user_123" />);

    await waitFor(() => {
      fireEvent.press(getByText('Cancel'));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Cancel Subscription',
      'Are you sure you want to cancel this subscription?',
      expect.any(Array)
    );
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/actors/billing',
        expect.objectContaining({
          body: expect.stringContaining('CANCEL_SUBSCRIPTION')
        })
      );
    });
  });

  it('displays invoices correctly', async () => {
    const { getByText } = render(<BillingScreen customerId="user_123" />);

    await waitFor(() => {
      expect(getByText('Recent Invoices')).toBeTruthy();
      expect(getByText('$29.99')).toBeTruthy();
      expect(getByText('paid')).toBeTruthy();
    });
  });

  it('shows empty states correctly', async () => {
    const customerWithNoSubs = { ...mockCustomerData, subscriptions: [] };
    (global.fetch as any).mockImplementation((url: string, options: any) => {
      const body = JSON.parse(options.body);
      
      if (body.event_type === 'GET_CUSTOMER') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: customerWithNoSubs })
        });
      }
      
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [] })
      });
    });

    const { getByText } = render(<BillingScreen customerId="user_123" />);

    await waitFor(() => {
      expect(getByText('No active subscriptions')).toBeTruthy();
      expect(getByText('No invoices yet')).toBeTruthy();
    });
  });

  it('handles pull to refresh', async () => {
    const { getByTestId } = render(<BillingScreen customerId="user_123" />);

    await waitFor(() => {
      const scrollView = getByTestId('scroll-view');
      fireEvent(scrollView, 'refresh');
    });

    // Should refetch data
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/actors/billing',
      expect.objectContaining({
        body: expect.stringContaining('GET_CUSTOMER')
      })
    );
  });

  it('updates data after payment sheet completion', async () => {
    const { getByText, getByTestId } = render(<BillingScreen customerId="user_123" />);

    await waitFor(() => {
      fireEvent.press(getByText('Update'));
    });

    const completeButton = getByText('Complete Payment');
    fireEvent.press(completeButton);

    await waitFor(() => {
      expect(getByTestId('payment-sheet')).not.toBeTruthy();
    });

    // Should refetch data
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/actors/billing',
      expect.objectContaining({
        body: expect.stringContaining('GET_CUSTOMER')
      })
    );
  });

  it('shows unable to load message when customer is null', async () => {
    (global.fetch as any).mockImplementation(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: null })
      })
    );

    const { getByText, getByTestId } = render(<BillingScreen customerId="user_123" />);

    await waitFor(() => {
      expect(getByText('Unable to load billing data')).toBeTruthy();
      expect(getByTestId('alert-icon')).toBeTruthy();
    });
  });

  it('handles subscription with cancel at period end', async () => {
    const subWithCancel = {
      ...mockCustomerData.subscriptions[0],
      cancelAtPeriodEnd: true
    };
    const customerWithCancelingS

= { ...mockCustomerData, subscriptions: [subWithCancel] };
    
    (global.fetch as any).mockImplementation((url: string, options: any) => {
      const body = JSON.parse(options.body);
      
      if (body.event_type === 'GET_CUSTOMER') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: customerWithCancelingS
ub })
        });
      }
      
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [] })
      });
    });

    const { getByText, queryByText } = render(<BillingScreen customerId="user_123" />);

    await waitFor(() => {
      expect(getByText(/Cancels on/)).toBeTruthy();
      expect(queryByText('Cancel')).not.toBeTruthy(); // Cancel button should not show
    });
  });
});