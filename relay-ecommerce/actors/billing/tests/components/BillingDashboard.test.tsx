import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BillingDashboard } from '../../components/web/BillingDashboard';

// Mock fetch
global.fetch = vi.fn();

// Mock the modal components
vi.mock('../../components/web/PaymentMethodModal', () => ({
  PaymentMethodModal: ({ onSuccess, onClose }: any) => (
    <div data-testid="payment-modal">
      <button onClick={() => { onSuccess(); }}>Save Payment Method</button>
      <button onClick={onClose}>Close</button>
    </div>
  )
}));

vi.mock('../../components/web/SubscriptionBadge', () => ({
  SubscriptionBadge: ({ status }: any) => <span data-testid="subscription-badge">{status}</span>
}));

describe('BillingDashboard', () => {
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
    },
    {
      id: 'inv_124',
      amount: 2999,
      currency: 'usd',
      status: 'open',
      dueDate: Date.now()
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
    render(<BillingDashboard customerId="user_123" />);
    expect(screen.getByTestId('loading-spinner', { exact: false })).toBeInTheDocument();
  });

  it('renders billing data after loading', async () => {
    render(<BillingDashboard customerId="user_123" />);

    await waitFor(() => {
      expect(screen.getByText('Billing & Subscriptions')).toBeInTheDocument();
    });

    // Check overview cards
    expect(screen.getByText('1')).toBeInTheDocument(); // Active subscriptions
    expect(screen.getByText('$299.99')).toBeInTheDocument(); // Total spent

    // Check subscription
    expect(screen.getByText('PRO MONTHLY Plan')).toBeInTheDocument();
    expect(screen.getByTestId('subscription-badge')).toHaveTextContent('active');
  });

  it('handles error when loading fails', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));
    
    render(<BillingDashboard customerId="user_123" />);

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  it('shows payment method section', async () => {
    render(<BillingDashboard customerId="user_123" />);

    await waitFor(() => {
      expect(screen.getByText('Payment Method')).toBeInTheDocument();
      expect(screen.getByText('•••• •••• •••• 4242')).toBeInTheDocument();
      expect(screen.getByText('Update Payment Method')).toBeInTheDocument();
    });
  });

  it('opens payment method modal when update is clicked', async () => {
    render(<BillingDashboard customerId="user_123" />);

    await waitFor(() => {
      fireEvent.click(screen.getByText('Update Payment Method'));
    });

    expect(screen.getByTestId('payment-modal')).toBeInTheDocument();
  });

  it('displays invoices correctly', async () => {
    render(<BillingDashboard customerId="user_123" />);

    await waitFor(() => {
      expect(screen.getByText('Recent Invoices')).toBeInTheDocument();
      expect(screen.getByText('$29.99')).toBeInTheDocument();
      expect(screen.getByText('paid')).toBeInTheDocument();
      expect(screen.getByText('open')).toBeInTheDocument();
    });
  });

  it('handles subscription cancellation', async () => {
    window.confirm = vi.fn(() => true);
    
    render(<BillingDashboard customerId="user_123" />);

    await waitFor(() => {
      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);
    });

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to cancel this subscription?');
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/actors/billing',
        expect.objectContaining({
          body: expect.stringContaining('CANCEL_SUBSCRIPTION')
        })
      );
    });
  });

  it('does not cancel subscription if user declines', async () => {
    window.confirm = vi.fn(() => false);
    
    render(<BillingDashboard customerId="user_123" />);

    await waitFor(() => {
      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);
    });

    expect(window.confirm).toHaveBeenCalled();
    
    // Should not call cancel API
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('CANCEL_SUBSCRIPTION')
      })
    );
  });

  it('shows no billing information message when customer is null', async () => {
    (global.fetch as any).mockImplementation(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: null })
      })
    );

    render(<BillingDashboard customerId="user_123" />);

    await waitFor(() => {
      expect(screen.getByText('No billing information')).toBeInTheDocument();
      expect(screen.getByText('Unable to load your billing data.')).toBeInTheDocument();
    });
  });

  it('shows empty state for no subscriptions', async () => {
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

    render(<BillingDashboard customerId="user_123" />);

    await waitFor(() => {
      expect(screen.getByText('No active subscriptions')).toBeInTheDocument();
    });
  });

  it('refreshes data after payment method update', async () => {
    render(<BillingDashboard customerId="user_123" />);

    await waitFor(() => {
      fireEvent.click(screen.getByText('Update Payment Method'));
    });

    const saveButton = screen.getByText('Save Payment Method');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.queryByTestId('payment-modal')).not.toBeInTheDocument();
    });

    // Should refetch data
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/actors/billing',
      expect.objectContaining({
        body: expect.stringContaining('GET_CUSTOMER')
      })
    );
  });
});