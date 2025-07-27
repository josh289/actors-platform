# Actor Development Guide

Learn how to build custom actors for the Actor-Agent Development Platform.

## Table of Contents

1. [Actor Fundamentals](#actor-fundamentals)
2. [Creating Your First Actor](#creating-your-first-actor)
3. [State Management](#state-management)
4. [Event Handling](#event-handling)
5. [Component Exports](#component-exports)
6. [Testing Actors](#testing-actors)
7. [Publishing to Marketplace](#publishing-to-marketplace)
8. [Best Practices](#best-practices)

## Actor Fundamentals

### What is an Actor?

An actor is a self-contained business component that:
- **Owns a specific domain** (e.g., authentication, payments, notifications)
- **Manages its own state** independently
- **Communicates via events** (Commands, Queries, Notifications)
- **Exports UI components** for rapid integration
- **Scales independently** of other actors

### Actor Lifecycle

```typescript
// 1. Initialization
const actor = new MyActor(context);
await actor.initialize();

// 2. Handle commands (state changes)
await actor.handle({ type: 'CREATE_USER', payload: {...} });

// 3. Answer queries (read operations)
const result = await actor.query({ type: 'GET_USER', payload: {...} });

// 4. Publish notifications (events)
await actor.publish({ type: 'USER_CREATED', payload: {...} });

// 5. Shutdown
await actor.shutdown();
```

## Creating Your First Actor

### 1. Generate Actor Scaffold

```bash
relay create-actor todo-list --template standard
```

This creates:
```
actors/todo-list/
├── src/
│   ├── index.ts           # Actor implementation
│   ├── types.ts           # Type definitions
│   ├── components/        # UI components
│   │   ├── web/          # React components
│   │   └── mobile/       # React Native components
│   └── tests/            # Test files
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
└── README.md            # Documentation
```

### 2. Define State Schema

```typescript
// src/types.ts
import { z } from 'zod';

export const TodoItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
  createdAt: z.date(),
  userId: z.string(),
});

export const TodoListStateSchema = z.object({
  todos: z.map(z.string(), TodoItemSchema),
  userLists: z.map(z.string(), z.array(z.string())),
});

export type TodoItem = z.infer<typeof TodoItemSchema>;
export type TodoListState = z.infer<typeof TodoListStateSchema>;
```

### 3. Implement Actor Logic

```typescript
// src/index.ts
import { Actor, ActorContext, ActorResult, QueryResult } from '@actors-platform/sdk';
import { TodoListState, TodoItem } from './types';
import { v4 as uuidv4 } from 'uuid';

export class TodoListActor extends Actor<TodoListState> {
  constructor(context: ActorContext) {
    super(context, {
      todos: new Map(),
      userLists: new Map(),
    });
  }

  protected async onInitialize(): Promise<void> {
    // Subscribe to user events
    this.on('user-auth.USER_DELETED', async (event) => {
      await this.handle({
        type: 'DELETE_USER_TODOS',
        payload: { userId: event.payload.userId }
      });
    });
  }

  protected async onCommand(command: Command): Promise<ActorResult> {
    switch (command.type) {
      case 'CREATE_TODO':
        return this.createTodo(command.payload);
      
      case 'UPDATE_TODO':
        return this.updateTodo(command.payload);
      
      case 'DELETE_TODO':
        return this.deleteTodo(command.payload);
      
      case 'TOGGLE_TODO':
        return this.toggleTodo(command.payload);
      
      default:
        return {
          success: false,
          error: new Error(`Unknown command: ${command.type}`),
        };
    }
  }

  protected async onQuery(query: Query): Promise<QueryResult> {
    switch (query.type) {
      case 'GET_TODO':
        return this.getTodo(query.payload);
      
      case 'LIST_TODOS':
        return this.listTodos(query.payload);
      
      case 'GET_STATS':
        return this.getStats(query.payload);
      
      default:
        return {
          success: false,
          error: new Error(`Unknown query: ${query.type}`),
        };
    }
  }

  private async createTodo(payload: {
    title: string;
    userId: string;
  }): Promise<ActorResult> {
    const todo: TodoItem = {
      id: uuidv4(),
      title: payload.title,
      completed: false,
      createdAt: new Date(),
      userId: payload.userId,
    };

    // Update state
    this.state.todos.set(todo.id, todo);
    
    // Update user's todo list
    const userTodos = this.state.userLists.get(payload.userId) || [];
    userTodos.push(todo.id);
    this.state.userLists.set(payload.userId, userTodos);

    // Track analytics
    await this.tell('analytics', {
      type: 'TRACK_EVENT',
      payload: {
        name: 'todo_created',
        userId: payload.userId,
        properties: { todoId: todo.id },
      },
    });

    return {
      success: true,
      data: todo,
      events: [{
        type: 'TODO_CREATED',
        payload: { todo },
      }],
    };
  }

  private async toggleTodo(payload: {
    todoId: string;
    userId: string;
  }): Promise<ActorResult> {
    const todo = this.state.todos.get(payload.todoId);
    
    if (!todo || todo.userId !== payload.userId) {
      return {
        success: false,
        error: new Error('Todo not found or access denied'),
      };
    }

    todo.completed = !todo.completed;
    
    return {
      success: true,
      data: todo,
      events: [{
        type: 'TODO_TOGGLED',
        payload: { todoId: todo.id, completed: todo.completed },
      }],
    };
  }

  private async listTodos(payload: {
    userId: string;
    completed?: boolean;
  }): Promise<QueryResult> {
    const userTodoIds = this.state.userLists.get(payload.userId) || [];
    
    const todos = userTodoIds
      .map(id => this.state.todos.get(id))
      .filter(todo => todo !== undefined)
      .filter(todo => 
        payload.completed === undefined || 
        todo.completed === payload.completed
      );

    return {
      success: true,
      data: todos,
    };
  }
}
```

## State Management

### State Persistence

Actors automatically persist state between invocations:

```typescript
protected async onCommand(command: Command): Promise<ActorResult> {
  // Modify state
  this.state.someValue = newValue;
  
  // State is automatically saved after command execution
  return { success: true };
}
```

### State Validation

Use Zod schemas to validate state:

```typescript
protected async onInitialize(): Promise<void> {
  // Validate loaded state
  const result = TodoListStateSchema.safeParse(this.state);
  
  if (!result.success) {
    this.context.logger.error('Invalid state detected', result.error);
    // Reset to valid state
    this.state = {
      todos: new Map(),
      userLists: new Map(),
    };
  }
}
```

### State Migrations

Handle state schema changes:

```typescript
protected async onInitialize(): Promise<void> {
  const version = this.state.version || 1;
  
  if (version < 2) {
    // Migrate from v1 to v2
    this.state = migrateV1ToV2(this.state);
    this.state.version = 2;
  }
}
```

## Event Handling

### Command Events (State Changes)

Commands modify actor state:

```typescript
// Define command types
type TodoCommands = 
  | { type: 'CREATE_TODO'; payload: { title: string; userId: string } }
  | { type: 'UPDATE_TODO'; payload: { todoId: string; updates: Partial<TodoItem> } }
  | { type: 'DELETE_TODO'; payload: { todoId: string; userId: string } };

// Handle commands
protected async onCommand(command: TodoCommands): Promise<ActorResult> {
  // Validate permissions
  if (!this.canUserModify(command.payload.userId, command.payload.todoId)) {
    return { success: false, error: new Error('Access denied') };
  }
  
  // Apply state change
  // Return result with emitted events
}
```

### Query Events (Read Operations)

Queries read actor state without modifications:

```typescript
// Define query types
type TodoQueries =
  | { type: 'GET_TODO'; payload: { todoId: string } }
  | { type: 'LIST_TODOS'; payload: { userId: string; filter?: TodoFilter } }
  | { type: 'SEARCH_TODOS'; payload: { query: string; userId: string } };

// Handle queries
protected async onQuery(query: TodoQueries): Promise<QueryResult> {
  // No state modifications allowed
  // Return requested data
}
```

### Notification Events (Broadcasts)

Publish events for other actors:

```typescript
// After successful command
await this.publish({
  type: 'TODO_COMPLETED',
  payload: {
    todoId: todo.id,
    userId: todo.userId,
    completedAt: new Date(),
  },
});

// Subscribe to external events
this.on('billing.SUBSCRIPTION_CANCELLED', async (event) => {
  // Handle subscription cancellation
  await this.archiveUserTodos(event.payload.userId);
});
```

## Component Exports

### Web Components (React)

```typescript
// src/components/web/TodoList.tsx
import React, { useState, useEffect } from 'react';
import { useActor } from '@actors-platform/sdk/react';

interface TodoListProps {
  userId: string;
  onComplete?: (todoId: string) => void;
}

export const TodoList: React.FC<TodoListProps> = ({ userId, onComplete }) => {
  const actor = useActor('todo-list');
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState('');

  useEffect(() => {
    loadTodos();
  }, [userId]);

  const loadTodos = async () => {
    const result = await actor.query({
      type: 'LIST_TODOS',
      payload: { userId },
    });
    
    if (result.success) {
      setTodos(result.data);
    }
  };

  const createTodo = async () => {
    if (!newTodo.trim()) return;

    const result = await actor.command({
      type: 'CREATE_TODO',
      payload: { title: newTodo, userId },
    });

    if (result.success) {
      setNewTodo('');
      await loadTodos();
    }
  };

  const toggleTodo = async (todoId: string) => {
    await actor.command({
      type: 'TOGGLE_TODO',
      payload: { todoId, userId },
    });
    
    await loadTodos();
    onComplete?.(todoId);
  };

  return (
    <div className="todo-list">
      <div className="todo-input">
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && createTodo()}
          placeholder="Add a new todo..."
        />
        <button onClick={createTodo}>Add</button>
      </div>
      
      <ul className="todos">
        {todos.map((todo) => (
          <li key={todo.id} className={todo.completed ? 'completed' : ''}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id)}
            />
            <span>{todo.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
```

### Mobile Components (React Native)

```typescript
// src/components/mobile/TodoListScreen.tsx
import React from 'react';
import { View, FlatList, TextInput, TouchableOpacity, Text } from 'react-native';
import { useActor } from '@actors-platform/sdk/react-native';

export const TodoListScreen = ({ userId }) => {
  const actor = useActor('todo-list');
  // Similar implementation adapted for React Native
};
```

### Component Manifest

```typescript
// src/index.ts
export const manifest = createManifest(
  'todo-list',
  '1.0.0',
  [
    ComponentBuilder.widget('TodoList', ComponentType.REACT, z.object({
      userId: z.string(),
      onComplete: z.function().optional(),
    })),
    ComponentBuilder.widget('TodoItem', ComponentType.REACT, z.object({
      todo: TodoItemSchema,
      onToggle: z.function(),
      onDelete: z.function(),
    })),
    ComponentBuilder.page('TodoDashboard', ComponentType.REACT),
    ComponentBuilder.screen('TodoListScreen', ComponentType.REACT_NATIVE),
  ],
  {
    'react': '^18.0.0',
    'react-native': '^0.72.0',
  }
);
```

## Testing Actors

### Unit Tests

```typescript
// src/tests/todo-list.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TodoListActor } from '../index';
import { createTestContext } from '@actors-platform/sdk/testing';

describe('TodoListActor', () => {
  let actor: TodoListActor;
  let context: TestContext;

  beforeEach(async () => {
    context = createTestContext();
    actor = new TodoListActor(context);
    await actor.initialize();
  });

  describe('CREATE_TODO', () => {
    it('should create a new todo', async () => {
      const result = await actor.handle({
        type: 'CREATE_TODO',
        payload: {
          title: 'Test todo',
          userId: 'user123',
        },
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        title: 'Test todo',
        completed: false,
        userId: 'user123',
      });
    });

    it('should emit TODO_CREATED event', async () => {
      const result = await actor.handle({
        type: 'CREATE_TODO',
        payload: { title: 'Test', userId: 'user123' },
      });

      expect(result.events).toContainEqual(
        expect.objectContaining({
          type: 'TODO_CREATED',
          payload: expect.objectContaining({
            todo: expect.any(Object),
          }),
        })
      );
    });
  });

  describe('LIST_TODOS', () => {
    it('should return user todos', async () => {
      // Create some todos
      await actor.handle({
        type: 'CREATE_TODO',
        payload: { title: 'Todo 1', userId: 'user123' },
      });
      await actor.handle({
        type: 'CREATE_TODO',
        payload: { title: 'Todo 2', userId: 'user123' },
      });

      // List todos
      const result = await actor.query({
        type: 'LIST_TODOS',
        payload: { userId: 'user123' },
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });
});
```

### Integration Tests

```typescript
// src/tests/integration.test.ts
describe('TodoList Integration', () => {
  it('should integrate with analytics actor', async () => {
    const mockAnalytics = createMockActor('analytics');
    
    await actor.handle({
      type: 'CREATE_TODO',
      payload: { title: 'Test', userId: 'user123' },
    });

    expect(mockAnalytics.tell).toHaveBeenCalledWith({
      type: 'TRACK_EVENT',
      payload: expect.objectContaining({
        name: 'todo_created',
      }),
    });
  });
});
```

### Component Tests

```typescript
// src/tests/components.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react';
import { TodoList } from '../components/web/TodoList';
import { ActorProvider } from '@actors-platform/sdk/react';

describe('TodoList Component', () => {
  it('should render and create todos', async () => {
    const { getByPlaceholderText, getByText } = render(
      <ActorProvider actors={{ 'todo-list': mockActor }}>
        <TodoList userId="user123" />
      </ActorProvider>
    );

    const input = getByPlaceholderText('Add a new todo...');
    fireEvent.change(input, { target: { value: 'New todo' } });
    fireEvent.click(getByText('Add'));

    await waitFor(() => {
      expect(mockActor.command).toHaveBeenCalledWith({
        type: 'CREATE_TODO',
        payload: { title: 'New todo', userId: 'user123' },
      });
    });
  });
});
```

## Publishing to Marketplace

### 1. Prepare for Publishing

```bash
# Run quality checks
relay validate
relay test --coverage 90
relay lint
```

### 2. Update Metadata

```json
// package.json
{
  "name": "@actors-platform/todo-list",
  "version": "1.0.0",
  "description": "Todo list management actor",
  "actor": {
    "name": "todo-list",
    "domain": "productivity",
    "pricing": {
      "tier": "bronze",
      "price": 0
    },
    "capabilities": [
      "todo-management",
      "user-lists",
      "completion-tracking"
    ]
  }
}
```

### 3. Write Documentation

```markdown
// README.md
# Todo List Actor

Complete todo list management for your application.

## Features
- Create, update, delete todos
- User-specific lists
- Completion tracking
- Ready-to-use React components

## Installation
\`\`\`bash
relay add-actor todo-list
\`\`\`

## Usage
[Examples...]
```

### 4. Publish

```bash
# Publish to marketplace
relay publish --tier bronze

# For paid actors
relay publish --tier silver --price 29
```

## Best Practices

### 1. Domain Boundaries

✅ **DO**:
- Keep actors focused on a single domain
- Define clear boundaries between actors
- Use events for cross-actor communication

❌ **DON'T**:
- Mix multiple domains in one actor
- Share state between actors
- Make synchronous calls between actors

### 2. State Design

✅ **DO**:
- Use immutable state updates
- Validate state with schemas
- Plan for state migrations

❌ **DON'T**:
- Store large blobs in state
- Keep sensitive data unencrypted
- Assume state structure won't change

### 3. Event Design

✅ **DO**:
- Use descriptive event names
- Include all necessary context
- Version events when needed

❌ **DON'T**:
- Emit events with missing data
- Change event payloads without versioning
- Use generic event names

### 4. Error Handling

```typescript
protected async onCommand(command: Command): Promise<ActorResult> {
  try {
    // Validate input
    const validation = CommandSchema.safeParse(command);
    if (!validation.success) {
      return {
        success: false,
        error: new Error(`Invalid command: ${validation.error.message}`),
      };
    }

    // Process command
    const result = await this.processCommand(command);
    
    // Emit success events
    return {
      success: true,
      data: result,
      events: this.getSuccessEvents(result),
    };
  } catch (error) {
    // Log error
    this.context.logger.error('Command failed', error);
    
    // Return user-friendly error
    return {
      success: false,
      error: new Error('Operation failed. Please try again.'),
    };
  }
}
```

### 5. Performance

✅ **DO**:
- Use indexes for large collections
- Implement pagination for lists
- Cache expensive computations

❌ **DON'T**:
- Load entire state into memory
- Perform blocking operations
- Make unnecessary external calls

### 6. Security

```typescript
// Always validate permissions
private async canUserAccess(userId: string, resourceId: string): Promise<boolean> {
  const resource = this.state.resources.get(resourceId);
  if (!resource) return false;
  
  return resource.ownerId === userId || 
         resource.sharedWith.includes(userId);
}

// Sanitize inputs
private sanitizeInput(input: string): string {
  return input.trim().slice(0, 1000);
}

// Don't expose internal state
protected async onQuery(query: Query): Promise<QueryResult> {
  const data = await this.getData(query);
  
  // Filter sensitive fields
  return {
    success: true,
    data: this.filterSensitiveData(data),
  };
}
```

## Advanced Topics

### Custom Runtimes

```typescript
// Implement custom runtime adapter
export class RedisActorRuntime implements ActorRuntime {
  async loadState(actorId: string): Promise<ActorState> {
    const data = await redis.get(`actor:${actorId}`);
    return data ? JSON.parse(data) : {};
  }

  async saveState(actorId: string, state: ActorState): Promise<void> {
    await redis.set(`actor:${actorId}`, JSON.stringify(state));
  }

  async publish(event: Event): Promise<void> {
    await redis.publish('actor-events', JSON.stringify(event));
  }
}
```

### Event Sourcing

```typescript
// Store events instead of state
export class EventSourcedActor extends Actor {
  private events: Event[] = [];

  protected async onCommand(command: Command): Promise<ActorResult> {
    const event = this.commandToEvent(command);
    
    // Append event
    this.events.push(event);
    
    // Rebuild state from events
    this.state = this.events.reduce(this.applyEvent, {});
    
    return { success: true, events: [event] };
  }
}
```

### Distributed Actors

```typescript
// Shard actors across multiple instances
export class ShardedActor extends Actor {
  private getShard(key: string): number {
    return hash(key) % this.context.shardCount;
  }

  protected async onCommand(command: Command): Promise<ActorResult> {
    const shard = this.getShard(command.payload.id);
    
    if (shard !== this.context.shardId) {
      // Forward to correct shard
      return this.forwardToShard(shard, command);
    }
    
    // Process locally
    return super.onCommand(command);
  }
}
```

## Resources

- **Actor SDK Reference**: [docs.actors.dev/sdk](https://docs.actors.dev/sdk)
- **Example Actors**: [github.com/actors-platform/examples](https://github.com/actors-platform/examples)
- **Community Forum**: [forum.actors.dev](https://forum.actors.dev)
- **Video Tutorials**: [youtube.com/actors-platform](https://youtube.com/actors-platform)

---

Ready to build your own actor? Start with `relay create-actor` and join our community! 🚀