# Event Registry Implementation for NotificationActor

## Summary

The NotificationActor has been updated to integrate with the event registry system. This implementation allows the actor to:

1. Declare which events it produces and consumes
2. Register event schemas for validation
3. Support a unified event handling approach

## Key Changes

### 1. Actor Manifest Implementation

The `getActorManifest()` method declares:
- **Produces**: NOTIFICATION_SENT, NOTIFICATION_FAILED, NOTIFICATION_READ, NOTIFICATION_DELIVERED, NOTIFICATION_BOUNCED
- **Consumes**: All notification commands/queries plus events from other actors (USER_CREATED, PAYMENT_SUCCESSFUL, etc.)

### 2. Event Definition Registration

The `registerEventDefinitions()` method registers JSON schemas for:
- **Commands**: SEND_EMAIL, SEND_SMS, SEND_PUSH, SEND_MULTI_CHANNEL, MARK_AS_READ, DELETE_NOTIFICATION, UPDATE_PREFERENCES
- **Queries**: GET_NOTIFICATION, GET_USER_NOTIFICATIONS, GET_UNREAD_COUNT, GET_MESSAGE_STATUS
- **Notifications**: All events produced by this actor

### 3. Event Handling Structure

- Main `handleEvent()` method routes events to appropriate handlers
- Separate handlers for commands (`onCommand()`) and queries (`onQuery()`)
- Each event type has its own dedicated handler method

### 4. Event Subscription

The `subscribeToEvents()` method sets up listeners for events from other actors that trigger automatic notifications:
- User events (USER_CREATED, USER_VERIFIED, PASSWORD_RESET_REQUESTED)
- Billing events (PAYMENT_SUCCESSFUL, SUBSCRIPTION_EXPIRED)

### 5. Health Check

Custom health check implementation (`performHealthCheck()`) monitors:
- Service initialization status
- Message queue size

## Usage

```typescript
// Initialize the actor
const notificationActor = new NotificationActor(context);
await notificationActor.initialize();

// Register with event registry if available
if (eventRegistry) {
  await notificationActor.registerEventDefinitions(eventRegistry);
  const manifest = notificationActor.getActorManifest();
  await eventRegistry.registerActor(manifest);
}

// Subscribe to events
await notificationActor.subscribeToEvents((eventType, handler) => {
  // Your event subscription logic
});

// Handle events
const result = await notificationActor.handleEvent({
  type: 'SEND_EMAIL',
  payload: {
    to: 'user@example.com',
    template: 'welcome',
    data: { name: 'John Doe' }
  }
});
```

## Benefits

1. **Type Safety**: All events have defined schemas
2. **Discoverability**: Other actors can query which events this actor handles
3. **Validation**: Event payloads are validated against schemas
4. **Documentation**: Event definitions serve as API documentation
5. **Evolution**: Schema versioning supports backward compatibility

## Next Steps

To fully integrate with the actor platform:

1. Install `@actors-platform/sdk` as a dependency
2. Extend from the SDK's BaseActor class for additional features
3. Add integration tests with the event registry
4. Set up monitoring for event metrics