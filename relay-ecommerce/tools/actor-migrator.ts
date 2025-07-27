#!/usr/bin/env node

import * as ts from 'typescript';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { z } from 'zod';

interface ActorDefinition {
  actor: {
    name: string;
    description: string;
    version: string;
    state?: Record<string, any>;
    handles?: Record<string, any>;
    queries?: Record<string, any>;
    subscribes?: Record<string, any>;
    dependencies?: Record<string, any>;
  };
}

export class ActorMigrator {
  private sourceFiles: Map<string, ts.SourceFile> = new Map();
  private actorDef: ActorDefinition = {
    actor: {
      name: '',
      description: '',
      version: '1.0.0'
    }
  };

  async analyzeActor(actorPath: string): Promise<ActorDefinition> {
    console.log(`Analyzing actor at: ${actorPath}`);
    
    // Get actor name from directory
    this.actorDef.actor.name = path.basename(actorPath);
    
    // Read all TypeScript files
    await this.loadSourceFiles(actorPath);
    
    // Extract components
    await this.extractState();
    await this.extractHandlers();
    await this.extractQueries();
    await this.extractSubscriptions();
    await this.extractDependencies();
    
    return this.actorDef;
  }

  private async loadSourceFiles(actorPath: string) {
    const srcPath = path.join(actorPath, 'src');
    const files = await this.getTypeScriptFiles(srcPath);
    
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const sourceFile = ts.createSourceFile(
        file,
        content,
        ts.ScriptTarget.Latest,
        true
      );
      this.sourceFiles.set(file, sourceFile);
    }
  }

  private async getTypeScriptFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.getTypeScriptFiles(fullPath));
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  private async extractState() {
    console.log('Extracting state schema...');
    const state: Record<string, any> = {};
    
    // Look for state definitions
    for (const [filePath, sourceFile] of this.sourceFiles) {
      if (filePath.includes('/state/')) {
        ts.forEachChild(sourceFile, (node) => {
          if (ts.isClassDeclaration(node) && node.name) {
            const className = node.name.text;
            
            // Extract properties
            const properties: Record<string, any> = {};
            node.members.forEach((member) => {
              if (ts.isPropertyDeclaration(member) && member.name) {
                const propName = member.name.getText();
                const propType = this.getTypeString(member.type);
                
                if (propName.startsWith('private ')) {
                  const cleanName = propName.replace('private ', '');
                  if (cleanName.includes('Map<')) {
                    // This is likely a state collection
                    const stateKey = cleanName.split(':')[0].trim();
                    state[stateKey] = {
                      type: propType,
                      schema: this.extractSchemaFromType(propType)
                    };
                  }
                }
              }
            });
          }
          
          // Look for interfaces that might be state schemas
          if (ts.isInterfaceDeclaration(node) && node.name) {
            const interfaceName = node.name.text;
            const schema = this.extractInterfaceSchema(node);
            
            // Store for later use in state definitions
            if (Object.keys(schema).length > 0) {
              this.updateStateSchemas(state, interfaceName, schema);
            }
          }
        });
      }
    }
    
    if (Object.keys(state).length > 0) {
      this.actorDef.actor.state = state;
    }
  }

  private async extractHandlers() {
    console.log('Extracting command handlers...');
    const handles: Record<string, any> = {};
    
    // Look for command handlers
    for (const [filePath, sourceFile] of this.sourceFiles) {
      if (filePath.includes('/handlers/commands/')) {
        const fileName = path.basename(filePath, '.ts');
        const eventName = this.fileNameToEventName(fileName);
        
        // Extract handler details
        ts.forEachChild(sourceFile, (node) => {
          if (ts.isFunctionDeclaration(node) && node.name?.text.includes('handle')) {
            handles[eventName] = {
              description: this.extractJsDoc(node),
              payload: this.extractPayloadSchema(node),
              validates: this.extractValidations(node),
              emits: this.extractEmittedEvents(node)
            };
          }
        });
      }
    }
    
    if (Object.keys(handles).length > 0) {
      this.actorDef.actor.handles = handles;
    }
  }

  private async extractQueries() {
    console.log('Extracting query handlers...');
    const queries: Record<string, any> = {};
    
    // Look for query handlers
    for (const [filePath, sourceFile] of this.sourceFiles) {
      if (filePath.includes('/handlers/queries/')) {
        const fileName = path.basename(filePath, '.ts');
        const queryName = this.fileNameToEventName(fileName);
        
        ts.forEachChild(sourceFile, (node) => {
          if (ts.isFunctionDeclaration(node) && node.name?.text.includes('handle')) {
            queries[queryName] = {
              description: this.extractJsDoc(node),
              payload: this.extractPayloadSchema(node),
              returns: this.extractReturnType(node)
            };
          }
        });
      }
    }
    
    if (Object.keys(queries).length > 0) {
      this.actorDef.actor.queries = queries;
    }
  }

  private async extractSubscriptions() {
    console.log('Extracting event subscriptions...');
    const subscribes: Record<string, any> = {};
    
    // Look for subscription handlers
    for (const [filePath, sourceFile] of this.sourceFiles) {
      ts.forEachChild(sourceFile, (node) => {
        // Look for event subscription patterns
        if (ts.isCallExpression(node)) {
          const expression = node.expression.getText();
          if (expression.includes('subscribe') || expression.includes('on')) {
            const eventName = this.extractEventNameFromSubscription(node);
            if (eventName) {
              subscribes[eventName] = {
                handler: 'handle' + this.toCamelCase(eventName),
                description: 'Handle ' + eventName.toLowerCase().replace(/_/g, ' ')
              };
            }
          }
        }
      });
    }
    
    if (Object.keys(subscribes).length > 0) {
      this.actorDef.actor.subscribes = subscribes;
    }
  }

  private async extractDependencies() {
    console.log('Extracting actor dependencies...');
    const dependencies: Record<string, any> = {};
    
    // Look for dependency injections and external calls
    for (const [filePath, sourceFile] of this.sourceFiles) {
      ts.forEachChild(sourceFile, (node) => {
        if (ts.isPropertyAccessExpression(node)) {
          const expression = node.expression.getText();
          
          // Common dependency patterns
          if (expression.includes('deps.') || expression.includes('this.')) {
            const depName = node.name.text;
            
            // Map common dependencies to actors
            const actorMap: Record<string, string> = {
              'userService': 'user',
              'billingService': 'billing',
              'notificationService': 'notification',
              'analyticsService': 'analytics',
              'inventoryService': 'inventory',
              'paymentService': 'payment'
            };
            
            for (const [service, actor] of Object.entries(actorMap)) {
              if (expression.includes(service)) {
                if (!dependencies[actor]) {
                  dependencies[actor] = {
                    events: [],
                    pattern: 'ask',
                    purpose: `Integration with ${actor} actor`
                  };
                }
              }
            }
          }
        }
      });
    }
    
    if (Object.keys(dependencies).length > 0) {
      this.actorDef.actor.dependencies = dependencies;
    }
  }

  // Helper methods
  private getTypeString(typeNode?: ts.TypeNode): string {
    if (!typeNode) return 'any';
    return typeNode.getText();
  }

  private extractSchemaFromType(typeStr: string): any {
    // Extract generic type from Map<string, Type>
    const match = typeStr.match(/Map<string,\s*(.+)>/);
    if (match) {
      const innerType = match[1].trim();
      return { [innerType]: this.generateSchemaFields(innerType) };
    }
    return {};
  }

  private generateSchemaFields(typeName: string): Record<string, string> {
    // Common schema patterns
    const schemas: Record<string, Record<string, string>> = {
      'Customer': {
        id: 'string',
        email: 'string',
        createdAt: 'timestamp',
        updatedAt: 'timestamp'
      },
      'Subscription': {
        id: 'string',
        customerId: 'string',
        status: 'string',
        createdAt: 'timestamp'
      },
      'User': {
        id: 'string',
        email: 'string',
        profile: 'object',
        createdAt: 'timestamp'
      }
    };
    
    return schemas[typeName] || { id: 'string' };
  }

  private extractInterfaceSchema(node: ts.InterfaceDeclaration): Record<string, string> {
    const schema: Record<string, string> = {};
    
    node.members.forEach((member) => {
      if (ts.isPropertySignature(member) && member.name) {
        const propName = member.name.getText();
        const propType = this.simplifyType(member.type?.getText() || 'any');
        schema[propName] = propType;
      }
    });
    
    return schema;
  }

  private simplifyType(typeStr: string): string {
    // Simplify TypeScript types to YAML-friendly types
    if (typeStr.includes('string')) return 'string';
    if (typeStr.includes('number')) return 'number';
    if (typeStr.includes('boolean')) return 'boolean';
    if (typeStr.includes('Date')) return 'timestamp';
    if (typeStr.includes('[]') || typeStr.includes('Array')) return 'array';
    if (typeStr.includes('{')) return 'object';
    return typeStr;
  }

  private updateStateSchemas(state: Record<string, any>, typeName: string, schema: Record<string, string>) {
    // Update existing state definitions with schema
    for (const [key, value] of Object.entries(state)) {
      if (value.type?.includes(typeName)) {
        if (!value.schema) {
          value.schema = {};
        }
        value.schema[typeName] = schema;
      }
    }
  }

  private fileNameToEventName(fileName: string): string {
    // Convert camelCase to UPPER_SNAKE_CASE
    return fileName
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toUpperCase();
  }

  private toCamelCase(str: string): string {
    return str
      .toLowerCase()
      .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
      .replace(/^[a-z]/, (letter) => letter.toUpperCase());
  }

  private extractJsDoc(node: ts.Node): string {
    const jsDocComments = ts.getJSDocCommentsAndTags(node);
    if (jsDocComments.length > 0) {
      return jsDocComments[0].comment?.toString() || '';
    }
    return '';
  }

  private extractPayloadSchema(node: ts.FunctionDeclaration): Record<string, string> {
    const schema: Record<string, string> = {};
    
    // Look for payload parameter
    if (node.parameters.length > 0) {
      const eventParam = node.parameters[0];
      
      // Try to find the payload type
      ts.forEachChild(node.body || node, (child) => {
        if (ts.isVariableStatement(child)) {
          const text = child.getText();
          if (text.includes('payload')) {
            // Extract fields from destructuring
            const match = text.match(/const\s*{\s*([^}]+)\s*}\s*=.*payload/);
            if (match) {
              const fields = match[1].split(',').map(f => f.trim());
              fields.forEach(field => {
                schema[field] = 'string'; // Default type
              });
            }
          }
        }
      });
    }
    
    return schema;
  }

  private extractValidations(node: ts.FunctionDeclaration): string[] {
    const validations: string[] = [];
    
    // Look for validation patterns
    ts.forEachChild(node.body || node, (child) => {
      if (ts.isIfStatement(child)) {
        const condition = child.expression.getText();
        
        // Common validation patterns
        if (condition.includes('>') || condition.includes('<') || condition.includes('===')) {
          validations.push(condition.replace(/['"]/g, ''));
        }
      }
    });
    
    return validations;
  }

  private extractEmittedEvents(node: ts.FunctionDeclaration): string | undefined {
    let emittedEvent: string | undefined;
    
    // Look for event publishing
    ts.forEachChild(node.body || node, (child) => {
      if (ts.isCallExpression(child)) {
        const text = child.getText();
        if (text.includes('publish') || text.includes('emit')) {
          // Extract event name
          const match = text.match(/['"]([A-Z_]+)['"]/);
          if (match) {
            emittedEvent = match[1];
          }
        }
      }
    });
    
    return emittedEvent;
  }

  private extractReturnType(node: ts.FunctionDeclaration): any {
    if (node.type) {
      const typeText = node.type.getText();
      
      // Parse common return patterns
      if (typeText.includes('Promise<{')) {
        const match = typeText.match(/Promise<{([^}]+)}>/);
        if (match) {
          const fields = match[1].split(',').map(f => {
            const [key, type] = f.split(':').map(s => s.trim());
            return { [key]: this.simplifyType(type) };
          });
          return Object.assign({}, ...fields);
        }
      }
    }
    
    return 'any';
  }

  private extractEventNameFromSubscription(node: ts.CallExpression): string | undefined {
    const args = node.arguments;
    if (args.length > 0) {
      const firstArg = args[0];
      if (ts.isStringLiteral(firstArg)) {
        return firstArg.text;
      }
    }
    return undefined;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: actor-migrator <actor-path> [--output <file>]');
    process.exit(1);
  }
  
  const actorPath = args[0];
  const outputIndex = args.indexOf('--output');
  const outputFile = outputIndex !== -1 ? args[outputIndex + 1] : null;
  
  const migrator = new ActorMigrator();
  
  try {
    const actorDef = await migrator.analyzeActor(actorPath);
    const yamlContent = yaml.dump(actorDef, {
      indent: 2,
      lineWidth: 80,
      noRefs: true
    });
    
    if (outputFile) {
      await fs.writeFile(outputFile, yamlContent);
      console.log(`Actor definition written to: ${outputFile}`);
    } else {
      console.log('\n=== Generated actor.yaml ===\n');
      console.log(yamlContent);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}