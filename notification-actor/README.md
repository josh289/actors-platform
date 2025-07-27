# Notification Actor

A production-ready actor for handling all outbound communications including email, SMS, and push notifications.

## Features

- **Multi-channel Support**: Email (SendGrid/Resend), SMS (Twilio), Push (Firebase)
- **Template Management**: Handlebars-based email templates with variable substitution
- **User Preferences**: Granular control over notification channels and categories
- **Quiet Hours**: Respect user-defined quiet hours with timezone support
- **Circuit Breaker Pattern**: Automatic failure handling for external services
- **Campaign Management**: Bulk sending with metrics tracking
- **Real-time Updates**: WebSocket support for instant notification delivery
- **GraphQL API**: Complete GraphQL schema for all operations

## Installation

```bash
npm install notification-actor
```

## Configuration

```typescript
const notificationActor = new NotificationActor(context, {
  email: {
    provider: 'sendgrid',
    apiKey: process.env.SENDGRID_API_KEY,
    fromEmail: 'noreply@example.com',
    fromName: 'Your App'
  },
  sms: {
    provider: 'twilio',
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_FROM_NUMBER
  },
  push: {
    provider: 'firebase',
    serviceAccount: require('./firebase-service-account.json')
  }
});
```

## Usage

### Send Email

```typescript
const result = await actor.handleEvent({
  type: 'SEND_EMAIL',
  payload: {
    to: 'user@example.com',
    template: 'welcome',
    data: {
      name: 'John Doe',
      activationLink: 'https://app.com/activate/123'
    },
    priority: 'high'
  }
});
```

### Send SMS

```typescript
const result = await actor.handleEvent({
  type: 'SEND_SMS',
  payload: {
    to: '+1234567890',
    message: 'Your verification code is 123456',
    urgent: true
  }
});
```

### Send Push Notification

```typescript
const result = await actor.handleEvent({
  type: 'SEND_PUSH',
  payload: {
    userId: 'user_123',
    title: 'New Message',
    body: 'You have received a new message',
    data: {
      messageId: 'msg_456',
      deepLink: 'app://messages/456'
    }
  }
});
```

### Update User Preferences

```typescript
const result = await actor.handleEvent({
  type: 'UPDATE_PREFERENCES',
  payload: {
    userId: 'user_123',
    preferences: {
      email: {
        enabled: true,
        categories: {
          marketing: false,
          transactional: true,
          updates: true
        }
      },
      quietHours: {
        enabled: true,
        start: '22:00',
        end: '08:00',
        timezone: 'America/New_York'
      }
    }
  }
});
```

## Web Components

### NotificationCenter

```tsx
import { NotificationCenter } from 'notification-actor';

<NotificationCenter 
  userId="user_123"
  maxItems={20}
  onMarkAsRead={(id) => console.log('Marked as read:', id)}
/>
```

### NotificationBell

```tsx
import { NotificationBell } from 'notification-actor';

<NotificationBell 
  userId="user_123"
  showCount={true}
  onClick={() => openNotificationCenter()}
/>
```

### NotificationPreferences

```tsx
import { NotificationPreferences } from 'notification-actor';

<NotificationPreferences 
  userId="user_123"
  onSave={(prefs) => console.log('Saved:', prefs)}
/>
```

## GraphQL Schema

```graphql
query UserNotifications($userId: ID!) {
  userNotifications(userId: $userId, limit: 20) {
    id
    channel
    recipient
    content
    status
    sentAt
  }
}

mutation SendEmail($input: SendEmailInput!) {
  sendEmail(input: $input) {
    success
    messageId
    error
  }
}

subscription NewNotification($userId: ID!) {
  newNotification(userId: $userId) {
    id
    channel
    content
    sentAt
  }
}
```

## Email Templates

Templates use Handlebars syntax with built-in helpers:

```handlebars
<h1>Welcome {{name}}!</h1>
<p>Your account was created on {{formatDate createdAt}}</p>
<p>Your balance: {{formatCurrency balance "USD"}}</p>
<p>Username: {{lowercase username}}</p>
```

## Circuit Breaker

The actor implements circuit breaker pattern for all external services:

- **Closed**: Normal operation
- **Open**: Service failures exceeded threshold, requests fail immediately
- **Half-Open**: Testing if service has recovered

Configure thresholds:

```typescript
{
  email: {
    circuitBreaker: {
      failureThreshold: 5,
      timeout: 10000,
      resetTimeout: 60000
    }
  }
}
```

## Testing

This project uses Vitest for testing. See [Testing Guide](./docs/testing-with-vitest.md) for detailed information.

```bash
# Run all tests
npm test

# Watch mode during development
npm run test:watch

# Run specific test suites
npm run test:unit
npm run test:integration

# Interactive UI mode
npm run test:ui

# Run with coverage
npm test -- --coverage
```

## Performance

- Email: 1000 messages/minute
- SMS: 100 messages/minute  
- Push: 5000 messages/minute

SLA targets:
- Email send: < 2000ms
- SMS send: < 1000ms
- Push send: < 1500ms

## Environment Variables

Required:
- `SENDGRID_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `FIREBASE_SERVICE_ACCOUNT`

Optional:
- `EMAIL_FROM_ADDRESS`
- `EMAIL_FROM_NAME`
- `SMS_STATUS_WEBHOOK_URL`
- `REDIS_URL`
- `LOG_LEVEL`

## License

MIT