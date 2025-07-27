import { Command, Query, Event } from './types';

/**
 * Event validation for actors
 */
export class EventValidator {
  private commandSchemas: Map<string, ValidationSchema> = new Map();
  private querySchemas: Map<string, ValidationSchema> = new Map();
  private eventSchemas: Map<string, ValidationSchema> = new Map();

  /**
   * Register command schema
   */
  registerCommandSchema(type: string, schema: ValidationSchema): void {
    this.commandSchemas.set(type, schema);
  }

  /**
   * Register query schema
   */
  registerQuerySchema(type: string, schema: ValidationSchema): void {
    this.querySchemas.set(type, schema);
  }

  /**
   * Register event schema
   */
  registerEventSchema(type: string, schema: ValidationSchema): void {
    this.eventSchemas.set(type, schema);
  }

  /**
   * Validate command
   */
  async validateCommand(command: Command): Promise<ValidationResult> {
    const errors: string[] = [];

    // Check event type format (VERB_NOUN)
    if (!this.isValidCommandFormat(command.type)) {
      errors.push(`Command type '${command.type}' does not follow VERB_NOUN format`);
    }

    // Validate against schema if exists
    const schema = this.commandSchemas.get(command.type);
    if (schema) {
      const schemaErrors = await this.validateAgainstSchema(command.payload, schema);
      errors.push(...schemaErrors);
    }

    // Basic validation
    if (!command.type) {
      errors.push('Command type is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate query
   */
  async validateQuery(query: Query): Promise<ValidationResult> {
    const errors: string[] = [];

    // Check event type format (GET_NOUN)
    if (!this.isValidQueryFormat(query.type)) {
      errors.push(`Query type '${query.type}' does not follow GET_NOUN format`);
    }

    // Validate against schema if exists
    const schema = this.querySchemas.get(query.type);
    if (schema) {
      const schemaErrors = await this.validateAgainstSchema(query.payload, schema);
      errors.push(...schemaErrors);
    }

    // Basic validation
    if (!query.type) {
      errors.push('Query type is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate event
   */
  async validateEvent(event: Event): Promise<ValidationResult> {
    const errors: string[] = [];

    // Check event type format (NOUN_VERB_PAST)
    if (!this.isValidNotificationFormat(event.type)) {
      errors.push(`Event type '${event.type}' does not follow NOUN_VERB_PAST format`);
    }

    // Validate against schema if exists
    const schema = this.eventSchemas.get(event.type);
    if (schema) {
      const schemaErrors = await this.validateAgainstSchema(event.payload, schema);
      errors.push(...schemaErrors);
    }

    // Basic validation
    if (!event.type) {
      errors.push('Event type is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create validation middleware
   */
  createValidationMiddleware(): ValidationMiddleware {
    return {
      beforeCommand: async (command: Command) => {
        const result = await this.validateCommand(command);
        if (!result.valid) {
          throw new ValidationError(`Command validation failed: ${result.errors.join(', ')}`);
        }
      },
      
      beforeQuery: async (query: Query) => {
        const result = await this.validateQuery(query);
        if (!result.valid) {
          throw new ValidationError(`Query validation failed: ${result.errors.join(', ')}`);
        }
      },
      
      beforeEvent: async (event: Event) => {
        const result = await this.validateEvent(event);
        if (!result.valid) {
          throw new ValidationError(`Event validation failed: ${result.errors.join(', ')}`);
        }
      },
    };
  }

  /**
   * Bulk register schemas from definition
   */
  registerSchemas(definition: EventDefinition): void {
    if (definition.commands) {
      Object.entries(definition.commands).forEach(([type, schema]) => {
        this.registerCommandSchema(type, schema);
      });
    }

    if (definition.queries) {
      Object.entries(definition.queries).forEach(([type, schema]) => {
        this.registerQuerySchema(type, schema);
      });
    }

    if (definition.events) {
      Object.entries(definition.events).forEach(([type, schema]) => {
        this.registerEventSchema(type, schema);
      });
    }
  }

  private isValidCommandFormat(type: string): boolean {
    // VERB_NOUN format
    const parts = type.split('_');
    if (parts.length < 2) return false;
    
    const verb = parts[0];
    const validVerbs = [
      'CREATE', 'UPDATE', 'DELETE', 'GET', 'SET', 'ADD', 'REMOVE',
      'SEND', 'VERIFY', 'PROCESS', 'EXECUTE', 'ASSIGN', 'REVOKE',
      'LOCK', 'UNLOCK', 'START', 'STOP', 'ENABLE', 'DISABLE'
    ];
    
    return validVerbs.includes(verb);
  }

  private isValidQueryFormat(type: string): boolean {
    // GET_NOUN format
    return type.startsWith('GET_') && type.split('_').length >= 2;
  }

  private isValidNotificationFormat(type: string): boolean {
    // NOUN_VERB_PAST format
    const parts = type.split('_');
    if (parts.length < 2) return false;
    
    const lastPart = parts[parts.length - 1];
    const pastTenseEndings = ['ED', 'SENT', 'DONE', 'CREATED', 'UPDATED', 'DELETED', 'COMPLETED'];
    
    return pastTenseEndings.some(ending => lastPart.endsWith(ending));
  }

  private async validateAgainstSchema(
    payload: any,
    schema: ValidationSchema
  ): Promise<string[]> {
    const errors: string[] = [];

    // Required fields
    if (schema.required) {
      schema.required.forEach(field => {
        if (!payload || !(field in payload)) {
          errors.push(`Required field '${field}' is missing`);
        }
      });
    }

    // Field types
    if (schema.properties && payload) {
      Object.entries(schema.properties).forEach(([field, fieldSchema]) => {
        if (field in payload) {
          const value = payload[field];
          const typeErrors = this.validateFieldType(field, value, fieldSchema);
          errors.push(...typeErrors);
        }
      });
    }

    // Custom validator
    if (schema.validate) {
      try {
        const customErrors = await schema.validate(payload);
        if (customErrors && customErrors.length > 0) {
          errors.push(...customErrors);
        }
      } catch (error) {
        errors.push(`Custom validation error: ${(error as Error).message}`);
      }
    }

    return errors;
  }

  private validateFieldType(
    field: string,
    value: any,
    schema: FieldSchema
  ): string[] {
    const errors: string[] = [];

    // Type validation
    if (schema.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== schema.type) {
        errors.push(`Field '${field}' must be of type ${schema.type}, got ${actualType}`);
      }
    }

    // String validations
    if (schema.type === 'string' && typeof value === 'string') {
      if (schema.minLength && value.length < schema.minLength) {
        errors.push(`Field '${field}' must be at least ${schema.minLength} characters`);
      }
      if (schema.maxLength && value.length > schema.maxLength) {
        errors.push(`Field '${field}' must be at most ${schema.maxLength} characters`);
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        errors.push(`Field '${field}' does not match pattern ${schema.pattern}`);
      }
      if (schema.enum && !schema.enum.includes(value)) {
        errors.push(`Field '${field}' must be one of: ${schema.enum.join(', ')}`);
      }
    }

    // Number validations
    if (schema.type === 'number' && typeof value === 'number') {
      if (schema.min !== undefined && value < schema.min) {
        errors.push(`Field '${field}' must be at least ${schema.min}`);
      }
      if (schema.max !== undefined && value > schema.max) {
        errors.push(`Field '${field}' must be at most ${schema.max}`);
      }
    }

    // Array validations
    if (schema.type === 'array' && Array.isArray(value)) {
      if (schema.minItems && value.length < schema.minItems) {
        errors.push(`Field '${field}' must have at least ${schema.minItems} items`);
      }
      if (schema.maxItems && value.length > schema.maxItems) {
        errors.push(`Field '${field}' must have at most ${schema.maxItems} items`);
      }
    }

    return errors;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Type definitions
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ValidationSchema {
  required?: string[];
  properties?: Record<string, FieldSchema>;
  validate?: (payload: any) => Promise<string[]> | string[];
}

export interface FieldSchema {
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: string[];
  min?: number;
  max?: number;
  minItems?: number;
  maxItems?: number;
}

export interface EventDefinition {
  commands?: Record<string, ValidationSchema>;
  queries?: Record<string, ValidationSchema>;
  events?: Record<string, ValidationSchema>;
}

export interface ValidationMiddleware {
  beforeCommand: (command: Command) => Promise<void>;
  beforeQuery: (query: Query) => Promise<void>;
  beforeEvent: (event: Event) => Promise<void>;
}