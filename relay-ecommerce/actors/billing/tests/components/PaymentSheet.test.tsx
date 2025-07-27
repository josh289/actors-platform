import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert, Animated } from 'react-native';
import { PaymentSheet } from '../../components/mobile/PaymentSheet';

// Mock Animated
vi.mock('react-native', async () => {
  const actual = await vi.importActual('react-native');
  return {
    ...actual,
    Animated: {
      ...actual.Animated,
      Value: vi.fn(() => ({
        _value: 300,
        setValue: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        removeAllListeners: vi.fn(),
        stopAnimation: vi.fn(),
        resetAnimation: vi.fn(),
        interpolate: vi.fn(),
        animate: vi.fn(),
      })),
      timing: vi.fn(() => ({
        start: vi.fn((callback) => callback && callback({ finished: true })),
      })),
      spring: vi.fn(() => ({
        start: vi.fn((callback) => callback && callback({ finished: true })),
      })),
      View: actual.View,
    },
  };
});

// Mock Alert
vi.spyOn(Alert, 'alert');

describe('PaymentSheet', () => {
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders payment sheet with form fields', () => {
    const { getByText, getByLabelText } = render(
      <PaymentSheet amount={2999} onComplete={mockOnComplete} />
    );

    expect(getByText('Payment Details')).toBeTruthy();
    expect(getByText('Amount to pay')).toBeTruthy();
    expect(getByText('$29.99')).toBeTruthy();
    expect(getByLabelText('Card Number')).toBeTruthy();
    expect(getByLabelText('Expiry')).toBeTruthy();
    expect(getByLabelText('CVC')).toBeTruthy();
    expect(getByLabelText('ZIP Code')).toBeTruthy();
  });

  it('renders without amount section when amount is 0', () => {
    const { queryByText } = render(
      <PaymentSheet amount={0} onComplete={mockOnComplete} />
    );

    expect(queryByText('Amount to pay')).not.toBeTruthy();
    expect(queryByText('Add Card')).toBeTruthy();
  });

  it('validates empty form submission', async () => {
    const { getByText } = render(
      <PaymentSheet amount={2999} onComplete={mockOnComplete} />
    );

    fireEvent.press(getByText('Pay $29.99'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Please fill in all fields');
    });

    expect(mockOnComplete).not.toHaveBeenCalled();
  });

  it('formats card number input correctly', () => {
    const { getByLabelText } = render(
      <PaymentSheet amount={2999} onComplete={mockOnComplete} />
    );

    const cardInput = getByLabelText('Card Number');
    fireEvent.changeText(cardInput, '4242424242424242');

    expect(cardInput.props.value).toBe('4242 4242 4242 4242');
  });

  it('submits form with valid data', async () => {
    const { getByText, getByLabelText } = render(
      <PaymentSheet amount={2999} onComplete={mockOnComplete} />
    );

    // Fill in form
    fireEvent.changeText(getByLabelText('Card Number'), '4242424242424242');
    fireEvent.changeText(getByLabelText('Expiry').parentElement.children[0], '12');
    fireEvent.changeText(getByLabelText('Expiry').parentElement.children[2], '25');
    fireEvent.changeText(getByLabelText('CVC'), '123');
    fireEvent.changeText(getByLabelText('ZIP Code'), '12345');

    // Submit
    await act(async () => {
      fireEvent.press(getByText('Pay $29.99'));
    });

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledWith({
        success: true,
        paymentIntentId: expect.stringContaining('pi_')
      });
    }, { timeout: 3000 });
  });

  it('closes sheet when close button is pressed', async () => {
    const { getByTestId } = render(
      <PaymentSheet amount={2999} onComplete={mockOnComplete} />
    );

    const closeButton = getByTestId('close-button');
    fireEvent.press(closeButton);

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledWith({ success: false });
    });
  });

  it('shows loading state during submission', async () => {
    const { getByText, getByLabelText } = render(
      <PaymentSheet amount={2999} onComplete={mockOnComplete} />
    );

    // Fill in form
    fireEvent.changeText(getByLabelText('Card Number'), '4242424242424242');
    fireEvent.changeText(getByLabelText('Expiry').parentElement.children[0], '12');
    fireEvent.changeText(getByLabelText('Expiry').parentElement.children[2], '25');
    fireEvent.changeText(getByLabelText('CVC'), '123');
    fireEvent.changeText(getByLabelText('ZIP Code'), '12345');

    // Submit
    fireEvent.press(getByText('Pay $29.99'));

    // Should show loading indicator
    expect(getByTestId('activity-indicator')).toBeTruthy();
  });

  it('shows security message', () => {
    const { getByText } = render(
      <PaymentSheet amount={2999} onComplete={mockOnComplete} />
    );

    expect(getByText('Your payment information is encrypted and secure')).toBeTruthy();
  });

  it('limits input field lengths', () => {
    const { getByLabelText } = render(
      <PaymentSheet amount={2999} onComplete={mockOnComplete} />
    );

    const monthInput = getByLabelText('Expiry').parentElement.children[0];
    const yearInput = getByLabelText('Expiry').parentElement.children[2];
    const cvcInput = getByLabelText('CVC');
    const zipInput = getByLabelText('ZIP Code');

    expect(monthInput.props.maxLength).toBe(2);
    expect(yearInput.props.maxLength).toBe(2);
    expect(cvcInput.props.maxLength).toBe(4);
    expect(zipInput.props.maxLength).toBe(5);
  });

  it('sets CVC input as secure text entry', () => {
    const { getByLabelText } = render(
      <PaymentSheet amount={2999} onComplete={mockOnComplete} />
    );

    const cvcInput = getByLabelText('CVC');
    expect(cvcInput.props.secureTextEntry).toBe(true);
  });

  it('handles keyboard types correctly', () => {
    const { getByLabelText } = render(
      <PaymentSheet amount={2999} onComplete={mockOnComplete} />
    );

    const cardInput = getByLabelText('Card Number');
    const cvcInput = getByLabelText('CVC');
    const zipInput = getByLabelText('ZIP Code');

    expect(cardInput.props.keyboardType).toBe('numeric');
    expect(cvcInput.props.keyboardType).toBe('numeric');
    expect(zipInput.props.keyboardType).toBe('numeric');
  });

  it('animates sheet entrance on mount', () => {
    render(<PaymentSheet amount={2999} onComplete={mockOnComplete} />);

    expect(Animated.spring).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        toValue: 0,
        damping: 20,
        useNativeDriver: true
      })
    );
  });

  it('animates sheet exit on close', async () => {
    const { getByTestId } = render(
      <PaymentSheet amount={2999} onComplete={mockOnComplete} />
    );

    const closeButton = getByTestId('close-button');
    fireEvent.press(closeButton);

    expect(Animated.timing).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        toValue: 300,
        duration: 200,
        useNativeDriver: true
      })
    );
  });

  it('handles modal close request', () => {
    const { getByTestId } = render(
      <PaymentSheet amount={2999} onComplete={mockOnComplete} />
    );

    // Find the modal and trigger onRequestClose
    const modal = getByTestId('payment-sheet-modal');
    fireEvent(modal, 'requestClose');

    expect(mockOnComplete).toHaveBeenCalledWith({ success: false });
  });
});