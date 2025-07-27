import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubscriptionBadge } from '../../components/web/SubscriptionBadge';

describe('SubscriptionBadge', () => {
  it('renders active status correctly', () => {
    render(<SubscriptionBadge status="active" />);
    
    expect(screen.getByText('Active')).toBeInTheDocument();
    const badge = screen.getByText('Active').closest('span');
    expect(badge).toHaveClass('bg-green-100', 'text-green-800');
  });

  it('renders trialing status correctly', () => {
    render(<SubscriptionBadge status="trialing" />);
    
    expect(screen.getByText('Trial')).toBeInTheDocument();
    const badge = screen.getByText('Trial').closest('span');
    expect(badge).toHaveClass('bg-blue-100', 'text-blue-800');
  });

  it('renders past_due status correctly', () => {
    render(<SubscriptionBadge status="past_due" />);
    
    expect(screen.getByText('Past Due')).toBeInTheDocument();
    const badge = screen.getByText('Past Due').closest('span');
    expect(badge).toHaveClass('bg-yellow-100', 'text-yellow-800');
  });

  it('renders canceled status correctly', () => {
    render(<SubscriptionBadge status="canceled" />);
    
    expect(screen.getByText('Canceled')).toBeInTheDocument();
    const badge = screen.getByText('Canceled').closest('span');
    expect(badge).toHaveClass('bg-gray-100', 'text-gray-800');
  });

  it('renders cancelled status (alternative spelling)', () => {
    render(<SubscriptionBadge status="cancelled" />);
    
    expect(screen.getByText('Canceled')).toBeInTheDocument();
  });

  it('renders canceling status correctly', () => {
    render(<SubscriptionBadge status="canceling" />);
    
    expect(screen.getByText('Canceling')).toBeInTheDocument();
    const badge = screen.getByText('Canceling').closest('span');
    expect(badge).toHaveClass('bg-orange-100', 'text-orange-800');
  });

  it('renders incomplete status correctly', () => {
    render(<SubscriptionBadge status="incomplete" />);
    
    expect(screen.getByText('Incomplete')).toBeInTheDocument();
    const badge = screen.getByText('Incomplete').closest('span');
    expect(badge).toHaveClass('bg-red-100', 'text-red-800');
  });

  it('renders unknown status as-is', () => {
    render(<SubscriptionBadge status="custom_status" />);
    
    expect(screen.getByText('custom_status')).toBeInTheDocument();
    const badge = screen.getByText('custom_status').closest('span');
    expect(badge).toHaveClass('bg-gray-100', 'text-gray-800');
  });

  it('respects size prop - small', () => {
    render(<SubscriptionBadge status="active" size="sm" />);
    
    const badge = screen.getByText('Active').closest('span');
    expect(badge).toHaveClass('text-xs', 'px-2', 'py-0.5');
  });

  it('respects size prop - medium (default)', () => {
    render(<SubscriptionBadge status="active" size="md" />);
    
    const badge = screen.getByText('Active').closest('span');
    expect(badge).toHaveClass('text-sm', 'px-2.5', 'py-1');
  });

  it('respects size prop - large', () => {
    render(<SubscriptionBadge status="active" size="lg" />);
    
    const badge = screen.getByText('Active').closest('span');
    expect(badge).toHaveClass('text-base', 'px-3', 'py-1.5');
  });

  it('includes appropriate icon for each status', () => {
    const { rerender } = render(<SubscriptionBadge status="active" />);
    expect(screen.getByTestId('check-circle-icon', { exact: false })).toBeInTheDocument();

    rerender(<SubscriptionBadge status="past_due" />);
    expect(screen.getByTestId('alert-circle-icon', { exact: false })).toBeInTheDocument();

    rerender(<SubscriptionBadge status="canceled" />);
    expect(screen.getByTestId('x-circle-icon', { exact: false })).toBeInTheDocument();

    rerender(<SubscriptionBadge status="trialing" />);
    expect(screen.getByTestId('clock-icon', { exact: false })).toBeInTheDocument();
  });
});