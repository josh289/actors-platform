import React, { useState, useEffect } from 'react';
import { CreditCard, Receipt, Calendar, AlertCircle, Download } from 'lucide-react';
import { PaymentMethodModal } from './PaymentMethodModal';
import { SubscriptionBadge } from './SubscriptionBadge';

interface BillingDashboardProps {
  customerId: string;
}

interface Customer {
  id: string;
  email: string;
  defaultPaymentMethod?: string;
  subscriptions: Subscription[];
  metrics: {
    activeSubscriptions: number;
    totalRevenue: number;
  };
}

interface Subscription {
  id: string;
  status: string;
  planId: string;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
}

interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  dueDate: number;
  paidAt?: number;
}

export const BillingDashboard: React.FC<BillingDashboardProps> = ({ customerId }) => {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    fetchBillingData();
  }, [customerId]);

  const fetchBillingData = async () => {
    try {
      // Fetch customer data
      const customerRes = await fetch('/api/actors/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'GET_CUSTOMER',
          payload: { customerId }
        })
      });
      const customerData = await customerRes.json();
      setCustomer(customerData.data);

      // Fetch invoices
      const invoicesRes = await fetch('/api/actors/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'LIST_INVOICES',
          payload: { customerId, limit: 10 }
        })
      });
      const invoicesData = await invoicesRes.json();
      setInvoices(invoicesData.data || []);
    } catch (error) {
      console.error('Failed to fetch billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async (subscriptionId: string) => {
    if (!confirm('Are you sure you want to cancel this subscription?')) return;

    try {
      await fetch('/api/actors/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'CANCEL_SUBSCRIPTION',
          payload: { subscriptionId, immediately: false }
        })
      });
      await fetchBillingData();
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount / 100);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No billing information</h3>
        <p className="mt-1 text-sm text-gray-500">Unable to load your billing data.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Billing & Subscriptions</h1>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Subscriptions</p>
              <p className="text-2xl font-bold text-gray-900">
                {customer.metrics.activeSubscriptions}
              </p>
            </div>
            <Calendar className="h-8 w-8 text-gray-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Spent</p>
              <p className="text-2xl font-bold text-gray-900">
                ${customer.metrics.totalRevenue.toFixed(2)}
              </p>
            </div>
            <Receipt className="h-8 w-8 text-gray-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Payment Method</p>
              <p className="text-lg font-medium text-gray-900">
                {customer.defaultPaymentMethod ? '•••• 4242' : 'Not set'}
              </p>
            </div>
            <CreditCard className="h-8 w-8 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Subscriptions */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Subscriptions</h2>
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {customer.subscriptions.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No active subscriptions
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {customer.subscriptions.map((subscription) => (
                <div key={subscription.id} className="p-6 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <SubscriptionBadge status={subscription.status} />
                    <div>
                      <p className="font-medium text-gray-900">
                        {subscription.planId.replace('_', ' ').toUpperCase()} Plan
                      </p>
                      <p className="text-sm text-gray-500">
                        {subscription.cancelAtPeriodEnd
                          ? `Cancels on ${formatDate(subscription.currentPeriodEnd)}`
                          : `Renews on ${formatDate(subscription.currentPeriodEnd)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {subscription.status === 'active' && !subscription.cancelAtPeriodEnd && (
                      <button
                        onClick={() => handleCancelSubscription(subscription.id)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Payment Method */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Payment Method</h2>
          <button
            onClick={() => setShowPaymentModal(true)}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            {customer.defaultPaymentMethod ? 'Update' : 'Add'} Payment Method
          </button>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          {customer.defaultPaymentMethod ? (
            <div className="flex items-center space-x-3">
              <CreditCard className="h-6 w-6 text-gray-400" />
              <div>
                <p className="font-medium text-gray-900">•••• •••• •••• 4242</p>
                <p className="text-sm text-gray-500">Expires 12/24</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">No payment method on file</p>
          )}
        </div>
      </div>

      {/* Invoices */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Invoices</h2>
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {invoices.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No invoices yet
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(invoice.dueDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(invoice.amount, invoice.currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        invoice.status === 'paid'
                          ? 'bg-green-100 text-green-800'
                          : invoice.status === 'open'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button className="text-blue-600 hover:text-blue-700">
                        <Download className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Payment Method Modal */}
      {showPaymentModal && (
        <PaymentMethodModal
          customerId={customerId}
          onSuccess={() => {
            setShowPaymentModal(false);
            fetchBillingData();
          }}
          onClose={() => setShowPaymentModal(false)}
        />
      )}
    </div>
  );
};