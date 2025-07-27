import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PaymentSheet } from './PaymentSheet';

interface BillingScreenProps {
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

export const BillingScreen: React.FC<BillingScreenProps> = ({ customerId }) => {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);

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
      Alert.alert('Error', 'Failed to load billing information');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCancelSubscription = (subscriptionId: string) => {
    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel this subscription?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
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
              Alert.alert('Error', 'Failed to cancel subscription');
            }
          }
        }
      ]
    );
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount / 100);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return '#10B981';
      case 'trialing': return '#3B82F6';
      case 'past_due': return '#F59E0B';
      case 'canceled': return '#6B7280';
      default: return '#6B7280';
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={48} color="#9CA3AF" />
        <Text style={styles.emptyText}>Unable to load billing data</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          fetchBillingData();
        }} />
      }
    >
      {/* Overview Cards */}
      <View style={styles.cardsContainer}>
        <View style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.cardLabel}>Active Subscriptions</Text>
            <Text style={styles.cardValue}>{customer.metrics.activeSubscriptions}</Text>
          </View>
          <Ionicons name="calendar-outline" size={24} color="#9CA3AF" />
        </View>

        <View style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.cardLabel}>Total Spent</Text>
            <Text style={styles.cardValue}>${customer.metrics.totalRevenue.toFixed(2)}</Text>
          </View>
          <Ionicons name="receipt-outline" size={24} color="#9CA3AF" />
        </View>
      </View>

      {/* Payment Method */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <TouchableOpacity onPress={() => setShowPaymentSheet(true)}>
            <Text style={styles.linkText}>
              {customer.defaultPaymentMethod ? 'Update' : 'Add'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.paymentMethod}>
          <Ionicons name="card-outline" size={24} color="#6B7280" />
          <View style={styles.paymentMethodInfo}>
            {customer.defaultPaymentMethod ? (
              <>
                <Text style={styles.paymentMethodNumber}>•••• •••• •••• 4242</Text>
                <Text style={styles.paymentMethodExpiry}>Expires 12/24</Text>
              </>
            ) : (
              <Text style={styles.noPaymentMethod}>No payment method on file</Text>
            )}
          </View>
        </View>
      </View>

      {/* Subscriptions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subscriptions</Text>
        {customer.subscriptions.length === 0 ? (
          <Text style={styles.emptyText}>No active subscriptions</Text>
        ) : (
          customer.subscriptions.map((subscription) => (
            <View key={subscription.id} style={styles.subscriptionItem}>
              <View style={styles.subscriptionInfo}>
                <View style={styles.subscriptionHeader}>
                  <Text style={styles.subscriptionPlan}>
                    {subscription.planId.replace('_', ' ').toUpperCase()} Plan
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(subscription.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(subscription.status) }]}>
                      {subscription.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.subscriptionDate}>
                  {subscription.cancelAtPeriodEnd
                    ? `Cancels on ${formatDate(subscription.currentPeriodEnd)}`
                    : `Renews on ${formatDate(subscription.currentPeriodEnd)}`}
                </Text>
              </View>
              {subscription.status === 'active' && !subscription.cancelAtPeriodEnd && (
                <TouchableOpacity onPress={() => handleCancelSubscription(subscription.id)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </View>

      {/* Recent Invoices */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Invoices</Text>
        {invoices.length === 0 ? (
          <Text style={styles.emptyText}>No invoices yet</Text>
        ) : (
          invoices.map((invoice) => (
            <View key={invoice.id} style={styles.invoiceItem}>
              <View style={styles.invoiceInfo}>
                <Text style={styles.invoiceDate}>{formatDate(invoice.dueDate)}</Text>
                <Text style={styles.invoiceAmount}>
                  {formatCurrency(invoice.amount, invoice.currency)}
                </Text>
              </View>
              <View style={[styles.statusBadge, { 
                backgroundColor: invoice.status === 'paid' ? '#10B98120' : '#EF444420' 
              }]}>
                <Text style={[styles.statusText, { 
                  color: invoice.status === 'paid' ? '#10B981' : '#EF4444' 
                }]}>
                  {invoice.status}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Payment Sheet */}
      {showPaymentSheet && (
        <PaymentSheet
          amount={0} // Amount would be set based on context
          onComplete={(result) => {
            setShowPaymentSheet(false);
            if (result.success) {
              fetchBillingData();
            }
          }}
        />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  cardsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  linkText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
  },
  paymentMethod: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  paymentMethodInfo: {
    marginLeft: 12,
  },
  paymentMethodNumber: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  paymentMethodExpiry: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  noPaymentMethod: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  subscriptionItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  subscriptionInfo: {
    flex: 1,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  subscriptionPlan: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginRight: 8,
  },
  subscriptionDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cancelText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '500',
  },
  invoiceItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  invoiceInfo: {
    flex: 1,
  },
  invoiceDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  invoiceAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
  },
});