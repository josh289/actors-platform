/**
 * AI-Friendly Error with structured context for debugging
 */
export class ActorError extends Error {
  constructor(
    message: string,
    public code: string,
    public context: {
      actor?: string;
      command?: string;
      query?: string;
      state?: string;
      fix?: string;
      relatedFiles?: string[];
      helpfulCommands?: string[];
      documentation?: string;
      exampleCode?: string;
      [key: string]: any; // Allow additional properties
    } = {},
    public statusCode: number = 500,
    public userMessage?: string
  ) {
    super(message);
    this.name = 'ActorError';
  }

  /**
   * Format error for AI agents with all context
   */
  toAIFormat(): string {
    return `
## Error: ${this.code}

**Message**: ${this.message}
**User Message**: ${this.userMessage || 'An error occurred'}

### Context
- **Actor**: ${this.context.actor || 'Unknown'}
- **Operation**: ${this.context.command || this.context.query || 'Unknown'}
- **State**: ${this.context.state || 'Unknown'}

### How to Fix
${this.context.fix || 'No fix available'}

### Related Files
${this.context.relatedFiles?.map(f => `- ${f}`).join('\n') || 'None'}

### Helpful Commands
${this.context.helpfulCommands?.map(c => `- \`${c}\``).join('\n') || 'None'}

### Documentation
${this.context.documentation || 'No documentation available'}

### Example Code
\`\`\`typescript
${this.context.exampleCode || '// No example available'}
\`\`\`
    `.trim();
  }
}

/**
 * State validation result with detailed errors
 */
export interface StateValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: Array<{
    path: string;
    message: string;
    expected: string;
    received: string;
    fix?: string;
  }>;
}