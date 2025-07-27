import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthStatus } from '../../../components/web/AuthStatus';

// Mock the useActor hook
const mockAsk = vi.fn();
vi.mock('@actors-platform/sdk', () => ({
  useActor: () => ({
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

describe('AuthStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render nothing when no auth token exists', async () => {
    localStorageMock.getItem.mockReturnValue(null);
    
    const { container } = render(<AuthStatus />);
    
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('should render loading state initially', () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    
    render(<AuthStatus />);
    
    expect(screen.getByTestId('auth-status-skeleton')).toBeInTheDocument();
  });

  it('should render user info when authenticated', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    
    mockAsk
      .mockResolvedValueOnce({
        success: true,
        data: { userId: 'user-123', token: 'test-token' }
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          avatar: null
        }
      });
    
    render(<AuthStatus />);
    
    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('T')).toBeInTheDocument(); // Avatar placeholder
    });
  });

  it('should show email when name is not available', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    
    mockAsk
      .mockResolvedValueOnce({
        success: true,
        data: { userId: 'user-123', token: 'test-token' }
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'user-123',
          email: 'test@example.com',
          name: null,
          avatar: null
        }
      });
    
    render(<AuthStatus />);
    
    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });
  });

  it('should render avatar image when available', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    
    mockAsk
      .mockResolvedValueOnce({
        success: true,
        data: { userId: 'user-123', token: 'test-token' }
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          avatar: 'https://example.com/avatar.jpg'
        }
      });
    
    render(<AuthStatus />);
    
    await waitFor(() => {
      const img = screen.getByRole('img', { name: 'Test User' });
      expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    });
  });

  it('should hide avatar when showAvatar is false', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    
    mockAsk
      .mockResolvedValueOnce({
        success: true,
        data: { userId: 'user-123', token: 'test-token' }
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          avatar: null
        }
      });
    
    render(<AuthStatus showAvatar={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.queryByText('T')).not.toBeInTheDocument();
    });
  });

  it('should hide name when showName is false', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    
    mockAsk
      .mockResolvedValueOnce({
        success: true,
        data: { userId: 'user-123', token: 'test-token' }
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          avatar: null
        }
      });
    
    render(<AuthStatus showName={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('T')).toBeInTheDocument(); // Avatar placeholder
      expect(screen.queryByText('Test User')).not.toBeInTheDocument();
    });
  });

  it('should handle failed session verification', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    
    mockAsk.mockResolvedValueOnce({
      success: false,
      error: new Error('Invalid session')
    });
    
    const { container } = render(<AuthStatus />);
    
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('should handle errors gracefully', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    
    mockAsk.mockRejectedValueOnce(new Error('Network error'));
    
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const { container } = render(<AuthStatus />);
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to check auth status:', expect.any(Error));
      expect(container.firstChild).toBeNull();
    });
    
    consoleSpy.mockRestore();
  });
});