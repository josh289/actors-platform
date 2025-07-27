# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This repository contains documentation for the BMAD-Enhanced Actor Development Framework, a systematic approach to building production-ready actor-based applications. The framework integrates the BMAD (Business Model Architecture Development) methodology with actor-based architecture patterns.

## High-Level Architecture

### BMAD-Actor Framework Phases

The framework follows a systematic 6-phase approach:

1. **Business Requirements Analysis** - Decompose requirements into actors using domain analysis
2. **Model Design** - Create actor specifications with state, events, and components
3. **Architecture Design** - Design scalable system architectures and deployment strategies
4. **Development Implementation** - Generate production-ready code with comprehensive tests
5. **Deployment** - Configure and deploy to Vercel with monitoring
6. **Documentation** - Create comprehensive documentation packages

### Actor Architecture Principles

- **Single Responsibility**: Each actor owns distinct business domain and data
- **Event-Driven**: All state changes happen through events (Commands, Queries, Notifications)
- **Communication Patterns**: Ask (synchronous), Tell (asynchronous), Publish (broadcast)
- **Component Exports**: Web widgets/pages/modals/micro, Mobile screens/widgets
- **Zero Shared State**: Actors never share databases or state

### Core Actors

The framework defines four essential actors that form the foundation:

1. **user** - Authentication, profiles, and authorization
2. **billing** - Customer billing, subscriptions, and payments
3. **notification** - Email, SMS, and push notifications
4. **analytics** - Event tracking and business metrics

## Commands for Development

### Relay CLI Commands (Referenced in docs)

```bash
# Phase 1: Business Requirements
relay bmad analyze --project "Project Name" --output requirements.yaml
relay bmad validate-requirements --file requirements.yaml

# Phase 2: Model Design
relay bmad design-models --requirements requirements.yaml --output models.yaml
relay bmad validate-models --file models.yaml

# Phase 3: Architecture Design
relay bmad design-architecture --models models.yaml --output architecture.yaml
relay bmad validate-architecture --file architecture.yaml

# Phase 4: Development
relay bmad generate-code --architecture architecture.yaml --target ./src
relay bmad test --coverage 90 --integration

# Phase 5: Deployment
relay bmad deploy --strategy blue-green --environment production
relay bmad validate-deployment --environment production

# Phase 6: Documentation
relay bmad generate-docs --output ./docs --include-examples
```

### Actor Development Commands

```bash
# Create new actor
relay create-actor actor-name --template standard
relay create-actor payment-processor --template billing

# Validate actor
relay validate
relay check --coverage 90 --performance --security

# Build and deploy
relay build
relay deploy --target vercel --env production
relay deploy --target vercel --domain billing.myapp.com

# Marketplace publishing
relay marketplace validate
relay marketplace publish --tier silver
```

### Testing Commands

```bash
# Run tests with coverage
relay test --coverage 90

# Run specific test types
relay test unit
relay test integration
relay test components
```

## Important Patterns and Standards

### Event Naming Conventions
- **Commands**: VERB_NOUN (e.g., CREATE_USER, PROCESS_PAYMENT)
- **Queries**: GET_NOUN (e.g., GET_USER, GET_SUBSCRIPTION)
- **Notifications**: NOUN_VERB_PAST (e.g., USER_CREATED, PAYMENT_PROCESSED)

### Actor Communication Patterns
- **Ask Pattern**: Synchronous request-response with 5000ms timeout
- **Tell Pattern**: Asynchronous fire-and-forget commands
- **Publish Pattern**: Event broadcast to multiple subscribers

### Component Export Categories
- **Widget**: Embeddable, reusable components
- **Page**: Full page components
- **Modal**: Overlay components
- **Micro**: Atomic components

### Quality Standards
- Test coverage: 90%+ required
- TypeScript strict mode enabled
- Production-ready error handling with circuit breakers
- Zero-downtime deployment capability

## Project Structure

```
actors_mcp/
├── docs/
│   ├── actor_development_guide.md      # Comprehensive guide for building actors
│   ├── bmad_actor_framework.md         # BMAD methodology integration
│   ├── properly_structured_actors.md   # Core actor specifications
│   ├── claude_code_prompts.md          # Prompt templates for each phase
│   └── additional_docs_needed.md       # Documentation roadmap
```

## Key Concepts to Remember

1. **Actor Responsibility Test**: Each actor must own distinct domain, scale independently, and represent cohesive capability
2. **State Ownership**: Each data field has exactly one owner actor
3. **Event Sourcing**: Optional pattern for actors needing audit trails
4. **Circuit Breaker Pattern**: Required for external service integrations
5. **Vercel-First Deployment**: Primary deployment target with Kubernetes as scaling option

## External Service Integrations

The framework supports integrations with:
- **Authentication**: Supabase, Auth0
- **Payments**: Stripe
- **Email**: Resend, SendGrid
- **SMS**: Twilio
- **Analytics**: PostHog, Mixpanel
- **Push Notifications**: Firebase

## Next Steps for Development

When building with this framework:
1. Start with Phase 1 Business Requirements Analysis
2. Validate each phase before proceeding to the next
3. Use the MCP tools for structured workflow
4. Follow the actor testing patterns for quality assurance
5. Deploy incrementally with staging validation