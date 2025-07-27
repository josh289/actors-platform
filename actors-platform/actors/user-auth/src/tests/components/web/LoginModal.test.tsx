import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginModal } from '../../../components/web/LoginModal';

// Mock the useActor hook
const mockTell = vi.fn();
const mockAsk = vi.fn();
vi.mock('@actors-platform/sdk', () => ({
  useActor: () => ({
    tell: mockTell,
    ask: mockAsk,
  }),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('LoginModal', () => {
  const mockOnSuccess = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render email step initially', () => {
    render(<LoginModal onSuccess={mockOnSuccess} onClose={mockOnClose} />);
    
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByText('Send magic link')).toBeInTheDocument();
  });

  it('should close modal on close button click', () => {
    render(<LoginModal onSuccess={mockOnSuccess} onClose={mockOnClose} />);
    
    const closeButton = screen.getByLabelText('Close modal');
    fireEvent.click(closeButton);
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close modal on backdrop click', () => {
    render(<LoginModal onSuccess={mockOnSuccess} onClose={mockOnClose} />);
    
    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop);
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should not close modal on container click', () => {
    render(<LoginModal onSuccess={mockOnSuccess} onClose={mockOnClose} />);
    
    const title = screen.getByText('Sign in to your account');
    fireEvent.click(title);
    
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should close modal on escape key', () => {
    render(<LoginModal onSuccess={mockOnSuccess} onClose={mockOnClose} />);
    
    fireEvent.keyDown(document, { key: 'Escape' });
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should send magic link and proceed to token step', async () => {
    mockTell.mockResolvedValueOnce({
      success: true,
      events: []
    });
    
    render(<LoginModal onSuccess={mockOnSuccess} onClose={mockOnClose} />);
    
    const emailInput = screen.getByLabelText('Email address');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    
    const sendButton = screen.getByText('Send magic link');
    fireEvent.click(sendButton);
    
    await waitFor(() => {
      expect(mockTell).toHaveBeenCalledWith({
        type: 'SEND_MAGIC_LINK',
        payload: {
          email: 'test@example.com',
          ipAddress: '0.0.0.0',
          userAgent: expect.any(String)
        }
      });
      expect(screen.getByText('Check your email')).toBeInTheDocument();
      expect(screen.getByText(/We sent a magic link to/)).toBeInTheDocument();
    });
  });

  it('should show error on failed magic link send', async () => {
    mockTell.mockResolvedValueOnce({
      success: false,
      error: new Error('Account is temporarily locked')
    });
    
    render(<LoginModal onSuccess={mockOnSuccess} onClose={mockOnClose} />);
    
    const emailInput = screen.getByLabelText('Email address');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    
    const sendButton = screen.getByText('Send magic link');
    fireEvent.click(sendButton);
    
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Account is temporarily locked');
    });
  });

  it('should verify token and call onSuccess', async () => {
    // First send magic link
    mockTell.mockResolvedValueOnce({
      success: true,
      events: []
    });
    
    render(<LoginModal onSuccess={mockOnSuccess} onClose={mockOnClose} />);
    
    const emailInput = screen.getByLabelText('Email address');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByText('Send magic link'));
    
    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
    
    // Then verify token
    mockTell.mockResolvedValueOnce({
      success: true,
      data: {
        token: 'session-token',
        userId: 'user-123'
      }
    });
    
    mockAsk.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User'
      }
    });
    
    const tokenInput = screen.getByLabelText('Verification code');
    fireEvent.change(tokenInput, { target: { value: 'test-token' } });
    
    const verifyButton = screen.getByText('Verify code');
    fireEvent.click(verifyButton);
    
    await waitFor(() => {
      expect(mockTell).toHaveBeenCalledWith({
        type: 'VERIFY_MAGIC_LINK',
        payload: {
          token: 'test-token',
          email: 'test@example.com'
        }
      });
      expect(localStorageMock.setItem).toHaveBeenCalledWith('auth_token', 'session-token');
      expect(mockOnSuccess).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User'
      });
    });
  });

  it('should show error on invalid token', async () => {
    // First send magic link
    mockTell.mockResolvedValueOnce({
      success: true,
      events: []
    });
    
    render(<LoginModal onSuccess={mockOnSuccess} onClose={mockOnClose} />);
    
    const emailInput = screen.getByLabelText('Email address');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByText('Send magic link'));
    
    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
    
    // Then fail token verification
    mockTell.mockResolvedValueOnce({
      success: false,
      error: new Error('Invalid or expired token')
    });
    
    const tokenInput = screen.getByLabelText('Verification code');
    fireEvent.change(tokenInput, { target: { value: 'invalid-token' } });
    
    const verifyButton = screen.getByText('Verify code');
    fireEvent.click(verifyButton);
    
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid or expired token');
    });
  });

  it('should allow going back to email step', async () => {
    // First send magic link
    mockTell.mockResolvedValueOnce({
      success: true,
      events: []
    });
    
    render(<LoginModal onSuccess={mockOnSuccess} onClose={mockOnClose} />);
    
    const emailInput = screen.getByLabelText('Email address');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByText('Send magic link'));
    
    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
    
    // Click back button
    const backButton = screen.getByText('Try a different email');
    fireEvent.click(backButton);
    
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  it('should show loading states', async () => {
    mockTell.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ success: true }), 100)));
    
    render(<LoginModal onSuccess={mockOnSuccess} onClose={mockOnClose} />);
    
    const emailInput = screen.getByLabelText('Email address');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    
    const sendButton = screen.getByText('Send magic link');
    fireEvent.click(sendButton);
    
    expect(screen.getByText('Sending...')).toBeInTheDocument();
    expect(sendButton).toBeDisabled();
    
    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
  });
});