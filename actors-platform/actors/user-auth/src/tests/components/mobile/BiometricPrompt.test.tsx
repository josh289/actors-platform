import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BiometricPrompt } from '../../components/mobile/BiometricPrompt';
import * as LocalAuthentication from 'expo-local-authentication';
import { useActor } from '@actors-platform/web-client';

// Mock expo-local-authentication
vi.mock('expo-local-authentication', () => ({
  hasHardwareAsync: vi.fn(),
  isEnrolledAsync: vi.fn(),
  authenticateAsync: vi.fn(),
  SecurityLevel: {
    NONE: 0,
    SECRET: 1,
    BIOMETRIC: 2,
  },
}));

vi.mock('@actors-platform/web-client', () => ({
  useActor: vi.fn(),
}));

describe('BiometricPrompt Component', () => {
  const mockUseActor = useActor as jest.MockedFunction<typeof useActor>;
  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default successful biometric setup
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
    (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
  });
  
  it('should render biometric prompt when visible', () => {
    mockUseActor.mockReturnValue({
      state: {},
      status: 'ready',
      connected: true,
      sendMessage: vi.fn(),
      updateState: vi.fn(),
    });
    
    render(
      <BiometricPrompt 
        visible={true}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    );
    
    expect(screen.getByTestId('biometric-prompt')).toBeTruthy();
    expect(screen.getByText('Authenticate')).toBeTruthy();
    expect(screen.getByText('Use biometrics to sign in')).toBeTruthy();
  });
  
  it('should not render when not visible', () => {
    mockUseActor.mockReturnValue({
      state: {},
      status: 'ready',
      connected: true,
      sendMessage: vi.fn(),
      updateState: vi.fn(),
    });
    
    render(
      <BiometricPrompt 
        visible={false}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    );
    
    expect(screen.queryByTestId('biometric-prompt')).toBeNull();
  });
  
  it('should check biometric availability on mount', async () => {
    mockUseActor.mockReturnValue({
      state: {},
      status: 'ready',
      connected: true,
      sendMessage: vi.fn(),
      updateState: vi.fn(),
    });
    
    render(
      <BiometricPrompt 
        visible={true}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    );
    
    await waitFor(() => {
      expect(LocalAuthentication.hasHardwareAsync).toHaveBeenCalled();
      expect(LocalAuthentication.isEnrolledAsync).toHaveBeenCalled();
    });
  });
  
  it('should show unavailable message when no hardware', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false);
    
    mockUseActor.mockReturnValue({
      state: {},
      status: 'ready',
      connected: true,
      sendMessage: vi.fn(),
      updateState: vi.fn(),
    });
    
    render(
      <BiometricPrompt 
        visible={true}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText('Biometric authentication not available')).toBeTruthy();
      expect(screen.getByText('This device does not support biometric authentication')).toBeTruthy();
    });
  });
  
  it('should show enrollment message when not enrolled', async () => {
    (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(false);
    
    mockUseActor.mockReturnValue({
      state: {},
      status: 'ready',
      connected: true,
      sendMessage: vi.fn(),
      updateState: vi.fn(),
    });
    
    render(
      <BiometricPrompt 
        visible={true}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText('No biometrics enrolled')).toBeTruthy();
      expect(screen.getByText('Please set up biometrics in your device settings')).toBeTruthy();
    });
  });
  
  it('should handle successful authentication', async () => {
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
      success: true,
    });
    
    const sendMessage = vi.fn().mockResolvedValue({
      success: true,
      data: {
        user: { id: 'user-123', email: 'test@example.com' },
        session: { token: 'session-token' },
      },
    });
    
    mockUseActor.mockReturnValue({
      state: {},
      status: 'ready',
      connected: true,
      sendMessage,
      updateState: vi.fn(),
    });
    
    render(
      <BiometricPrompt 
        visible={true}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        userId="user-123"
      />
    );
    
    const authenticateButton = screen.getByText('Authenticate with Biometrics');
    fireEvent.press(authenticateButton);
    
    await waitFor(() => {
      expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith({
        promptMessage: 'Authenticate to sign in',
        fallbackLabel: 'Use passcode',
        cancelLabel: 'Cancel',
      });
    });
    
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'CREATE_SESSION',
        payload: {
          userId: 'user-123',
          device: {
            biometricAuth: true,
            platform: 'mobile',
          },
        },
      });
    });
    
    expect(mockOnSuccess).toHaveBeenCalledWith('session-token');
  });
  
  it('should handle failed authentication', async () => {
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
      success: false,
      error: 'user_cancel',
    });
    
    mockUseActor.mockReturnValue({
      state: {},
      status: 'ready',
      connected: true,
      sendMessage: vi.fn(),
      updateState: vi.fn(),
    });
    
    render(
      <BiometricPrompt 
        visible={true}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    );
    
    const authenticateButton = screen.getByText('Authenticate with Biometrics');
    fireEvent.press(authenticateButton);
    
    await waitFor(() => {
      expect(screen.getByText('Authentication failed')).toBeTruthy();
      expect(screen.getByText('Please try again')).toBeTruthy();
    });
  });
  
  it('should handle cancel button', () => {
    mockUseActor.mockReturnValue({
      state: {},
      status: 'ready',
      connected: true,
      sendMessage: vi.fn(),
      updateState: vi.fn(),
    });
    
    render(
      <BiometricPrompt 
        visible={true}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    );
    
    const cancelButton = screen.getByText('Cancel');
    fireEvent.press(cancelButton);
    
    expect(mockOnCancel).toHaveBeenCalled();
  });
  
  it('should show loading state during authentication', async () => {
    (LocalAuthentication.authenticateAsync as jest.Mock).mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
    );
    
    mockUseActor.mockReturnValue({
      state: {},
      status: 'ready',
      connected: true,
      sendMessage: vi.fn().mockResolvedValue({ success: true }),
      updateState: vi.fn(),
    });
    
    render(
      <BiometricPrompt 
        visible={true}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    );
    
    const authenticateButton = screen.getByText('Authenticate with Biometrics');
    fireEvent.press(authenticateButton);
    
    expect(screen.getByTestId('loading-indicator')).toBeTruthy();
    expect(authenticateButton).toBeDisabled();
    
    await waitFor(() => {
      expect(screen.queryByTestId('loading-indicator')).toBeNull();
    });
  });
  
  it('should handle multiple authentication types', async () => {
    mockUseActor.mockReturnValue({
      state: {},
      status: 'ready',
      connected: true,
      sendMessage: vi.fn(),
      updateState: vi.fn(),
    });
    
    render(
      <BiometricPrompt 
        visible={true}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    );
    
    // Should show both Face ID and Touch ID options based on device
    await waitFor(() => {
      const text = screen.getByText(/Face ID|Touch ID|Biometrics/);
      expect(text).toBeTruthy();
    });
  });
  
  it('should disable authentication when disconnected', () => {
    mockUseActor.mockReturnValue({
      state: {},
      status: 'error',
      connected: false,
      sendMessage: vi.fn(),
      updateState: vi.fn(),
    });
    
    render(
      <BiometricPrompt 
        visible={true}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    );
    
    const authenticateButton = screen.getByText('Authenticate with Biometrics');
    expect(authenticateButton).toBeDisabled();
    expect(screen.getByText('Connection lost')).toBeTruthy();
  });
});