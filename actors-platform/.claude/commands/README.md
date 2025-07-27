# BMAD-Actor Development Prompts

This directory contains prompt templates for Claude Code to follow the BMAD-Enhanced Actor Development Framework.

## Prompt Structure

### Master Prompt
- **File**: `master-prompt.md`
- **Purpose**: Sets the overall context and methodology for Claude Code
- **Use**: Include this as the system prompt when starting a new conversation

### Phase-Specific Prompts
Each phase has its own prompt template that guides Claude Code through that specific stage:

1. **Phase 1**: `phase1-business-requirements.md` - Business analysis and actor identification
2. **Phase 2**: `phase2-model-design.md` - Actor state and event design
3. **Phase 3**: `phase3-architecture-design.md` - System architecture planning
4. **Phase 4**: `phase4-development-implementation.md` - Code generation
5. **Phase 5**: `phase5-deployment.md` - Production deployment
6. **Phase 6**: `phase6-documentation.md` - Documentation creation

### MCP Tool Prompts
- **File**: `mcp-tool-business-requirements.md`
- **Purpose**: Defines the interface for MCP tools that support the framework

## Usage Instructions

### For a New Project
1. Start with the master prompt to set context
2. Use Phase 1 prompt to begin requirements analysis
3. Progress through each phase sequentially
4. Each phase validates before moving to the next

### For Specific Tasks
- Jump to the relevant phase prompt
- Reference the master prompt for quality standards
- Use MCP tool prompts for automated workflows

## Quality Gates
Each phase has built-in validation checkpoints:
- Phase 1: Actor responsibility tests
- Phase 2: Event naming and dependency validation
- Phase 3: Architecture patterns and performance targets
- Phase 4: 90%+ test coverage requirement
- Phase 5: Deployment checklist
- Phase 6: Documentation completeness

## Best Practices
1. Always complete one phase before moving to the next
2. Validate outputs at each phase transition
3. Maintain the quality standards defined in the master prompt
4. Use the exact prompt templates for consistency
5. Document any deviations from the standard process