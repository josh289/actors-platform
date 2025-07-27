-- Initial Event Catalog Data for E-commerce System

-- User Domain Events
INSERT INTO event_definitions (event_name, description, producer_actor) VALUES
('USER_REGISTERED', 'New user successfully registered', 'user'),
('USER_LOGGED_IN', 'User authentication successful', 'user'),
('USER_LOGGED_OUT', 'User logged out', 'user'),
('USER_UPDATED', 'User profile updated', 'user'),
('SEND_MAGIC_LINK', 'Magic link authentication initiated', 'user'),
('VERIFY_TOKEN', 'Magic link token verification', 'user');

-- Cart Domain Events
INSERT INTO event_definitions (event_name, description, producer_actor) VALUES
('ITEM_ADDED_TO_CART', 'Product added to shopping cart', 'cart'),
('ITEM_REMOVED_FROM_CART', 'Product removed from cart', 'cart'),
('CART_UPDATED', 'Cart quantity or items updated', 'cart'),
('CART_CHECKED_OUT', 'User initiated checkout process', 'cart'),
('CART_CLEARED', 'Cart emptied after order', 'cart');

-- Inventory Domain Events
INSERT INTO event_definitions (event_name, description, producer_actor) VALUES
('STOCK_RESERVED', 'Inventory reserved for order', 'inventory'),
('STOCK_RELEASED', 'Reserved inventory released', 'inventory'),
('STOCK_INSUFFICIENT', 'Not enough inventory available', 'inventory'),
('STOCK_UPDATED', 'Inventory levels adjusted', 'inventory'),
('LOW_STOCK_ALERT', 'Product below threshold', 'inventory');

-- Payment Domain Events
INSERT INTO event_definitions (event_name, description, producer_actor) VALUES
('PAYMENT_INITIATED', 'Payment process started', 'payment'),
('PAYMENT_PROCESSED', 'Payment successfully charged', 'payment'),
('PAYMENT_FAILED', 'Payment processing failed', 'payment'),
('PAYMENT_REFUNDED', 'Payment refunded to customer', 'payment'),
('PAYMENT_METHOD_ADDED', 'New payment method saved', 'payment');

-- Order Domain Events
INSERT INTO event_definitions (event_name, description, producer_actor) VALUES
('ORDER_CREATED', 'Order successfully created', 'order'),
('ORDER_CONFIRMED', 'Order payment confirmed', 'order'),
('ORDER_CANCELLED', 'Order cancelled', 'order'),
('ORDER_UPDATED', 'Order details modified', 'order'),
('ORDER_COMPLETED', 'Order fulfilled and delivered', 'order');

-- Shipping Domain Events
INSERT INTO event_definitions (event_name, description, producer_actor) VALUES
('SHIPMENT_CREATED', 'Shipping label generated', 'shipping'),
('ORDER_SHIPPED', 'Order dispatched to customer', 'shipping'),
('TRACKING_UPDATED', 'Shipment tracking info updated', 'shipping'),
('DELIVERY_CONFIRMED', 'Package delivered', 'shipping'),
('SHIPMENT_DELAYED', 'Delivery delayed notification', 'shipping');

-- Billing Domain Events
INSERT INTO event_definitions (event_name, description, producer_actor) VALUES
('CUSTOMER_CREATED', 'Billing customer profile created', 'billing'),
('SUBSCRIPTION_CREATED', 'New subscription started', 'billing'),
('SUBSCRIPTION_CANCELLED', 'Subscription cancelled', 'billing'),
('INVOICE_GENERATED', 'Invoice created', 'billing'),
('PAYMENT_REMINDER_SENT', 'Payment reminder notification', 'billing');

-- Notification Domain Events
INSERT INTO event_definitions (event_name, description, producer_actor) VALUES
('EMAIL_SENT', 'Email notification delivered', 'notification'),
('SMS_SENT', 'SMS message delivered', 'notification'),
('PUSH_SENT', 'Push notification sent', 'notification'),
('EMAIL_BOUNCED', 'Email delivery failed', 'notification'),
('NOTIFICATION_PREFERENCES_UPDATED', 'User preferences changed', 'notification');

-- Analytics Domain Events
INSERT INTO event_definitions (event_name, description, producer_actor) VALUES
('EVENT_TRACKED', 'Analytics event recorded', 'analytics'),
('METRIC_CALCULATED', 'Business metric computed', 'analytics'),
('ANOMALY_DETECTED', 'Unusual pattern detected', 'analytics'),
('REPORT_GENERATED', 'Analytics report created', 'analytics');

-- Now add event consumers (who listens to what)
WITH event_mappings AS (
    SELECT event_name, consumer_actor, pattern, timeout_ms
    FROM (VALUES
        -- User events consumers
        ('USER_REGISTERED', 'billing', 'publish', NULL),
        ('USER_REGISTERED', 'notification', 'publish', NULL),
        ('USER_REGISTERED', 'analytics', 'publish', NULL),
        ('USER_LOGGED_IN', 'analytics', 'publish', NULL),
        
        -- Cart events consumers
        ('CART_CHECKED_OUT', 'order', 'ask', 5000),
        ('CART_CHECKED_OUT', 'inventory', 'ask', 5000),
        ('ITEM_ADDED_TO_CART', 'analytics', 'publish', NULL),
        ('ITEM_ADDED_TO_CART', 'inventory', 'tell', NULL),
        
        -- Inventory events consumers
        ('STOCK_RESERVED', 'order', 'publish', NULL),
        ('STOCK_INSUFFICIENT', 'order', 'publish', NULL),
        ('STOCK_INSUFFICIENT', 'cart', 'publish', NULL),
        ('LOW_STOCK_ALERT', 'notification', 'publish', NULL),
        
        -- Payment events consumers
        ('PAYMENT_PROCESSED', 'order', 'publish', NULL),
        ('PAYMENT_PROCESSED', 'notification', 'publish', NULL),
        ('PAYMENT_PROCESSED', 'analytics', 'publish', NULL),
        ('PAYMENT_FAILED', 'order', 'publish', NULL),
        ('PAYMENT_FAILED', 'notification', 'publish', NULL),
        
        -- Order events consumers
        ('ORDER_CREATED', 'notification', 'publish', NULL),
        ('ORDER_CREATED', 'shipping', 'tell', NULL),
        ('ORDER_CREATED', 'analytics', 'publish', NULL),
        ('ORDER_CONFIRMED', 'inventory', 'tell', NULL),
        ('ORDER_SHIPPED', 'notification', 'publish', NULL),
        ('ORDER_SHIPPED', 'analytics', 'publish', NULL),
        
        -- Shipping events consumers
        ('ORDER_SHIPPED', 'notification', 'publish', NULL),
        ('DELIVERY_CONFIRMED', 'order', 'publish', NULL),
        ('DELIVERY_CONFIRMED', 'analytics', 'publish', NULL),
        ('SHIPMENT_DELAYED', 'notification', 'publish', NULL),
        
        -- Billing events consumers
        ('SUBSCRIPTION_CREATED', 'analytics', 'publish', NULL),
        ('SUBSCRIPTION_CREATED', 'notification', 'publish', NULL),
        ('SUBSCRIPTION_CANCELLED', 'analytics', 'publish', NULL),
        
        -- Notification events consumers
        ('EMAIL_SENT', 'analytics', 'publish', NULL),
        ('EMAIL_BOUNCED', 'analytics', 'publish', NULL),
        ('EMAIL_BOUNCED', 'user', 'tell', NULL)
    ) AS mappings(event_name, consumer_actor, pattern, timeout_ms)
)
INSERT INTO event_consumers (event_id, consumer_actor, pattern, timeout_ms)
SELECT ed.id, em.consumer_actor, em.pattern, COALESCE(em.timeout_ms, 5000)
FROM event_mappings em
JOIN event_definitions ed ON ed.event_name = em.event_name;

-- Add payload schemas for key events
DO $$
DECLARE
    event_id UUID;
BEGIN
    -- USER_REGISTERED payload
    SELECT id INTO event_id FROM event_definitions WHERE event_name = 'USER_REGISTERED';
    INSERT INTO event_payload_schema (event_id, field_name, field_type, required, description, field_order) VALUES
    (event_id, 'userId', 'string', true, 'Unique user identifier', 1),
    (event_id, 'email', 'string', true, 'User email address', 2),
    (event_id, 'timestamp', 'number', true, 'Registration timestamp', 3);
    
    -- CART_CHECKED_OUT payload
    SELECT id INTO event_id FROM event_definitions WHERE event_name = 'CART_CHECKED_OUT';
    INSERT INTO event_payload_schema (event_id, field_name, field_type, required, description, field_order) VALUES
    (event_id, 'cartId', 'string', true, 'Cart identifier', 1),
    (event_id, 'userId', 'string', true, 'User identifier', 2),
    (event_id, 'items', 'array', true, 'Cart items array', 3),
    (event_id, 'total', 'number', true, 'Total cart value', 4);
    
    -- PAYMENT_PROCESSED payload
    SELECT id INTO event_id FROM event_definitions WHERE event_name = 'PAYMENT_PROCESSED';
    INSERT INTO event_payload_schema (event_id, field_name, field_type, required, description, field_order) VALUES
    (event_id, 'orderId', 'string', true, 'Order identifier', 1),
    (event_id, 'paymentId', 'string', true, 'Payment transaction ID', 2),
    (event_id, 'amount', 'number', true, 'Payment amount', 3),
    (event_id, 'method', 'string', true, 'Payment method used', 4),
    (event_id, 'timestamp', 'number', true, 'Payment timestamp', 5);
    
    -- ORDER_CREATED payload
    SELECT id INTO event_id FROM event_definitions WHERE event_name = 'ORDER_CREATED';
    INSERT INTO event_payload_schema (event_id, field_name, field_type, required, description, field_order) VALUES
    (event_id, 'orderId', 'string', true, 'Order identifier', 1),
    (event_id, 'userId', 'string', true, 'Customer identifier', 2),
    (event_id, 'items', 'array', true, 'Order items', 3),
    (event_id, 'total', 'number', true, 'Order total', 4),
    (event_id, 'status', 'string', true, 'Order status', 5),
    (event_id, 'timestamp', 'number', true, 'Creation timestamp', 6);
END $$;

-- Create system flows
INSERT INTO system_flows (flow_name, description) VALUES
('user_registration', 'New user signup and onboarding flow'),
('checkout', 'Complete checkout and order creation process'),
('order_fulfillment', 'Order processing and shipping flow');

-- Add flow steps
DO $$
DECLARE
    flow_id UUID;
    event_id UUID;
BEGIN
    -- User registration flow
    SELECT id INTO flow_id FROM system_flows WHERE flow_name = 'user_registration';
    
    SELECT ed.id INTO event_id FROM event_definitions ed WHERE event_name = 'SEND_MAGIC_LINK';
    INSERT INTO flow_steps (flow_id, step_number, event_id, description) VALUES
    (flow_id, 1, event_id, 'Send magic link email');
    
    SELECT ed.id INTO event_id FROM event_definitions ed WHERE event_name = 'EMAIL_SENT';
    INSERT INTO flow_steps (flow_id, step_number, event_id, description) VALUES
    (flow_id, 2, event_id, 'Email delivered to user');
    
    SELECT ed.id INTO event_id FROM event_definitions ed WHERE event_name = 'VERIFY_TOKEN';
    INSERT INTO flow_steps (flow_id, step_number, event_id, description) VALUES
    (flow_id, 3, event_id, 'User clicks link and verifies');
    
    SELECT ed.id INTO event_id FROM event_definitions ed WHERE event_name = 'USER_REGISTERED';
    INSERT INTO flow_steps (flow_id, step_number, event_id, description) VALUES
    (flow_id, 4, event_id, 'User registration completed');
    
    SELECT ed.id INTO event_id FROM event_definitions ed WHERE event_name = 'CUSTOMER_CREATED';
    INSERT INTO flow_steps (flow_id, step_number, event_id, description) VALUES
    (flow_id, 5, event_id, 'Billing customer created');
    
    -- Checkout flow
    SELECT id INTO flow_id FROM system_flows WHERE flow_name = 'checkout';
    
    SELECT ed.id INTO event_id FROM event_definitions ed WHERE event_name = 'CART_CHECKED_OUT';
    INSERT INTO flow_steps (flow_id, step_number, event_id, description) VALUES
    (flow_id, 1, event_id, 'User initiates checkout');
    
    SELECT ed.id INTO event_id FROM event_definitions ed WHERE event_name = 'STOCK_RESERVED';
    INSERT INTO flow_steps (flow_id, step_number, event_id, description) VALUES
    (flow_id, 2, event_id, 'Inventory reserved');
    
    SELECT ed.id INTO event_id FROM event_definitions ed WHERE event_name = 'ORDER_CREATED';
    INSERT INTO flow_steps (flow_id, step_number, event_id, description) VALUES
    (flow_id, 3, event_id, 'Order record created');
    
    SELECT ed.id INTO event_id FROM event_definitions ed WHERE event_name = 'PAYMENT_PROCESSED';
    INSERT INTO flow_steps (flow_id, step_number, event_id, description) VALUES
    (flow_id, 4, event_id, 'Payment charged');
    
    SELECT ed.id INTO event_id FROM event_definitions ed WHERE event_name = 'EMAIL_SENT';
    INSERT INTO flow_steps (flow_id, step_number, event_id, description) VALUES
    (flow_id, 5, event_id, 'Confirmation email sent');
END $$;