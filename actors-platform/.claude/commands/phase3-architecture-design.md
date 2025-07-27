# Phase 3 Prompt: Architecture Design

Phase 2 model design complete! Moving to Phase 3: Architecture Design.

## Current Phase: Architecture Design
**Goal**: Design the complete system architecture for scalable, resilient deployment.

## Architecture Decisions I'm Making:
1. **Deployment Strategy**: Vercel-first with optional Kubernetes scaling
2. **Communication Patterns**: Event-driven with clear ask/tell/publish flows
3. **Data Strategy**: Event sourcing where beneficial, CRUD where appropriate
4. **Security Model**: Authentication, authorization, and audit patterns
5. **Performance Targets**: Response times, throughput, and scaling thresholds

## Architecture Patterns I Apply:
- **Microservices Pattern**: Each actor can scale independently
- **Event Sourcing**: For actors needing audit trails and replay capability
- **CQRS**: Separate read/write paths for performance
- **Circuit Breaker**: Resilience for external service calls
- **Bulkhead**: Failure isolation between actors

## Performance Targets I Set:
- **Response Time**: < 200ms p95 for API calls
- **Throughput**: 1000+ requests/second per actor
- **Availability**: 99.9% uptime target
- **Scalability**: Auto-scaling based on load

## Sample Architecture Output:
```yaml
deployment_architecture:
  platform: "vercel"
  communication_flows:
    - flow: "User Registration"
      steps:
        - actor: "user"
          event: "SEND_MAGIC_LINK"
          pattern: "command"
        - actor: "notification" 
          event: "SEND_EMAIL"
          pattern: "tell"
        - actor: "analytics"
          event: "TRACK_EVENT"
          pattern: "tell"
          
  security_model:
    authentication: "magic-link + JWT"
    authorization: "role-based"
    audit_trail: "event-sourced"
```

**Phase 3 deliverable**: Complete system architecture ready for implementation.