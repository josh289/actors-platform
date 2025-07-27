import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PaymentMethodModal } from '../../components/web/PaymentMethodModal';

// Mock fetch
global.fetch = vi.fn();

describe('PaymentMethodModal', () => {
  const mockOnSuccess = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });
  });

  it('renders modal with form fields', () => {
    render(
      <PaymentMethodModal
        customerId="user_123"
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Add Payment Method')).toBeInTheDocument();
    expect(screen.getByLabelText('Card Number')).toBeInTheDocument();
    expect(screen.getByLabelText('Month')).toBeInTheDocument();
    expect(screen.getByLabelText('Year')).toBeInTheDocument();
    expect(screen.getByLabelText('CVC')).toBeInTheDocument();
    expect(screen.getByLabelText('ZIP Code')).toBeInTheDocument();
  });

  it('closes modal when X button is clicked', () => {
    render(
      <PaymentMethodModal
        customerId="user_123"
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes modal when Cancel button is clicked', () => {
    render(
      <PaymentMethodModal
        customerId="user_123"
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('formats card number with spaces', () => {
    render(
      <PaymentMethodModal
        customerId="user_123"
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
      />
    );

    const cardInput = screen.getByLabelText('Card Number') as HTMLInputElement;
    fireEvent.change(cardInput, { target: { value: '4242424242424242' } });
    
    expect(cardInput.value).toBe('4242 4242 4242 4242');
  });

  it('limits input lengths correctly', () => {
    render(
      <PaymentMethodModal
        customerId="user_123"
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
      />
    );

    const monthInput = screen.getByLabelText('Month') as HTMLInputElement;
    const yearInput = screen.getByLabelText('Year') as HTMLInputElement;
    const cvcInput = screen.getByLabelText('CVC') as HTMLInputElement;
    const zipInput = screen.getByLabelText('ZIP Code') as HTMLInputElement;

    expect(monthInput.maxLength).toBe(2);
    expect(yearInput.maxLength).toBe(2);
    expect(cvcInput.maxLength).toBe(4);
    expect(zipInput.maxLength).toBe(5);
  });

  it('submits form with valid data', async () => {
    render(
      <PaymentMethodModal
        customerId="user_123"
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
      />
    );

    // Fill in form
    fireEvent.change(screen.getByLabelText('Card Number'), { target: { value: '4242424242424242' } });
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('CVC'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('ZIP Code'), { target: { value: '12345' } });

    // Submit form
    fireEvent.click(screen.getByText('Add Card'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/actors/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('UPDATE_PAYMENT_METHOD')
      });
    });

    expect(mockOnSuccess).toHaveBeenCalled();
  });

  it('shows error message on submission failure', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    render(
      <PaymentMethodModal
        customerId="user_123"
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
      />
    );

    // Fill in form
    fireEvent.change(screen.getByLabelText('Card Number'), { target: { value: '4242424242424242' } });
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('CVC'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('ZIP Code'), { target: { value: '12345' } });

    // Submit form
    fireEvent.click(screen.getByText('Add Card'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('disables submit button while loading', async () => {
    render(
      <PaymentMethodModal
        customerId="user_123"
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
      />
    );

    // Fill in form
    fireEvent.change(screen.getByLabelText('Card Number'), { target: { value: '4242424242424242' } });
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('CVC'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('ZIP Code'), { target: { value: '12345' } });

    const submitButton = screen.getByText('Add Card');
    fireEvent.click(submitButton);

    // Button should show loading state
    expect(screen.getByText('Adding...')).toBeInTheDocument();
    expect(submitButton.closest('button')).toBeDisabled();
  });

  it('shows security message', () => {
    render(
      <PaymentMethodModal
        customerId="user_123"
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Your payment information is encrypted and secure')).toBeInTheDocument();
  });

  it('validates form before submission', async () => {
    render(
      <PaymentMethodModal
        customerId="user_123"
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
      />
    );

    // Try to submit empty form
    fireEvent.submit(screen.getByRole('form', { hidden: true }));

    // Should not call API
    expect(global.fetch).not.toHaveBeenCalled();
  });
});