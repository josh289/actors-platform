import { PostgresEventCatalog, EventDefinition } from './event-catalog';
import { ActorRegistry } from './actor-registry';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface ActorDefinition {
  name: string;
  handles?: string[];
  emits?: string[];
  subscribes?: string[];
}

export class EventSyncService {
  private syncInterval: NodeJS.Timer | null = null;

  constructor(
    private catalog: PostgresEventCatalog,
    private actors: ActorRegistry,
    private config: {
      enabled: boolean;
      interval: number;
      strictMode: boolean;
    }
  ) {}

  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('Event sync disabled');
      return;
    }

    // Initial sync
    await this.syncActorEvents();

    // Set up periodic sync
    this.syncInterval = setInterval(async () => {
      try {
        await this.syncActorEvents();
      } catch (error) {
        console.error('Event sync failed:', error);
      }
    }, this.config.interval * 1000);

    console.log(`Event sync started (interval: ${this.config.interval}s)`);
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('Event sync stopped');
    }
  }

  async syncActorEvents(): Promise<void> {
    console.log('Starting event sync...');
    
    const actors = await this.actors.getAll();
    const validationErrors: string[] = [];

    for (const actor of actors) {
      try {
        const actorEvents = await this.getActorHandledEvents(actor);
        
        for (const eventName of actorEvents) {
          const catalogEvent = await this.catalog.getEvent(eventName);
          
          if (!catalogEvent) {
            const error = `Event ${eventName} handled by ${actor.name} not found in catalog`;
            
            if (this.config.strictMode) {
              throw new Error(error);
            } else {
              validationErrors.push(error);
            }
          }
        }

        // Validate emitted events match catalog
        const emittedEvents = await this.getActorEmittedEvents(actor);
        
        for (const eventName of emittedEvents) {
          const catalogEvent = await this.catalog.getEvent(eventName);
          
          if (!catalogEvent) {
            const error = `Event ${eventName} emitted by ${actor.name} not found in catalog`;
            
            if (this.config.strictMode) {
              throw new Error(error);
            } else {
              validationErrors.push(error);
            }
          } else if (catalogEvent.producer_actor !== actor.name) {
            const error = `Event ${eventName} producer mismatch: catalog says ${catalogEvent.producer_actor}, actor ${actor.name} emits it`;
            
            if (this.config.strictMode) {
              throw new Error(error);
            } else {
              validationErrors.push(error);
            }
          }
        }
      } catch (error) {
        console.error(`Error syncing actor ${actor.name}:`, error);
        if (this.config.strictMode) {
          throw error;
        }
      }
    }

    if (validationErrors.length > 0) {
      console.warn('Event sync validation errors:', validationErrors);
    } else {
      console.log('Event sync completed successfully');
    }
  }

  async validateEventFlow(flowName: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    const flow = await this.catalog.getFlow(flowName);
    
    if (!flow) {
      return {
        valid: false,
        errors: [`Flow ${flowName} not found`]
      };
    }

    for (const step of flow.steps) {
      const event = await this.catalog.getEvent(step.event_name);
      
      if (!event) {
        errors.push(`Event ${step.event_name} in flow not found in catalog`);
        continue;
      }

      const producer = await this.actors.get(event.producer_actor);
      
      if (!producer) {
        errors.push(`Producer actor ${event.producer_actor} for event ${step.event_name} not found`);
        continue;
      }

      const consumers = await this.catalog.getConsumers(event.event_name);
      
      for (const consumer of consumers) {
        const consumerActor = await this.actors.get(consumer.consumer_actor);
        
        if (!consumerActor) {
          errors.push(`Consumer actor ${consumer.consumer_actor} for event ${event.event_name} not found`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private async getActorHandledEvents(actor: ActorDefinition): Promise<string[]> {
    // In real implementation, this would read from actor.yaml or runtime registration
    return actor.handles || [];
  }

  private async getActorEmittedEvents(actor: ActorDefinition): Promise<string[]> {
    // In real implementation, this would read from actor.yaml or runtime registration
    return actor.emits || [];
  }

  async loadActorFromYaml(actorPath: string): Promise<ActorDefinition> {
    const yamlPath = path.join(actorPath, 'actor.yaml');
    const content = await fs.readFile(yamlPath, 'utf-8');
    const config = yaml.load(content) as any;
    
    const handles: string[] = [];
    const emits: string[] = [];
    const subscribes: string[] = [];

    // Extract handled events
    if (config.actor?.handles) {
      handles.push(...Object.keys(config.actor.handles));
    }

    // Extract emitted events
    if (config.actor?.handles) {
      for (const handler of Object.values(config.actor.handles)) {
        if ((handler as any).emits) {
          emits.push((handler as any).emits);
        }
      }
    }

    // Extract subscribed events
    if (config.actor?.subscribes) {
      subscribes.push(...Object.keys(config.actor.subscribes));
    }

    return {
      name: config.actor.name,
      handles,
      emits,
      subscribes
    };
  }

  async syncFromFilesystem(actorsDir: string): Promise<void> {
    const actorDirs = await fs.readdir(actorsDir);
    
    for (const actorDir of actorDirs) {
      const actorPath = path.join(actorsDir, actorDir);
      const stat = await fs.stat(actorPath);
      
      if (stat.isDirectory()) {
        try {
          const actor = await this.loadActorFromYaml(actorPath);
          await this.actors.register(actor);
          console.log(`Loaded actor ${actor.name} from filesystem`);
        } catch (error) {
          console.error(`Failed to load actor from ${actorPath}:`, error);
        }
      }
    }
  }

  async generateReport(): Promise<{
    totalEvents: number;
    totalActors: number;
    orphanedEvents: string[];
    missingHandlers: string[];
    stats: {
      eventsPerActor: Record<string, number>;
      consumersPerEvent: Record<string, number>;
    };
  }> {
    const allEvents = await this.catalog.getAllEvents();
    const allActors = await this.actors.getAll();
    
    const orphanedEvents: string[] = [];
    const missingHandlers: string[] = [];
    const eventsPerActor: Record<string, number> = {};
    const consumersPerEvent: Record<string, number> = {};

    // Find orphaned events (no consumers)
    for (const event of allEvents) {
      const consumers = await this.catalog.getConsumers(event.event_name);
      consumersPerEvent[event.event_name] = consumers.length;
      
      if (consumers.length === 0 && !event.event_name.endsWith('_TRACKED')) {
        orphanedEvents.push(event.event_name);
      }
    }

    // Count events per actor
    for (const actor of allActors) {
      const actorEvents = await this.catalog.getActorEvents(actor.name);
      eventsPerActor[actor.name] = actorEvents.length;
    }

    // Find missing handlers
    for (const event of allEvents) {
      const consumers = await this.catalog.getConsumers(event.event_name);
      
      for (const consumer of consumers) {
        const actor = await this.actors.get(consumer.consumer_actor);
        
        if (actor) {
          const handles = await this.getActorHandledEvents(actor);
          
          if (!handles.includes(event.event_name)) {
            missingHandlers.push(`${consumer.consumer_actor} should handle ${event.event_name}`);
          }
        }
      }
    }

    return {
      totalEvents: allEvents.length,
      totalActors: allActors.length,
      orphanedEvents,
      missingHandlers,
      stats: {
        eventsPerActor,
        consumersPerEvent
      }
    };
  }
}