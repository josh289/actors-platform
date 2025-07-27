# BMAD-Enhanced Actor Development Framework
*Empowering Claude Code to Build Perfect Actor-Based Systems*

## Framework Integration Overview

The BMAD Method's systematic approach to software development perfectly complements our Actor-Agent platform. By integrating BMAD's phases with actor-specific patterns, we create a deterministic process that Claude Code can follow to build production-ready systems consistently.

## Phase 1: Business Requirements Analysis (Enhanced for Actors)

### BMAD-Actor Requirements Template

```yaml
# Project Analysis Template for Claude Code
project_analysis:
  business_context:
    domain: string              # E.g., "E-commerce Platform"
    primary_users: string[]     # E.g., ["customers", "merchants", "admins"]
    core_value_prop: string     # One sentence value proposition
    success_metrics: string[]   # Measurable outcomes
    
  actor_identification:
    business_capabilities:      # BMAD Domain Analysis
      - capability: string      # E.g., "Customer Management"
        data_owned: string[]    # E.g., ["user profiles", "preferences"]
        business_rules: string[] # E.g., ["email must be unique"]
        lifecycle: string       # Independent/dependent
        scaling_needs: string   # High/medium/low
        
  user_journeys:              # BMAD User Story Mapping
    - journey: string         # E.g., "Customer Purchase"
      steps:
        - step: string        # E.g., "Browse Products"
          actor: string       # E.g., "product"
          events: string[]    # E.g., ["SEARCH_PRODUCTS", "VIEW_PRODUCT"]
          ui_components: string[] # E.g., ["ProductGrid", "ProductCard"]
```

### Claude Code Prompt Template for Phase 1

```markdown
# BMAD Phase 1: Business Requirements Analysis for Actor Systems

You are analyzing a project to decompose it into actors following the BMAD Method enhanced for actor-based architecture.

## Input Requirements:
- Project description
- Target users
- Core features needed

## Your Task:
1. **Domain Analysis (BMAD)**: Identify distinct business domains
2. **Actor Identification**: Apply actor responsibility test to each domain
3. **Boundary Definition**: Ensure single responsibility and clear data ownership
4. **User Journey Mapping**: Map each user action to actor events
5. **Component Planning**: Identify UI components each actor will export

## Output Format:
```yaml
# Use the BMAD-Actor Requirements Template above
```

## Actor Validation Checklist:
For each identified actor, verify:
- [ ] Owns distinct business domain
- [ ] Has 5-15 event types (not too simple/complex)
- [ ] Can function independently if dependencies fail
- [ ] Would make sense as a microservice
- [ ] Can be developed by 2-3 person team

## Next Phase Trigger:
Once all actors pass validation, proceed to Phase 2: Model Design.
```

## Phase 2: Model Design (Actor State & Event Design)

### BMAD-Actor Model Template

```yaml
# Actor Model Design Template
actor_models:
  - name: string              # Actor name (lowercase, singular)
    domain: string            # Business domain
    purpose: string           # Single responsibility statement
    
    # BMAD Data Modeling Applied to Actor State
    state_schema:
      entities:
        - entity: string      # E.g., "User"
          fields:
            - name: string    # Field name
              type: string    # TypeScript type
              required: boolean
              validation: string # Zod validation rules
              description: string
              
    # BMAD Event Modeling
    event_design:
      commands:               # State-changing operations
        - event: string       # E.g., "CREATE_USER"
          payload_schema: object
          business_rules: string[]
          side_effects: string[]
          
      queries:                # State-reading operations  
        - event: string       # E.g., "GET_USER"
          payload_schema: object
          response_schema: object
          performance_req: string
          
      notifications:          # Published events
        - event: string       # E.g., "USER_CREATED"
          payload_schema: object
          subscribers: string[]
          purpose: string
          
    # BMAD Integration Modeling
    dependencies:
      - actor: string         # Dependency actor name
        pattern: string       # ask/tell/publish
        events: string[]      # Events used
        purpose: string       # Why needed
        timeout: string       # For ask pattern
        
    # BMAD Component Architecture
    ui_exports:
      web_components:
        - name: string        # Component name
          type: string        # widget/page/modal/micro
          purpose: string     # What it does
          props_schema: object
          dependencies: string[] # Other components used
          
      mobile_components:
        - name: string
          type: string        # screen/widget/modal
          purpose: string
          props_schema: object
          navigation: string  # stack/tab/drawer
```

### Claude Code Prompt Template for Phase 2

```markdown
# BMAD Phase 2: Model Design for Actor Architecture

Using the business requirements from Phase 1, design the complete actor models.

## Your Task:
1. **State Schema Design (BMAD Data Modeling)**: Define what each actor owns
2. **Event Schema Design (BMAD Event Modeling)**: Define all commands, queries, notifications
3. **Dependency Mapping (BMAD Integration)**: Define inter-actor communication
4. **Component Architecture (BMAD UI Modeling)**: Define UI exports for each actor
5. **Validation Rules**: Apply business constraints using Zod schemas

## Design Principles:
- Each actor owns its data exclusively (no shared state)
- Events follow naming conventions (VERB_NOUN, GET_NOUN, NOUN_VERB_PAST)
- Components are self-contained with minimal props
- Dependencies use appropriate patterns (ask for sync, tell for async)

## Output Format:
```yaml
# Use the BMAD-Actor Model Template above
```

## Validation Checks:
- [ ] No circular dependencies between actors
- [ ] All events have proper schemas
- [ ] State can be reconstructed from events
- [ ] UI components have minimal, well-typed props
- [ ] External service boundaries are clear

## Next Phase Trigger:
Once all models are validated and consistent, proceed to Phase 3: Architecture Design.
```

## Phase 3: Architecture Design (System Orchestration)

### BMAD-Actor Architecture Template

```yaml
# System Architecture Design Template
system_architecture:
  # BMAD System Design
  deployment_architecture:
    target_platform: string   # vercel/kubernetes/both
    scaling_strategy: string  # horizontal/vertical/hybrid
    data_strategy: string     # event-sourcing/crud/hybrid
    
  # Actor Communication Patterns
  communication_flows:
    - flow_name: string       # E.g., "User Registration Flow"
      trigger: string         # Initial event
      steps:
        - actor: string       # Which actor handles this step
          event: string       # Event processed
          pattern: string     # ask/tell/publish
          timeout: string     # For ask patterns
          failure_mode: string # How to handle failures
          
  # BMAD Infrastructure Design
  infrastructure:
    runtime_config:
      vercel:
        functions: string[]   # Function names
        environment: string[] # Required env vars
        timeouts: object     # Per-function timeouts
        regions: string[]    # Deployment regions
        
    external_services:
      - service: string      # E.g., "Stripe"
        purpose: string      # Why used
        integration_actor: string # Which actor handles it
        fallback_strategy: string # What happens if down
        
  # BMAD Security Design
  security_model:
    authentication: string   # How users are authenticated
    authorization: string   # How permissions are checked
    data_protection: string # How sensitive data is protected
    audit_trail: string    # How actions are logged
    
  # BMAD Performance Design
  performance_targets:
    response_times:
      p95: string           # 95th percentile response time
      p99: string           # 99th percentile response time
    throughput: string      # Requests per second
    availability: string    # Uptime target
    scalability: string     # How system scales
```

### Claude Code Prompt Template for Phase 3

```markdown
# BMAD Phase 3: Architecture Design for Actor Systems

Design the complete system architecture using the actor models from Phase 2.

## Your Task:
1. **Deployment Architecture (BMAD System Design)**: Choose deployment strategy
2. **Communication Flow Design**: Map complete user journeys through actors
3. **Infrastructure Planning (BMAD Infrastructure)**: Define runtime requirements
4. **Security Architecture (BMAD Security)**: Design auth, authz, and audit
5. **Performance Architecture (BMAD Performance)**: Set SLA targets and scaling

## Architecture Principles:
- Actors scale independently based on load
- Communication follows defined patterns (ask/tell/publish)
- Failures are contained and don't cascade
- Security is applied at actor boundaries
- Performance is measurable and optimizable

## Output Format:
```yaml
# Use the BMAD-Actor Architecture Template above
```

## Architecture Validation:
- [ ] No single points of failure
- [ ] Clear error handling and recovery
- [ ] Security applied consistently
- [ ] Performance targets are achievable
- [ ] Deployment is automated and repeatable

## Next Phase Trigger:
Once architecture is validated and approved, proceed to Phase 4: Development Implementation.
```

## Phase 4: Development Implementation (BMAD-Guided Code Generation)

### BMAD-Actor Development Template

```yaml
# Implementation Planning Template
implementation_plan:
  development_order:        # BMAD Implementation Sequencing
    - phase: string         # E.g., "Core Actors"
      actors: string[]      # Actors to implement
      dependencies: string[] # What must be done first
      deliverables: string[] # What gets delivered
      validation: string[]  # How to verify completion
      
  # BMAD Test-Driven Development
  testing_strategy:
    unit_tests:
      coverage_target: number # E.g., 90
      frameworks: string[]   # E.g., ["vitest", "jest"]
      patterns: string[]     # Testing patterns to follow
      
    integration_tests:
      scenarios: string[]    # Key integration scenarios
      mock_strategy: string  # How to mock dependencies
      data_fixtures: string[] # Test data needed
      
    component_tests:
      frameworks: string[]   # E.g., ["@testing-library/react"]
      coverage_target: number
      accessibility: boolean # Include a11y tests
      
  # BMAD Code Quality Standards
  quality_gates:
    code_standards: string[] # ESLint rules, Prettier config
    performance: string[]   # Bundle size, runtime performance
    security: string[]      # Security scanning requirements
    documentation: string[] # Doc requirements
    
  # BMAD Deployment Pipeline
  deployment_pipeline:
    stages:
      - stage: string       # E.g., "Build"
        actions: string[]   # What happens in this stage
        validation: string[] # How to verify success
        rollback: string    # Rollback strategy
```

### Claude Code Prompt Template for Phase 4

```markdown
# BMAD Phase 4: Development Implementation for Actor Systems

Implement the actor system using the architecture from Phase 3.

## Your Task:
1. **Development Sequencing (BMAD)**: Order implementation for minimal risk
2. **Test-Driven Development (BMAD TDD)**: Write tests first, then implementation
3. **Code Generation**: Generate all actor handlers, state management, and UI components
4. **Quality Assurance (BMAD QA)**: Apply quality gates throughout development
5. **Deployment Pipeline (BMAD DevOps)**: Set up automated deployment

## Implementation Principles:
- Follow actor specifications exactly
- Implement tests before production code
- Apply consistent code patterns across all actors
- Validate each component independently
- Maintain high code quality standards

## Code Generation Order:
1. **Actor Core**: State schemas, event handlers, integration layer
2. **Actor Tests**: Unit tests, integration tests, component tests  
3. **UI Components**: Web components, mobile components, GraphQL schema
4. **Deployment Config**: Vercel config, environment setup, CI/CD pipeline

## Output Format:
Generate complete, production-ready code for each actor including:
- TypeScript implementation following patterns
- Comprehensive test suites
- React/React Native components
- GraphQL schema contributions
- Deployment configurations

## Quality Validation:
- [ ] All tests pass with required coverage
- [ ] Code follows established patterns
- [ ] Components render correctly
- [ ] API endpoints work as specified
- [ ] Deployment succeeds without errors

## Next Phase Trigger:
Once all actors are implemented and validated, proceed to Phase 5: Deployment.
```

## Phase 5: Deployment (BMAD Production Deployment)

### BMAD-Actor Deployment Template

```yaml
# Deployment Execution Template
deployment_execution:
  # BMAD Environment Strategy
  environments:
    - name: string          # E.g., "staging"
      purpose: string       # E.g., "Integration testing"
      config: object        # Environment-specific config
      validation: string[]  # How to verify environment health
      
  # BMAD Release Strategy  
  release_strategy:
    type: string            # blue-green/canary/rolling
    rollback_triggers: string[] # When to rollback automatically
    success_criteria: string[] # How to measure success
    monitoring: string[]    # What to monitor post-deployment
    
  # BMAD Operations Setup
  operations:
    monitoring:
      metrics: string[]     # Business and technical metrics
      alerts: string[]      # When to notify team
      dashboards: string[]  # What dashboards to create
      
    logging:
      level: string         # Log level per environment
      aggregation: string   # How logs are collected
      retention: string     # How long to keep logs
      
    backup:
      frequency: string     # How often to backup
      retention: string     # How long to keep backups
      recovery_rto: string  # Recovery time objective
```

### Claude Code Prompt Template for Phase 5

```markdown
# BMAD Phase 5: Deployment for Actor Systems

Deploy the implemented actor system using BMAD production practices.

## Your Task:
1. **Environment Setup (BMAD Environments)**: Configure staging and production
2. **Release Execution (BMAD Release)**: Deploy using proven strategies
3. **Operations Setup (BMAD Operations)**: Configure monitoring and alerting
4. **Validation (BMAD Validation)**: Verify deployment success
5. **Documentation (BMAD Documentation)**: Update operational docs

## Deployment Principles:
- Zero-downtime deployments
- Automated rollback on failure
- Comprehensive monitoring from day one
- Clear operational procedures
- Documented recovery processes

## Deployment Checklist:
- [ ] Environment variables configured correctly
- [ ] All external service integrations working
- [ ] Monitoring and alerting active
- [ ] Backup and recovery procedures tested
- [ ] Documentation updated and accessible

## Success Criteria:
- [ ] All actors responding to health checks
- [ ] User journeys working end-to-end
- [ ] Performance targets being met
- [ ] No critical alerts or errors
- [ ] Team can operate the system confidently

## Next Phase Trigger:
Once deployment is successful and stable, proceed to Phase 6: Deployment.
```

## Phase 6: Documentation (BMAD Knowledge Management)

### BMAD-Actor Documentation Template

```yaml
# Documentation Package Template
documentation_package:
  # BMAD Technical Documentation
  technical_docs:
    architecture_overview: string    # High-level system design
    actor_specifications: string[]   # Detailed actor docs
    api_reference: string           # Complete API documentation
    deployment_guide: string        # How to deploy and configure
    troubleshooting: string         # Common issues and solutions
    
  # BMAD User Documentation
  user_docs:
    quick_start: string             # 5-minute getting started
    user_guides: string[]           # Step-by-step guides
    examples: string[]              # Code examples and patterns
    faq: string                     # Frequently asked questions
    
  # BMAD Operational Documentation
  operational_docs:
    monitoring: string              # How to monitor the system
    alerting: string               # How to respond to alerts
    maintenance: string            # Regular maintenance procedures
    disaster_recovery: string      # How to recover from failures
    
  # BMAD Knowledge Base
  knowledge_management:
    decision_log: string[]          # Why certain decisions were made
    lessons_learned: string[]       # What worked well/didn't
    future_enhancements: string[]   # Planned improvements
    team_knowledge: string[]        # Domain knowledge capture
```

## Integrated BMAD-Actor CLI Commands

### Enhanced Relay CLI with BMAD Integration

```bash
# BMAD Phase 1: Business Requirements Analysis
relay bmad analyze --project "E-commerce Platform" --output requirements.yaml
relay bmad validate-requirements --file requirements.yaml

# BMAD Phase 2: Model Design  
relay bmad design-models --requirements requirements.yaml --output models.yaml
relay bmad validate-models --file models.yaml

# BMAD Phase 3: Architecture Design
relay bmad design-architecture --models models.yaml --output architecture.yaml
relay bmad validate-architecture --file architecture.yaml

# BMAD Phase 4: Development Implementation
relay bmad generate-code --architecture architecture.yaml --target ./src
relay bmad test --coverage 90 --integration

# BMAD Phase 5: Deployment
relay bmad deploy --strategy blue-green --environment production
relay bmad validate-deployment --environment production

# BMAD Phase 6: Documentation
relay bmad generate-docs --output ./docs --include-examples
relay bmad validate-docs --completeness
```

## MCP Integration for BMAD-Actor Development

### Enhanced MCP Tools for Claude Code

```typescript
// MCP Tools for BMAD-Enhanced Development
const bmadActorTools = {
  // Phase 1: Requirements Analysis
  'analyze_business_requirements': {
    description: 'Analyze project requirements and identify actors using BMAD method',
    parameters: {
      project_description: 'string',
      target_users: 'string[]',
      core_features: 'string[]'
    },
    returns: 'BMadActorRequirements'
  },
  
  // Phase 2: Model Design
  'design_actor_models': {
    description: 'Design complete actor models with state, events, and components',
    parameters: {
      requirements: 'BMadActorRequirements',
      design_preferences: 'DesignPreferences'
    },
    returns: 'ActorModelDesign'
  },
  
  // Phase 3: Architecture Design
  'design_system_architecture': {
    description: 'Design system architecture with deployment and communication patterns',
    parameters: {
      actor_models: 'ActorModelDesign',
      deployment_target: 'vercel|kubernetes|both',
      performance_requirements: 'PerformanceRequirements'
    },
    returns: 'SystemArchitecture'
  },
  
  // Phase 4: Code Generation
  'generate_actor_implementation': {
    description: 'Generate complete actor implementation with tests and components',
    parameters: {
      architecture: 'SystemArchitecture',
      quality_standards: 'QualityStandards',
      testing_strategy: 'TestingStrategy'
    },
    returns: 'ActorImplementation'
  },
  
  // Phase 5: Deployment
  'deploy_actor_system': {
    description: 'Deploy actor system using BMAD deployment practices',
    parameters: {
      implementation: 'ActorImplementation',
      deployment_strategy: 'DeploymentStrategy',
      environment: 'staging|production'
    },
    returns: 'DeploymentResult'
  },
  
  // Phase 6: Documentation
  'generate_documentation': {
    description: 'Generate complete documentation package using BMAD standards',
    parameters: {
      system: 'DeployedSystem',
      documentation_requirements: 'DocumentationRequirements'
    },
    returns: 'DocumentationPackage'
  }
};
```

## Success Metrics for BMAD-Actor Integration

### Measuring Framework Effectiveness

```yaml
success_metrics:
  # Development Speed
  time_to_mvp: "< 2 hours"           # From idea to deployed MVP
  time_to_production: "< 1 week"     # From MVP to production-ready
  
  # Code Quality  
  test_coverage: "> 90%"             # Automated test coverage
  bug_density: "< 1 per 1000 LOC"   # Bugs per line of code
  performance: "< 200ms p95"         # Response time targets
  
  # Developer Experience
  learning_curve: "< 1 day"          # Time to productivity
  documentation_completeness: "100%" # All aspects documented
  support_ticket_volume: "< 5%"     # Developers needing help
  
  # Business Outcomes
  feature_velocity: "+200%"          # Faster feature development
  deployment_confidence: "100%"     # No fear of deployments
  system_reliability: "99.9%"       # Uptime targets
```

This BMAD-enhanced framework provides Claude Code with a systematic, repeatable process for building perfect actor-based systems every time. The integration of BMAD's proven software development practices with our actor architecture creates a powerful combination that ensures consistent, high-quality results.