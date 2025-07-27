import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  limitations?: string[];
  popular?: boolean;
}

interface PricingTableProps {
  plans: Plan[];
  currentPlan?: string;
  onSelectPlan: (planId: string) => void;
}

export const PricingTable: React.FC<PricingTableProps> = ({
  plans,
  currentPlan,
  onSelectPlan
}) => {
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');

  const filteredPlans = plans.filter(plan => plan.interval === billingInterval);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Billing Toggle */}
      <div className="flex justify-center mb-8">
        <div className="bg-gray-100 p-1 rounded-lg inline-flex">
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              billingInterval === 'month'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setBillingInterval('month')}
          >
            Monthly
          </button>
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              billingInterval === 'year'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setBillingInterval('year')}
          >
            Yearly
            <span className="ml-1 text-green-600 text-xs">Save 20%</span>
          </button>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {filteredPlans.map((plan) => (
          <div
            key={plan.id}
            className={`relative rounded-2xl bg-white shadow-lg ${
              plan.popular ? 'ring-2 ring-blue-600' : ''
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-0 right-0 mx-auto w-fit">
                <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </span>
              </div>
            )}

            <div className="p-8">
              <h3 className="text-2xl font-bold text-gray-900">{plan.name}</h3>
              
              <div className="mt-4 flex items-baseline">
                <span className="text-5xl font-bold tracking-tight text-gray-900">
                  ${plan.price}
                </span>
                <span className="ml-2 text-gray-500">/{plan.interval}</span>
              </div>

              <button
                onClick={() => onSelectPlan(plan.id)}
                disabled={currentPlan === plan.id}
                className={`mt-8 w-full py-3 px-6 rounded-lg font-medium transition-colors ${
                  currentPlan === plan.id
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : plan.popular
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                {currentPlan === plan.id ? 'Current Plan' : 'Get Started'}
              </button>

              <ul className="mt-8 space-y-4">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start">
                    <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="ml-3 text-gray-700">{feature}</span>
                  </li>
                ))}
                {plan.limitations?.map((limitation, idx) => (
                  <li key={`limit-${idx}`} className="flex items-start">
                    <X className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <span className="ml-3 text-gray-500">{limitation}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};