import { ActorDefinition } from './event-sync';

export interface RegisteredActor extends ActorDefinition {
  version: string;
  instances: number;
  status: 'active' | 'inactive' | 'error';
  lastHealthCheck?: Date;
}

export class ActorRegistry {
  private actors: Map<string, RegisteredActor> = new Map();

  async register(actor: ActorDefinition): Promise<void> {
    const registered: RegisteredActor = {
      ...actor,
      version: '1.0.0',
      instances: 1,
      status: 'active',
      lastHealthCheck: new Date()
    };

    this.actors.set(actor.name, registered);
  }

  async get(name: string): Promise<RegisteredActor | undefined> {
    return this.actors.get(name);
  }

  async getAll(): Promise<RegisteredActor[]> {
    return Array.from(this.actors.values());
  }

  async update(name: string, updates: Partial<RegisteredActor>): Promise<void> {
    const actor = this.actors.get(name);
    if (!actor) {
      throw new Error(`Actor ${name} not found`);
    }

    this.actors.set(name, { ...actor, ...updates });
  }

  async remove(name: string): Promise<void> {
    this.actors.delete(name);
  }

  async healthCheck(name: string): Promise<boolean> {
    const actor = this.actors.get(name);
    if (!actor) {
      return false;
    }

    // In real implementation, would actually check actor health
    actor.lastHealthCheck = new Date();
    return actor.status === 'active';
  }

  async healthCheckAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    for (const [name, _] of this.actors) {
      results.set(name, await this.healthCheck(name));
    }

    return results;
  }
}