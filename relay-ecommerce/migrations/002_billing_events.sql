-- Billing actor events
INSERT INTO event_definitions (event_name, description, producer_actor) VALUES
('CREATE_CUSTOMER', 'Create billing customer profile', 'billing'),
('CREATE_SUBSCRIPTION', 'Create new subscription', 'billing'),
('UPDATE_PAYMENT_METHOD', 'Update default payment method', 'billing'),
('CANCEL_SUBSCRIPTION', 'Cancel subscription', 'billing'),
('PROCESS_STRIPE_WEBHOOK', 'Process Stripe webhook', 'billing'),
('CUSTOMER_CREATED', 'Billing customer created', 'billing'),
('SUBSCRIPTION_CREATED', 'Subscription created', 'billing'),
('SUBSCRIPTION_CANCELLED', 'Subscription cancelled', 'billing'),
('PAYMENT_METHOD_UPDATED', 'Payment method updated', 'billing'),
('WEBHOOK_PROCESSED', 'Stripe webhook processed', 'billing');

-- Event consumers
INSERT INTO event_consumers (event_id, consumer_actor, pattern)
SELECT ed.id, consumer, pattern
FROM event_definitions ed
CROSS JOIN (VALUES
  ('CUSTOMER_CREATED', 'notification', 'publish'),
  ('CUSTOMER_CREATED', 'analytics', 'publish'),
  ('SUBSCRIPTION_CREATED', 'notification', 'publish'),
  ('SUBSCRIPTION_CREATED', 'analytics', 'publish'),
  ('SUBSCRIPTION_CANCELLED', 'notification', 'publish'),
  ('SUBSCRIPTION_CANCELLED', 'analytics', 'publish'),
  ('PAYMENT_METHOD_UPDATED', 'analytics', 'publish')
) AS mappings(event_name, consumer, pattern)
WHERE ed.event_name = mappings.event_name;

-- Event payload schemas
INSERT INTO event_payload_schema (event_id, field_name, field_type, required, description)
SELECT ed.id, field_name, field_type, required, description
FROM event_definitions ed
CROSS JOIN (VALUES
  -- CREATE_CUSTOMER
  ('CREATE_CUSTOMER', 'userId', 'string', true, 'User ID to create customer for'),
  ('CREATE_CUSTOMER', 'email', 'string', true, 'Customer email address'),
  ('CREATE_CUSTOMER', 'metadata', 'object', false, 'Additional metadata'),
  
  -- CREATE_SUBSCRIPTION
  ('CREATE_SUBSCRIPTION', 'customerId', 'string', true, 'Customer ID'),
  ('CREATE_SUBSCRIPTION', 'priceId', 'string', true, 'Stripe price ID'),
  ('CREATE_SUBSCRIPTION', 'trialDays', 'number', false, 'Number of trial days'),
  
  -- UPDATE_PAYMENT_METHOD
  ('UPDATE_PAYMENT_METHOD', 'customerId', 'string', true, 'Customer ID'),
  ('UPDATE_PAYMENT_METHOD', 'paymentMethodId', 'string', true, 'Stripe payment method ID'),
  
  -- CANCEL_SUBSCRIPTION
  ('CANCEL_SUBSCRIPTION', 'subscriptionId', 'string', true, 'Subscription ID to cancel'),
  ('CANCEL_SUBSCRIPTION', 'immediately', 'boolean', false, 'Cancel immediately vs end of period'),
  
  -- PROCESS_STRIPE_WEBHOOK
  ('PROCESS_STRIPE_WEBHOOK', 'event', 'object', true, 'Stripe webhook event object'),
  ('PROCESS_STRIPE_WEBHOOK', 'signature', 'string', true, 'Webhook signature for verification'),
  
  -- Query payloads
  ('GET_CUSTOMER', 'customerId', 'string', true, 'Customer ID to retrieve'),
  ('GET_SUBSCRIPTION', 'subscriptionId', 'string', true, 'Subscription ID to retrieve'),
  ('LIST_INVOICES', 'customerId', 'string', true, 'Customer ID'),
  ('LIST_INVOICES', 'limit', 'number', false, 'Max number of invoices to return')
) AS fields(event_name, field_name, field_type, required, description)
WHERE ed.event_name = fields.event_name;

-- Event validation rules
INSERT INTO event_validation_rules (event_id, rule, error_message)
SELECT ed.id, rule, error_message
FROM event_definitions ed
CROSS JOIN (VALUES
  ('CREATE_SUBSCRIPTION', 'payload.trialDays >= 0', 'Trial days must be non-negative'),
  ('CREATE_SUBSCRIPTION', 'payload.trialDays <= 30', 'Trial days cannot exceed 30'),
  ('CREATE_CUSTOMER', 'payload.email.includes("@")', 'Invalid email address'),
  ('UPDATE_PAYMENT_METHOD', 'payload.paymentMethodId.startsWith("pm_")', 'Invalid payment method ID format')
) AS rules(event_name, rule, error_message)
WHERE ed.event_name = rules.event_name;