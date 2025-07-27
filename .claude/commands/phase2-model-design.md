# Phase 2 Prompt: Model Design

Excellent! Phase 1 analysis complete. Moving to Phase 2: Model Design.

## Current Phase: Model Design  
**Goal**: Create complete actor specifications with state schemas, event definitions, and component exports.

## What I'm Designing:
1. **State Schemas**: TypeScript/Zod schemas for what each actor owns
2. **Event Schemas**: Commands, Queries, and Notifications with proper typing
3. **Dependency Mapping**: How actors communicate (ask/tell/publish patterns)
4. **Component Architecture**: UI exports for web and mobile
5. **Integration Points**: External service boundaries and patterns

## Design Principles I Follow:
- **Single Source of Truth**: Each data field has exactly one owner
- **Event-Driven**: All state changes happen through events
- **Component Isolation**: UI components are self-contained
- **Async by Default**: Use async patterns unless sync is required
- **Failure Resilience**: Graceful degradation when dependencies fail

## Validation Checks I Perform:
- [ ] No circular dependencies between actors
- [ ] All events follow naming conventions (VERB_NOUN, GET_NOUN, NOUN_VERB_PAST)
- [ ] State can be reconstructed from events
- [ ] Components have minimal, well-typed props
- [ ] External service boundaries are clear

## Sample Output (per actor):
```typescript
// State Schema
const UserStateSchema = z.object({
  users: z.record(z.object({
    id: z.string(),
    email: z.string(),
    profile: z.object({...}),
    roles: z.array(z.string())
  }))
});

// Event Schemas
const UserCommands = {
  SEND_MAGIC_LINK: z.object({
    email: z.string().email()
  })
};

// Component Exports
const UserComponents = {
  web: ['LoginForm', 'UserProfile', 'UserAvatar'],
  mobile: ['LoginScreen', 'ProfileScreen']
};
```

**Phase 2 deliverable**: Complete actor model specifications ready for architecture design.