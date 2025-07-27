/**
 * Component export management for actors
 */
export class ComponentExportManager {
  private exports: Map<string, ComponentExport> = new Map();
  private manifest: ComponentManifest;

  constructor() {
    this.manifest = {
      actor: '',
      version: '1.0.0',
      exports: [],
    };
  }

  register(component: ComponentExport): void {
    if (!component.name) {
      throw new Error('Component name is required');
    }

    if (!component.type || !['web', 'mobile', 'api'].includes(component.type)) {
      throw new Error('Component type must be web, mobile, or api');
    }

    if (!component.category || !this.isValidCategory(component.category)) {
      throw new Error('Invalid component category');
    }

    // Add validation for component
    if (component.props) {
      this.validateProps(component.props);
    }

    this.exports.set(component.name, component);
    this.updateManifest();
  }

  unregister(name: string): boolean {
    const result = this.exports.delete(name);
    if (result) {
      this.updateManifest();
    }
    return result;
  }

  get(name: string): ComponentExport | undefined {
    return this.exports.get(name);
  }

  getByType(type: ComponentType): ComponentExport[] {
    return Array.from(this.exports.values())
      .filter(exp => exp.type === type);
  }

  getByCategory(category: ComponentCategory): ComponentExport[] {
    return Array.from(this.exports.values())
      .filter(exp => exp.category === category);
  }

  getManifest(): ComponentManifest {
    return { ...this.manifest };
  }

  setActorInfo(actorName: string, version: string): void {
    this.manifest.actor = actorName;
    this.manifest.version = version;
    this.updateManifest();
  }

  /**
   * Generate TypeScript definitions for exported components
   */
  generateTypeDefinitions(): string {
    const lines: string[] = [];
    
    lines.push('// Auto-generated component type definitions');
    lines.push(`// Actor: ${this.manifest.actor}`);
    lines.push(`// Version: ${this.manifest.version}`);
    lines.push('');
    
    // Group by type
    const webComponents = this.getByType('web');
    const mobileComponents = this.getByType('mobile');
    const apiComponents = this.getByType('api');
    
    if (webComponents.length > 0) {
      lines.push('// Web Components');
      webComponents.forEach(comp => {
        lines.push(this.generateComponentType(comp));
      });
      lines.push('');
    }
    
    if (mobileComponents.length > 0) {
      lines.push('// Mobile Components');
      mobileComponents.forEach(comp => {
        lines.push(this.generateComponentType(comp));
      });
      lines.push('');
    }
    
    if (apiComponents.length > 0) {
      lines.push('// API Components');
      apiComponents.forEach(comp => {
        lines.push(this.generateComponentType(comp));
      });
      lines.push('');
    }
    
    return lines.join('\n');
  }

  /**
   * Validate component exports against actor specification
   */
  validateExports(): ValidationResult {
    const errors: string[] = [];
    
    // Check for required exports
    const hasWidget = Array.from(this.exports.values())
      .some(exp => exp.category === 'widget');
    
    if (this.exports.size === 0) {
      errors.push('No components exported');
    }
    
    // Validate each export
    this.exports.forEach((exp, name) => {
      if (!exp.component) {
        errors.push(`Component '${name}' has no implementation`);
      }
      
      if (exp.dependencies && exp.dependencies.length > 0) {
        exp.dependencies.forEach(dep => {
          if (!this.exports.has(dep)) {
            errors.push(`Component '${name}' depends on missing component '${dep}'`);
          }
        });
      }
    });
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create component registry for runtime
   */
  createRegistry(): ComponentRegistry {
    const registry: ComponentRegistry = {
      components: {},
      metadata: {},
    };
    
    this.exports.forEach((exp, name) => {
      registry.components[name] = exp.component;
      registry.metadata[name] = {
        type: exp.type,
        category: exp.category,
        props: exp.props,
        dependencies: exp.dependencies,
        metadata: exp.metadata,
      };
    });
    
    return registry;
  }

  private updateManifest(): void {
    this.manifest.exports = Array.from(this.exports.values());
  }

  private isValidCategory(category: string): boolean {
    const validCategories = ['widget', 'page', 'modal', 'micro', 'screen', 'service'];
    return validCategories.includes(category);
  }

  private validateProps(props: any): void {
    if (typeof props !== 'object') {
      throw new Error('Component props must be an object schema');
    }
  }

  private generateComponentType(component: ComponentExport): string {
    const lines: string[] = [];
    
    lines.push(`export interface ${component.name}Props {`);
    
    if (component.props) {
      Object.entries(component.props).forEach(([key, schema]) => {
        const type = this.schemaToTypeScript(schema);
        const optional = (schema as any).optional ? '?' : '';
        lines.push(`  ${key}${optional}: ${type};`);
      });
    }
    
    lines.push('}');
    lines.push('');
    lines.push(`export const ${component.name}: React.FC<${component.name}Props>;`);
    
    return lines.join('\n');
  }

  private schemaToTypeScript(schema: any): string {
    if (typeof schema === 'string') {
      return schema;
    }
    
    if (schema.type) {
      switch (schema.type) {
        case 'string':
          return 'string';
        case 'number':
          return 'number';
        case 'boolean':
          return 'boolean';
        case 'object':
          return 'Record<string, any>';
        case 'array':
          return 'any[]';
        default:
          return 'any';
      }
    }
    
    return 'any';
  }
}

// Type definitions
export type ComponentType = 'web' | 'mobile' | 'api';
export type ComponentCategory = 'widget' | 'page' | 'modal' | 'micro' | 'screen' | 'service';

export interface ComponentExport {
  name: string;
  type: ComponentType;
  category: ComponentCategory;
  component: any;
  props?: any;
  dependencies?: string[];
  metadata?: {
    description?: string;
    version?: string;
    author?: string;
    tags?: string[];
    preview?: string;
  };
}

export interface ComponentManifest {
  actor: string;
  version: string;
  exports: ComponentExport[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ComponentRegistry {
  components: Record<string, any>;
  metadata: Record<string, ComponentMetadata>;
}

export interface ComponentMetadata {
  type: ComponentType;
  category: ComponentCategory;
  props?: any;
  dependencies?: string[];
  metadata?: any;
}