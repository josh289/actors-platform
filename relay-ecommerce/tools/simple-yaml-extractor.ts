#!/usr/bin/env node

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

interface ExtractedActor {
  actor: {
    name: string;
    description: string;
    version: string;
    state?: any;
    handles?: any;
    queries?: any;
    subscribes?: any;
    dependencies?: any;
  };
}

/**
 * Simple tool to help extract YAML structure from existing TypeScript actors
 * This generates a template that you can manually refine
 */
export class SimpleYamlExtractor {
  async extract(actorPath: string): Promise<ExtractedActor> {
    const actorName = path.basename(actorPath);
    console.log(`\nExtracting YAML template for: ${actorName}\n`);

    const actor: ExtractedActor = {
      actor: {
        name: actorName,
        description: `TODO: Add description for ${actorName}`,
        version: '1.0.0'
      }
    };

    // Look for common patterns in the codebase
    await this.findStatePatterns(actorPath, actor);
    await this.findHandlerPatterns(actorPath, actor);
    await this.findDependencyPatterns(actorPath, actor);

    return actor;
  }

  private async findStatePatterns(actorPath: string, actor: ExtractedActor) {
    console.log('Looking for state patterns...');
    
    // Common state patterns to look for
    const statePatterns = [
      /private\s+(\w+)\s*:\s*Map<string,\s*(\w+)>/g,
      /this\.(\w+)\s*=\s*new Map/g,
      /interface\s+(\w+)\s*{([^}]+)}/g
    ];

    const srcPath = path.join(actorPath, 'src');
    try {
      const files = await this.getFiles(srcPath, '.ts');
      const state: any = {};

      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        
        // Look for Map declarations
        const mapMatches = content.matchAll(statePatterns[0]);
        for (const match of mapMatches) {
          const [_, stateName, typeName] = match;
          console.log(`  Found state: ${stateName} (Map<string, ${typeName}>)`);
          
          state[stateName] = {
            type: `Map<string, ${typeName}>`,
            schema: {
              [typeName]: this.guessSchemaFields(typeName, content)
            }
          };
        }

        // Look for interfaces
        const interfaceMatches = content.matchAll(statePatterns[2]);
        for (const match of interfaceMatches) {
          const [_, interfaceName, interfaceBody] = match;
          const fields = this.parseInterfaceFields(interfaceBody);
          
          // Update any state that uses this interface
          for (const key in state) {
            if (state[key].type.includes(interfaceName)) {
              state[key].schema[interfaceName] = fields;
            }
          }
        }
      }

      if (Object.keys(state).length > 0) {
        actor.actor.state = state;
      }
    } catch (error) {
      console.log('  No src directory found or error reading files');
    }
  }

  private async findHandlerPatterns(actorPath: string, actor: ExtractedActor) {
    console.log('Looking for event handlers...');
    
    const handles: any = {};
    const queries: any = {};
    const subscribes: any = {};

    try {
      // Look in handlers directory
      const handlersPath = path.join(actorPath, 'src', 'handlers');
      
      // Commands
      const commandsPath = path.join(handlersPath, 'commands');
      try {
        const commandFiles = await fs.readdir(commandsPath);
        for (const file of commandFiles) {
          if (file.endsWith('.ts')) {
            const eventName = this.fileToEventName(file.replace('.ts', ''));
            console.log(`  Found command handler: ${eventName}`);
            
            handles[eventName] = {
              description: `TODO: Describe ${eventName}`,
              payload: {
                '/* TODO */': 'string'
              },
              emits: `TODO_${eventName}_RESULT`
            };
          }
        }
      } catch {}

      // Queries
      const queriesPath = path.join(handlersPath, 'queries');
      try {
        const queryFiles = await fs.readdir(queriesPath);
        for (const file of queryFiles) {
          if (file.endsWith('.ts')) {
            const queryName = this.fileToEventName(file.replace('.ts', ''));
            console.log(`  Found query handler: ${queryName}`);
            
            queries[queryName] = {
              description: `TODO: Describe ${queryName}`,
              payload: {
                '/* TODO */': 'string'
              },
              returns: '/* TODO */'
            };
          }
        }
      } catch {}

      // Look for subscription patterns
      const files = await this.getFiles(path.join(actorPath, 'src'), '.ts');
      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        
        // Find subscribe patterns
        const subscribeMatches = content.matchAll(/\.subscribe\(['"]([A-Z_]+)['"]/g);
        for (const match of subscribeMatches) {
          const eventName = match[1];
          console.log(`  Found subscription: ${eventName}`);
          
          subscribes[eventName] = {
            handler: `handle${this.toPascalCase(eventName)}`,
            description: `TODO: Describe handling of ${eventName}`
          };
        }
      }
    } catch (error) {
      console.log('  No handlers directory found');
    }

    if (Object.keys(handles).length > 0) actor.actor.handles = handles;
    if (Object.keys(queries).length > 0) actor.actor.queries = queries;
    if (Object.keys(subscribes).length > 0) actor.actor.subscribes = subscribes;
  }

  private async findDependencyPatterns(actorPath: string, actor: ExtractedActor) {
    console.log('Looking for dependencies...');
    
    const dependencies: any = {};
    const depPatterns = [
      /this\.(\w+Service)/g,
      /deps\.(\w+)/g,
      /import.*from.*['"]\@(\w+)['"]/g
    ];

    try {
      const files = await this.getFiles(path.join(actorPath, 'src'), '.ts');
      const foundDeps = new Set<string>();

      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        
        for (const pattern of depPatterns) {
          const matches = content.matchAll(pattern);
          for (const match of matches) {
            const dep = match[1];
            foundDeps.add(dep);
          }
        }
      }

      // Map common service names to actors
      const serviceToActor: Record<string, string> = {
        'userService': 'user',
        'authService': 'user',
        'billingService': 'billing',
        'paymentService': 'payment',
        'notificationService': 'notification',
        'emailService': 'notification',
        'analyticsService': 'analytics',
        'inventoryService': 'inventory',
        'orderService': 'order'
      };

      for (const dep of foundDeps) {
        const actorName = serviceToActor[dep];
        if (actorName) {
          console.log(`  Found dependency: ${dep} -> ${actorName} actor`);
          
          dependencies[actorName] = {
            events: ['/* TODO: List specific events */'],
            pattern: 'ask',
            purpose: `TODO: Describe why ${actorName} is needed`
          };
        }
      }
    } catch {}

    if (Object.keys(dependencies).length > 0) {
      actor.actor.dependencies = dependencies;
    }
  }

  private guessSchemaFields(typeName: string, content: string): any {
    // Try to find the interface/type definition
    const interfaceRegex = new RegExp(`interface\\s+${typeName}\\s*{([^}]+)}`, 's');
    const match = content.match(interfaceRegex);
    
    if (match) {
      return this.parseInterfaceFields(match[1]);
    }

    // Common schemas as fallback
    const commonSchemas: Record<string, any> = {
      'User': {
        id: 'string',
        email: 'string',
        createdAt: 'timestamp'
      },
      'Customer': {
        id: 'string',
        email: 'string',
        stripeCustomerId: 'string',
        createdAt: 'timestamp'
      },
      'Subscription': {
        id: 'string',
        customerId: 'string',
        status: 'string',
        createdAt: 'timestamp'
      },
      'Order': {
        id: 'string',
        userId: 'string',
        items: 'array',
        total: 'number',
        status: 'string',
        createdAt: 'timestamp'
      }
    };

    return commonSchemas[typeName] || {
      id: 'string',
      '/* TODO: Add fields */': 'any'
    };
  }

  private parseInterfaceFields(interfaceBody: string): any {
    const fields: any = {};
    const lines = interfaceBody.split('\n').map(l => l.trim()).filter(l => l);
    
    for (const line of lines) {
      const fieldMatch = line.match(/(\w+)\s*\??\s*:\s*([^;]+)/);
      if (fieldMatch) {
        const [_, fieldName, fieldType] = fieldMatch;
        fields[fieldName] = this.simplifyType(fieldType.trim());
      }
    }
    
    return fields;
  }

  private simplifyType(type: string): string {
    if (type.includes('string')) return 'string';
    if (type.includes('number')) return 'number';
    if (type.includes('boolean')) return 'boolean';
    if (type.includes('Date')) return 'timestamp';
    if (type.includes('[]')) return 'array';
    if (type.includes('{')) return 'object';
    return type;
  }

  private fileToEventName(fileName: string): string {
    // Convert camelCase to UPPER_SNAKE_CASE
    return fileName
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toUpperCase();
  }

  private toPascalCase(str: string): string {
    return str
      .toLowerCase()
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  private async getFiles(dir: string, ext: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...await this.getFiles(fullPath, ext));
        } else if (entry.name.endsWith(ext) && !entry.name.includes('.test.')) {
          files.push(fullPath);
        }
      }
    } catch {}
    
    return files;
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log(`
Simple YAML Extractor - Generates actor.yaml template from TypeScript

Usage: simple-yaml-extractor <actor-path> [--output <file>]

Example:
  simple-yaml-extractor ./actors/billing --output billing.yaml
  simple-yaml-extractor ./actors/billing > billing.yaml

This tool generates a template with TODO markers that you'll need to fill in.
`);
    process.exit(1);
  }

  const actorPath = args[0];
  const outputIndex = args.indexOf('--output');
  const outputFile = outputIndex !== -1 ? args[outputIndex + 1] : null;

  const extractor = new SimpleYamlExtractor();
  
  try {
    const result = await extractor.extract(actorPath);
    const yamlContent = yaml.dump(result, {
      indent: 2,
      lineWidth: 80,
      noRefs: true
    });

    console.log('\n' + '='.repeat(60));
    console.log('IMPORTANT: This is a TEMPLATE with TODO markers!');
    console.log('You must manually review and update:');
    console.log('  - Event payloads and return types');
    console.log('  - Event descriptions');
    console.log('  - Which events are emitted');
    console.log('  - Validation rules');
    console.log('  - Actual dependencies and their events');
    console.log('='.repeat(60) + '\n');

    if (outputFile) {
      await fs.writeFile(outputFile, yamlContent);
      console.log(`Template written to: ${outputFile}`);
    } else {
      console.log(yamlContent);
    }
  } catch (error) {
    console.error('Extraction failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}