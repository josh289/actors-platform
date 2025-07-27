import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { LoginForm } from '../../components/web/LoginForm';

// Mock fetch
global.fetch = vi.fn();

describe('LoginForm Component', () => {
  const mockOnSuccess = vi.fn();
  const mockOnError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render login form with email input', () => {
    render(
      <LoginForm onSuccess={mockOnSuccess} onError={mockOnError} />
    );

    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    expect(screen.getByText('Send Magic Link')).toBeInTheDocument();
  });

  it('should validate email format before submission', async () => {
    render(
      <LoginForm onSuccess={mockOnSuccess} onError={mockOnError} />
    );

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByText('Send Magic Link');

    // Try with invalid email
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.click(submitButton);

    // Should not call API with invalid email
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should show loading state during submission', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <LoginForm onSuccess={mockOnSuccess} onError={mockOnError} />
    );

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByText('Send Magic Link');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    // Should show loading state
    expect(screen.getByText('Sending...')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByText('Send Magic Link')).toBeInTheDocument();
    });
  });

  it('should call onSuccess after successful submission', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <LoginForm onSuccess={mockOnSuccess} onError={mockOnError} />
    );

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByText('Send Magic Link');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith({ email: 'test@example.com' });
    });

    expect(screen.getByText('Check your email for the magic link!')).toBeInTheDocument();
  });

  it('should call onError when API request fails', async () => {
    const errorMessage = 'Failed to send magic link';
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: errorMessage }),
    });

    render(
      <LoginForm onSuccess={mockOnSuccess} onError={mockOnError} />
    );

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByText('Send Magic Link');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled();
    });

    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('should disable form during submission', async () => {
    (global.fetch as any).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    render(
      <LoginForm onSuccess={mockOnSuccess} onError={mockOnError} />
    );

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByText('Send Magic Link');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    // Input and button should be disabled
    expect(emailInput).toBeDisabled();
    expect(submitButton).toBeDisabled();
  });

  it('should handle network errors gracefully', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    render(
      <LoginForm onSuccess={mockOnSuccess} onError={mockOnError} />
    );

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByText('Send Magic Link');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(expect.any(Error));
    });

    expect(screen.getByText('Failed to send magic link')).toBeInTheDocument();
  });

  it('should submit form on Enter key press', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <LoginForm onSuccess={mockOnSuccess} onError={mockOnError} />
    );

    const emailInput = screen.getByLabelText('Email Address');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.keyPress(emailInput, { key: 'Enter', code: 13, charCode: 13 });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/magic-link',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com' }),
        })
      );
    });
  });

  it('should clear success message when email changes', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <LoginForm onSuccess={mockOnSuccess} onError={mockOnError} />
    );

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByText('Send Magic Link');

    // First submission
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Check your email for the magic link!')).toBeInTheDocument();
    });

    // Change email
    fireEvent.change(emailInput, { target: { value: 'another@example.com' } });

    // Success message should be cleared
    expect(screen.queryByText('Check your email for the magic link!')).not.toBeInTheDocument();
  });
});