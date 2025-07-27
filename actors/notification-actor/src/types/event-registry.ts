// Event Registry Types for NotificationActor

export type EventCategory = 'command' | 'query' | 'notification';

export interface EventDefinition {
  name: string;
  category: EventCategory;
  description: string;
  producerActor: string;
  version: number;
  payloadSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
    [key: string]: any;
  };
  deprecated?: boolean;
  replacedBy?: string;
}

export interface ActorManifest {
  actorName: string;
  description?: string;
  version?: string;
  healthEndpoint?: string;
  produces: string[];
  consumes: string[];
}