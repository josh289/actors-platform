import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PricingTable } from '../../components/web/PricingTable';

describe('PricingTable', () => {
  const mockPlans = [
    {
      id: 'basic_monthly',
      name: 'Basic',
      price: 9.99,
      currency: 'usd',
      interval: 'month' as const,
      features: ['10 projects', '2 team members', 'Basic support'],
      limitations: ['No API access', 'Limited storage'],
      popular: false
    },
    {
      id: 'pro_monthly',
      name: 'Pro',
      price: 29.99,
      currency: 'usd',
      interval: 'month' as const,
      features: ['Unlimited projects', '10 team members', 'Priority support', 'API access'],
      popular: true
    },
    {
      id: 'basic_yearly',
      name: 'Basic',
      price: 95.99,
      currency: 'usd',
      interval: 'year' as const,
      features: ['10 projects', '2 team members', 'Basic support'],
      popular: false
    }
  ];

  const mockOnSelectPlan = vi.fn();

  beforeEach(() => {
    mockOnSelectPlan.mockClear();
  });

  it('renders pricing plans correctly', () => {
    render(
      <PricingTable
        plans={mockPlans}
        onSelectPlan={mockOnSelectPlan}
      />
    );

    // Check that monthly plans are shown by default
    expect(screen.getByText('Basic')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('$9.99')).toBeInTheDocument();
    expect(screen.getByText('$29.99')).toBeInTheDocument();
  });

  it('shows popular badge on popular plans', () => {
    render(
      <PricingTable
        plans={mockPlans}
        onSelectPlan={mockOnSelectPlan}
      />
    );

    expect(screen.getByText('Most Popular')).toBeInTheDocument();
  });

  it('switches between monthly and yearly billing', () => {
    render(
      <PricingTable
        plans={mockPlans}
        onSelectPlan={mockOnSelectPlan}
      />
    );

    // Click yearly button
    fireEvent.click(screen.getByText('Yearly'));

    // Should show yearly plan
    expect(screen.getByText('$95.99')).toBeInTheDocument();
    expect(screen.queryByText('$9.99')).not.toBeInTheDocument();
  });

  it('calls onSelectPlan when Get Started is clicked', () => {
    render(
      <PricingTable
        plans={mockPlans}
        onSelectPlan={mockOnSelectPlan}
      />
    );

    const getStartedButtons = screen.getAllByText('Get Started');
    fireEvent.click(getStartedButtons[0]);

    expect(mockOnSelectPlan).toHaveBeenCalledWith('basic_monthly');
  });

  it('disables button for current plan', () => {
    render(
      <PricingTable
        plans={mockPlans}
        currentPlan="basic_monthly"
        onSelectPlan={mockOnSelectPlan}
      />
    );

    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    const currentPlanButton = screen.getByText('Current Plan');
    expect(currentPlanButton.closest('button')).toBeDisabled();
  });

  it('displays plan features correctly', () => {
    render(
      <PricingTable
        plans={mockPlans}
        onSelectPlan={mockOnSelectPlan}
      />
    );

    expect(screen.getByText('10 projects')).toBeInTheDocument();
    expect(screen.getByText('API access')).toBeInTheDocument();
  });

  it('displays plan limitations with X icon', () => {
    render(
      <PricingTable
        plans={mockPlans}
        onSelectPlan={mockOnSelectPlan}
      />
    );

    expect(screen.getByText('No API access')).toBeInTheDocument();
    expect(screen.getByText('Limited storage')).toBeInTheDocument();
  });

  it('shows yearly savings message', () => {
    render(
      <PricingTable
        plans={mockPlans}
        onSelectPlan={mockOnSelectPlan}
      />
    );

    expect(screen.getByText('Save 20%')).toBeInTheDocument();
  });
});