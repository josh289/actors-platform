# Core Actors: Properly Structured Following Actor Definition Guide

## Actor: user

### Overview
- **Purpose**: Manages user authentication, profiles, and authorization
- **Domain**: Identity and Access Management
- **Owner**: Platform Team

### State Management
```yaml
state:
  users:
    type: Record<string, User>
    description: User profiles and authentication data
    persistence: required
  sessions:
    type: Record<string, Session>
    description: Active user sessions
    persistence: required
  verificationTokens:
    type: Record<string, VerificationToken>
    description: Pending email/phone verifications
    persistence: required
  roles:
    type: Record<string, Role>
    description: Available roles and permissions
    persistence: required
```

### Events

#### Incoming Events (Commands/Queries)
```yaml
commands:
  - type: SEND_MAGIC_LINK
    payload:
      email: string
      redirectTo?: string
    response: { success: boolean; messageId?: string }
    description: Initiates magic link authentication flow
    
  - type: VERIFY_TOKEN
    payload:
      token: string
      email: string
    response: { success: boolean; sessionId?: string; user?: User }
    description: Verifies magic link token and creates session
    
  - type: UPDATE_PROFILE
    payload:
      userId: string
      data: Partial<UserProfile>
    response: { success: boolean; user?: User }
    description: Updates user profile information
    
  - type: ASSIGN_ROLE
    payload:
      userId: string
      role: string
    response: { success: boolean }
    description: Assigns role to user

queries:
  - type: GET_USER
    payload:
      userId: string
    response: { user?: User }
    description: Retrieves user by ID
    
  - type: GET_SESSION
    payload:
      sessionId: string
    response: { session?: Session; user?: User }
    description: Validates and retrieves session
```

#### Outgoing Events (To Other Actors)
```yaml
dependencies:
  notification:
    - event: SEND_EMAIL
      purpose: Send magic link emails
      pattern: tell
    - event: SEND_WELCOME_EMAIL
      purpose: Send welcome email to new users
      pattern: tell
      
  analytics:
    - event: TRACK_EVENT
      purpose: Track authentication events
      pattern: tell
```

#### Published Events (Notifications)
```yaml
notifications:
  - type: USER_REGISTERED
    payload:
      userId: string
      email: string
      timestamp: number
    subscribers: [analytics, notification, billing]
    purpose: Notify when new user registers
    
  - type: USER_LOGGED_IN
    payload:
      userId: string
      sessionId: string
      timestamp: number
    subscribers: [analytics]
    purpose: Track login events
    
  - type: PROFILE_UPDATED
    payload:
      userId: string
      changes: string[]
      timestamp: number
    subscribers: [analytics]
    purpose: Track profile changes
```

### Component Exports

#### Web Components
```yaml
web:
  - name: LoginForm
    type: widget
    props:
      redirectTo?: string
      onSuccess?: (user: User) => void
    description: Magic link login form
    
  - name: UserProfile
    type: page
    props:
      userId: string
    description: Full user profile management page
    
  - name: UserAvatar
    type: micro
    props:
      userId: string
      size: 'sm' | 'md' | 'lg'
    description: User avatar component
    
  - name: AuthGuard
    type: widget
    props:
      requiredRole?: string
      fallback?: ReactNode
    description: Authentication wrapper component
```

#### Mobile Components
```yaml
mobile:
  - name: LoginScreen
    type: screen
    props:
      navigation: NavigationProp
    description: Magic link login screen
    
  - name: ProfileScreen
    type: screen
    props:
      navigation: NavigationProp
      userId: string
    description: User profile management screen
    
  - name: UserCard
    type: widget
    props:
      userId: string
      showRole?: boolean
    description: User information card
```

#### API Schema
```yaml
graphql:
  types:
    - User
    - UserProfile
    - Session
    - Role
  queries:
    - user(id: ID!): User
    - currentUser: User
    - userSession: Session
  mutations:
    - sendMagicLink(email: String!, redirectTo: String): SendMagicLinkResult
    - verifyToken(token: String!, email: String!): AuthResult
    - updateProfile(data: UserProfileInput!): User
    - assignRole(userId: ID!, role: String!): User
  subscriptions:
    - userUpdated(userId: ID!): User
```

### Integration Points
- **Depends on**: notification, analytics
- **Depended by**: billing, order, analytics
- **External services**: None (can use Supabase/Auth0 as implementation detail)

---

## Actor: billing

### Overview
- **Purpose**: Manages customer billing, subscriptions, and payment processing
- **Domain**: Financial Operations
- **Owner**: Backend Team

### State Management
```yaml
state:
  customers:
    type: Record<string, Customer>
    description: Customer billing information
    persistence: required
  subscriptions:
    type: Record<string, Subscription>
    description: Active and past subscriptions
    persistence: required
  invoices:
    type: Record<string, Invoice>
    description: Generated invoices
    persistence: required
  payments:
    type: Record<string, Payment>
    description: Payment transactions
    persistence: required
```

### Events

#### Incoming Events (Commands/Queries)
```yaml
commands:
  - type: CREATE_CUSTOMER
    payload:
      userId: string
      email: string
      metadata?: Record<string, string>
    response: { success: boolean; customerId?: string }
    description: Creates billing customer
    
  - type: CREATE_SUBSCRIPTION
    payload:
      customerId: string
      planId: string
      trialDays?: number
    response: { success: boolean; subscriptionId?: string; checkoutUrl?: string }
    description: Creates new subscription
    
  - type: CANCEL_SUBSCRIPTION
    payload:
      subscriptionId: string
      immediately?: boolean
    response: { success: boolean }
    description: Cancels subscription
    
  - type: PROCESS_WEBHOOK
    payload:
      event: StripeWebhookEvent
    response: { success: boolean }
    description: Processes payment provider webhooks

queries:
  - type: GET_CUSTOMER
    payload:
      customerId: string
    response: { customer?: Customer }
    description: Retrieves customer billing info
    
  - type: GET_SUBSCRIPTION
    payload:
      subscriptionId: string
    response: { subscription?: Subscription }
    description: Retrieves subscription details
```

#### Outgoing Events (To Other Actors)
```yaml
dependencies:
  user:
    - event: GET_USER
      purpose: Validate user exists before creating customer
      pattern: ask
      
  notification:
    - event: SEND_EMAIL
      purpose: Send billing notifications
      pattern: tell
      
  analytics:
    - event: TRACK_EVENT
      purpose: Track billing events
      pattern: tell
```

#### Published Events (Notifications)
```yaml
notifications:
  - type: SUBSCRIPTION_CREATED
    payload:
      customerId: string
      subscriptionId: string
      planId: string
      amount: number
      timestamp: number
    subscribers: [analytics, notification, user]
    purpose: Notify when subscription created
    
  - type: PAYMENT_SUCCEEDED
    payload:
      customerId: string
      amount: number
      currency: string
      invoiceId: string
      timestamp: number
    subscribers: [analytics, notification]
    purpose: Notify successful payment
    
  - type: PAYMENT_FAILED
    payload:
      customerId: string
      amount: number
      reason: string
      timestamp: number
    subscribers: [analytics, notification]
    purpose: Notify failed payment
```

### Component Exports

#### Web Components
```yaml
web:
  - name: PricingTable
    type: widget
    props:
      plans: Plan[]
      currentPlan?: string
      onSelectPlan: (planId: string) => void
    description: Pricing plans display
    
  - name: BillingPage
    type: page
    props:
      customerId: string
    description: Complete billing management page
    
  - name: PaymentForm
    type: modal
    props:
      customerId: string
      amount: number
      onSuccess: () => void
    description: Payment collection modal
    
  - name: SubscriptionBadge
    type: micro
    props:
      subscriptionStatus: string
    description: Shows subscription status
```

#### Mobile Components
```yaml
mobile:
  - name: BillingScreen
    type: screen
    props:
      navigation: NavigationProp
      customerId: string
    description: Billing management screen
    
  - name: PaymentSheet
    type: modal
    props:
      amount: number
      onComplete: (result: PaymentResult) => void
    description: Native payment sheet
```

#### API Schema
```yaml
graphql:
  types:
    - Customer
    - Subscription
    - Invoice
    - Payment
    - Plan
  queries:
    - customer(id: ID!): Customer
    - subscription(id: ID!): Subscription
    - customerSubscriptions(customerId: ID!): [Subscription!]!
  mutations:
    - createCustomer(userId: ID!, email: String!): Customer
    - createSubscription(customerId: ID!, planId: ID!): CreateSubscriptionResult
    - cancelSubscription(id: ID!, immediately: Boolean): Subscription
  subscriptions:
    - subscriptionUpdated(customerId: ID!): Subscription
```

### Integration Points
- **Depends on**: user, notification, analytics
- **Depended by**: user (for plan limits), analytics
- **External services**: Stripe

---

## Actor: notification

### Overview
- **Purpose**: Handles all outbound communications (email, SMS, push notifications)
- **Domain**: Communication
- **Owner**: Backend Team

### State Management
```yaml
state:
  templates:
    type: Record<string, EmailTemplate>
    description: Email/SMS templates
    persistence: required
  messages:
    type: Record<string, Message>
    description: Sent message history
    persistence: required
  preferences:
    type: Record<string, UserPreferences>
    description: User notification preferences
    persistence: required
  campaigns:
    type: Record<string, Campaign>
    description: Marketing campaigns
    persistence: required
```

### Events

#### Incoming Events (Commands/Queries)
```yaml
commands:
  - type: SEND_EMAIL
    payload:
      to: string
      template: string
      data: Record<string, any>
      priority?: 'low' | 'normal' | 'high'
    response: { success: boolean; messageId?: string }
    description: Sends templated email
    
  - type: SEND_SMS
    payload:
      to: string
      message: string
      urgent?: boolean
    response: { success: boolean; messageId?: string }
    description: Sends SMS message
    
  - type: SEND_PUSH
    payload:
      userId: string
      title: string
      body: string
      data?: Record<string, any>
    response: { success: boolean; messageId?: string }
    description: Sends push notification
    
  - type: UPDATE_PREFERENCES
    payload:
      userId: string
      preferences: NotificationPreferences
    response: { success: boolean }
    description: Updates user notification preferences

queries:
  - type: GET_MESSAGE_STATUS
    payload:
      messageId: string
    response: { status: MessageStatus }
    description: Checks delivery status
```

#### Outgoing Events (To Other Actors)
```yaml
dependencies:
  user:
    - event: GET_USER
      purpose: Get user contact info and preferences
      pattern: ask
      
  analytics:
    - event: TRACK_EVENT
      purpose: Track message delivery events
      pattern: tell
```

#### Published Events (Notifications)
```yaml
notifications:
  - type: MESSAGE_SENT
    payload:
      messageId: string
      channel: 'email' | 'sms' | 'push'
      recipient: string
      template?: string
      timestamp: number
    subscribers: [analytics]
    purpose: Track message delivery
    
  - type: MESSAGE_DELIVERED
    payload:
      messageId: string
      deliveredAt: number
    subscribers: [analytics]
    purpose: Track successful delivery
    
  - type: MESSAGE_BOUNCED
    payload:
      messageId: string
      reason: string
      timestamp: number
    subscribers: [analytics, user]
    purpose: Track delivery failures
```

### Component Exports

#### Web Components
```yaml
web:
  - name: NotificationCenter
    type: widget
    props:
      userId: string
      maxItems?: number
    description: In-app notification center
    
  - name: NotificationPreferences
    type: page
    props:
      userId: string
    description: Notification preferences management
    
  - name: NotificationBell
    type: micro
    props:
      userId: string
      showCount?: boolean
    description: Notification bell with count
    
  - name: EmailPreview
    type: modal
    props:
      template: string
      data: Record<string, any>
    description: Preview email templates
```

#### Mobile Components
```yaml
mobile:
  - name: NotificationScreen
    type: screen
    props:
      navigation: NavigationProp
      userId: string
    description: In-app notifications list
    
  - name: PreferencesScreen
    type: screen
    props:
      navigation: NavigationProp
      userId: string
    description: Notification preferences
```

#### API Schema
```yaml
graphql:
  types:
    - Message
    - EmailTemplate
    - NotificationPreferences
    - Campaign
  queries:
    - userNotifications(userId: ID!, limit: Int): [Message!]!
    - notificationPreferences(userId: ID!): NotificationPreferences
  mutations:
    - sendEmail(input: SendEmailInput!): SendResult
    - updateNotificationPreferences(userId: ID!, preferences: PreferencesInput!): NotificationPreferences
    - markAsRead(messageId: ID!): Message
  subscriptions:
    - newNotification(userId: ID!): Message
```

### Integration Points
- **Depends on**: user, analytics
- **Depended by**: billing, user, order, analytics
- **External services**: Resend/SendGrid (email), Twilio (SMS), Firebase (push)

---

## Actor: analytics

### Overview
- **Purpose**: Tracks user behavior, business metrics, and generates insights
- **Domain**: Data and Analytics
- **Owner**: Data Team

### State Management
```yaml
state:
  events:
    type: Record<string, AnalyticsEvent>
    description: Tracked user and system events
    persistence: required
  metrics:
    type: Record<string, Metric>
    description: Calculated business metrics
    persistence: required
  funnels:
    type: Record<string, Funnel>
    description: Conversion funnel definitions
    persistence: required
  cohorts:
    type: Record<string, Cohort>
    description: User cohort analyses
    persistence: required
```

### Events

#### Incoming Events (Commands/Queries)
```yaml
commands:
  - type: TRACK_EVENT
    payload:
      userId?: string
      event: string
      properties: Record<string, any>
      timestamp?: number
    response: { success: boolean; eventId?: string }
    description: Records user or system event
    
  - type: IDENTIFY_USER
    payload:
      userId: string
      traits: Record<string, any>
    response: { success: boolean }
    description: Associates traits with user
    
  - type: TRACK_REVENUE
    payload:
      userId: string
      amount: number
      currency: string
      properties: Record<string, any>
    response: { success: boolean }
    description: Records revenue event

queries:
  - type: GET_METRICS
    payload:
      metric: string
      timeRange: TimeRange
      filters?: Record<string, any>
    response: { value: number; trend?: number }
    description: Retrieves calculated metrics
    
  - type: GET_FUNNEL
    payload:
      funnelId: string
      timeRange: TimeRange
    response: { steps: FunnelStep[] }
    description: Gets funnel analysis
```

#### Outgoing Events (To Other Actors)
```yaml
dependencies:
  user:
    - event: GET_USER
      purpose: Enrich events with user data
      pattern: ask
```

#### Published Events (Notifications)
```yaml
notifications:
  - type: METRIC_THRESHOLD_REACHED
    payload:
      metric: string
      value: number
      threshold: number
      timestamp: number
    subscribers: [notification]
    purpose: Alert when metrics hit thresholds
    
  - type: ANOMALY_DETECTED
    payload:
      metric: string
      expected: number
      actual: number
      severity: 'low' | 'medium' | 'high'
      timestamp: number
    subscribers: [notification]
    purpose: Alert on data anomalies
```

### Component Exports

#### Web Components
```yaml
web:
  - name: DashboardWidget
    type: widget
    props:
      metric: string
      timeRange: TimeRange
      title?: string
    description: Single metric display widget
    
  - name: AnalyticsDashboard
    type: page
    props:
      widgets: DashboardConfig[]
      userId?: string
    description: Complete analytics dashboard
    
  - name: FunnelChart
    type: widget
    props:
      funnelId: string
      timeRange: TimeRange
    description: Funnel conversion visualization
    
  - name: MetricCard
    type: micro
    props:
      metric: string
      value: number
      trend?: number
    description: Simple metric display card
```

#### Mobile Components
```yaml
mobile:
  - name: DashboardScreen
    type: screen
    props:
      navigation: NavigationProp
    description: Mobile analytics dashboard
    
  - name: MetricDetailScreen
    type: screen
    props:
      navigation: NavigationProp
      metric: string
    description: Detailed metric view
```

#### API Schema
```yaml
graphql:
  types:
    - AnalyticsEvent
    - Metric
    - Funnel
    - FunnelStep
    - Cohort
  queries:
    - metrics(timeRange: TimeRangeInput!): [Metric!]!
    - funnel(id: ID!, timeRange: TimeRangeInput!): Funnel
    - userEvents(userId: ID!, limit: Int): [AnalyticsEvent!]!
  mutations:
    - trackEvent(input: TrackEventInput!): AnalyticsEvent
    - identifyUser(userId: ID!, traits: JSON!): Boolean
  subscriptions:
    - metricsUpdated: [Metric!]!
```

### Integration Points
- **Depends on**: user
- **Depended by**: All other actors (for tracking)
- **External services**: PostHog/Mixpanel, Data warehouse

---

## Key Improvements from Original Design

### 1. **Proper Event Structure**
- Clear separation of Commands, Queries, and Notifications
- Defined interaction patterns (ask/tell/publish)
- Explicit response types and timeouts

### 2. **Component Export Specifications**
- Categorized by type (widget/page/modal/micro)
- Clear props definitions
- Platform-specific components (web/mobile)

### 3. **GraphQL Schema Contributions**
- Each actor contributes specific types and operations
- Clear naming conventions
- Subscription support for real-time updates

### 4. **Dependency Mapping**
- Explicit dependencies between actors
- Clear communication patterns
- External service boundaries

### 5. **State Ownership Clarity**
- Each field has a clear owner
- Persistence requirements specified
- No shared state between actors

This structure follows the Actor Definition Guide precisely and creates a solid foundation for AI-assisted project planning and development.