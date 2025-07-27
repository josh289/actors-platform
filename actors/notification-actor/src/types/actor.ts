export interface Actor<TState> {
  handleEvent(event: any): Promise<any>;
  getState(): TState;
  setState(state: TState): void;
}

export interface ActorContext {
  actorId: string;
  config: any;
  
  // Communication patterns
  ask<TResponse = any>(actorName: string, event: any, timeout?: number): Promise<TResponse>;
  tell(actorName: string, event: any): Promise<void>;
  publish(event: any): Promise<void>;
}

export interface EventHandler<TEvent = any, TResponse = any> {
  (event: TEvent): Promise<TResponse>;
}