import { gql } from 'graphql-tag';

export const billingTypeDefs = gql`
  # Billing Types
  type Customer {
    id: ID!
    email: String!
    stripeCustomerId: String!
    defaultPaymentMethod: String
    subscriptions: [Subscription!]!
    totalRevenue: Float!
    createdAt: String!
    updatedAt: String!
    metrics: CustomerMetrics!
  }

  type CustomerMetrics {
    activeSubscriptions: Int!
    totalRevenue: Float!
  }

  type Subscription {
    id: ID!
    customerId: String!
    stripeSubscriptionId: String!
    status: SubscriptionStatus!
    planId: String!
    currentPeriodStart: String!
    currentPeriodEnd: String!
    cancelAtPeriodEnd: Boolean!
  }

  enum SubscriptionStatus {
    active
    canceled
    incomplete
    incomplete_expired
    past_due
    trialing
    unpaid
  }

  type Invoice {
    id: ID!
    customerId: String!
    subscriptionId: String!
    amount: Int!
    currency: String!
    status: InvoiceStatus!
    dueDate: String!
    paidAt: String
  }

  enum InvoiceStatus {
    draft
    open
    paid
    uncollectible
    void
  }

  type Plan {
    id: ID!
    name: String!
    price: Float!
    currency: String!
    interval: PlanInterval!
    features: [String!]!
    popular: Boolean
  }

  enum PlanInterval {
    month
    year
  }

  # Result Types
  type CreateCustomerResult {
    success: Boolean!
    customerId: String
    error: String
  }

  type CreateSubscriptionResult {
    success: Boolean!
    subscriptionId: String
    checkoutUrl: String
    clientSecret: String
    error: String
  }

  type UpdatePaymentMethodResult {
    success: Boolean!
    error: String
  }

  type CancelSubscriptionResult {
    success: Boolean!
    effectiveDate: String
    error: String
  }

  # Queries
  extend type Query {
    # Get customer with all details
    customer(id: ID!): Customer
    
    # Get specific subscription
    subscription(id: ID!): Subscription
    
    # List customer's subscriptions
    customerSubscriptions(customerId: ID!): [Subscription!]!
    
    # List customer's invoices
    customerInvoices(customerId: ID!, limit: Int = 10): [Invoice!]!
    
    # Get available plans
    availablePlans: [Plan!]!
  }

  # Mutations
  extend type Mutation {
    # Create billing customer for user
    createCustomer(
      userId: ID!
      email: String!
      metadata: JSON
    ): CreateCustomerResult!
    
    # Create new subscription
    createSubscription(
      customerId: ID!
      priceId: String!
      trialDays: Int
    ): CreateSubscriptionResult!
    
    # Update payment method
    updatePaymentMethod(
      customerId: ID!
      paymentMethodId: String!
    ): UpdatePaymentMethodResult!
    
    # Cancel subscription
    cancelSubscription(
      id: ID!
      immediately: Boolean = false
    ): CancelSubscriptionResult!
    
    # Process webhook (internal use)
    processStripeWebhook(
      event: JSON!
      signature: String!
    ): Boolean!
  }

  # Subscriptions
  extend type Subscription {
    # Real-time subscription updates
    subscriptionUpdated(customerId: ID!): Subscription!
    
    # Payment status updates
    paymentStatusChanged(customerId: ID!): Invoice!
  }
`;