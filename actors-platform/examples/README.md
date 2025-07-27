# Actor Platform Examples

This directory contains examples demonstrating the Actor Platform's event registry and messaging system.

## Prerequisites

1. PostgreSQL database running with the event registry schema
2. Redis (optional, for caching)
3. Node.js and npm/pnpm installed

## Setup

```bash
# Start the database services
docker-compose up -d postgres redis

# Install dependencies
pnpm install

# Build the SDK
cd packages/actor-sdk
pnpm build
cd ../..
```

## Examples

### 1. Event Registry Basics (`event-registry-basics.ts`)

Demonstrates fundamental event registry operations:
- Registering event definitions with JSON schemas
- Registering actor manifests
- Adding consumer relationships
- Validating event payloads
- Querying event information
- Recording metrics
- Generating TypeScript types

**Run:**
```bash
npx tsx examples/event-registry-basics.ts
```

### 2. Actor Communication (`actor-communication.ts`)

Shows how actors communicate through the event registry:
- Setting up the global event registry
- Initializing actors with registry integration
- Processing commands through the message system
- Handling queries with automatic validation
- Event routing and metrics collection
- Actor dependency visualization
- Event catalog export

**Run:**
```bash
npx tsx examples/actor-communication.ts
```

## Key Concepts

### Event Categories

- **Commands**: Actions that change state (e.g., CREATE_USER, SEND_EMAIL)
- **Queries**: Read-only requests (e.g., GET_USER, GET_NOTIFICATIONS)
- **Notifications**: Events that have occurred (e.g., USER_CREATED, EMAIL_SENT)

### Message Processing Flow

1. Create message using `MessageFactory`
2. Message is automatically validated against registry schema
3. Actor processes message through appropriate handler
4. Metrics are recorded for monitoring
5. Results include any emitted events

### Actor Registration

Each actor must:
1. Implement `getActorManifest()` to declare capabilities
2. Override `registerEventDefinitions()` to register event schemas
3. Call `Actor.setEventRegistry()` before initialization

### Benefits

- **Type Safety**: JSON Schema validation for all events
- **Discovery**: Query which actors handle which events
- **Monitoring**: Built-in metrics for all event operations
- **Documentation**: Auto-generated from event definitions
- **Decoupling**: Actors communicate through well-defined events