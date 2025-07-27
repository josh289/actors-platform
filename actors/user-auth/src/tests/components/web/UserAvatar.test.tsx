import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserAvatar } from '../../../components/web/UserAvatar';

// Mock the useActor hook
const mockAsk = vi.fn();
const mockTell = vi.fn();
vi.mock('@actors-platform/sdk', () => ({
  useActor: () => ({
    ask: mockAsk,
    tell: mockTell,
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

// Mock window.location
delete (window as any).location;
window.location = { href: '' } as any;

describe('UserAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.href = '';
  });

  it('should render loading state initially', () => {
    render(<UserAvatar userId="user-123" />);
    
    expect(screen.getByTestId('user-avatar-skeleton')).toBeInTheDocument();
  });

  it('should render user avatar with image', async () => {
    mockAsk.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: 'https://example.com/avatar.jpg'
      }
    });
    
    render(<UserAvatar userId="user-123" />);
    
    await waitFor(() => {
      const img = screen.getByRole('img', { name: 'Test User' });
      expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    });
  });

  it('should render placeholder with initials when no avatar', async () => {
    mockAsk.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: null
      }
    });
    
    render(<UserAvatar userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByText('T')).toBeInTheDocument();
    });
  });

  it('should use email initial when no name', async () => {
    mockAsk.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'user-123',
        email: 'test@example.com',
        name: null,
        avatar: null
      }
    });
    
    render(<UserAvatar userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByText('T')).toBeInTheDocument();
    });
  });

  it('should apply correct size classes', async () => {
    mockAsk.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: null
      }
    });
    
    const { container } = render(<UserAvatar userId="user-123" size="lg" />);
    
    await waitFor(() => {
      expect(container.querySelector('.user-avatar--lg')).toBeInTheDocument();
    });
  });

  it('should toggle dropdown on click', async () => {
    mockAsk.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: null
      }
    });
    
    render(<UserAvatar userId="user-123" />);
    
    await waitFor(() => {
      const button = screen.getByRole('button');
      fireEvent.click(button);
    });
    
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('should not show dropdown when showDropdown is false', async () => {
    mockAsk.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: null
      }
    });
    
    render(<UserAvatar userId="user-123" showDropdown={false} />);
    
    await waitFor(() => {
      const button = screen.getByRole('button');
      fireEvent.click(button);
    });
    
    expect(screen.queryByText('Profile')).not.toBeInTheDocument();
  });

  it('should close dropdown on outside click', async () => {
    mockAsk.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: null
      }
    });
    
    render(<UserAvatar userId="user-123" />);
    
    await waitFor(() => {
      const button = screen.getByRole('button');
      fireEvent.click(button);
    });
    
    expect(screen.getByText('Profile')).toBeInTheDocument();
    
    // Click outside
    fireEvent.mouseDown(document.body);
    
    await waitFor(() => {
      expect(screen.queryByText('Profile')).not.toBeInTheDocument();
    });
  });

  it('should handle logout', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    
    mockAsk.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: null
      }
    });
    
    mockTell.mockResolvedValueOnce({ success: true });
    
    render(<UserAvatar userId="user-123" />);
    
    await waitFor(() => {
      const button = screen.getByRole('button');
      fireEvent.click(button);
    });
    
    const logoutButton = screen.getByText('Logout');
    fireEvent.click(logoutButton);
    
    await waitFor(() => {
      expect(mockTell).toHaveBeenCalledWith({
        type: 'REVOKE_SESSION',
        payload: { sessionId: 'test-token' }
      });
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token');
      expect(window.location.href).toBe('/login');
    });
  });

  it('should handle failed user fetch', async () => {
    mockAsk.mockResolvedValueOnce({
      success: false,
      error: new Error('User not found')
    });
    
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const { container } = render(<UserAvatar userId="user-123" />);
    
    await waitFor(() => {
      expect(container.querySelector('.user-avatar__button')).not.toBeInTheDocument();
    });
    
    consoleSpy.mockRestore();
  });

  it('should show user info in dropdown', async () => {
    mockAsk.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: null
      }
    });
    
    render(<UserAvatar userId="user-123" />);
    
    await waitFor(() => {
      const button = screen.getByRole('button');
      fireEvent.click(button);
    });
    
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });
});