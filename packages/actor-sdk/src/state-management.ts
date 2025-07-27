/**
 * State management helpers for actors
 */
export class StateManagementHelpers<TState extends Record<string, any>> {
  /**
   * Deep clone state to prevent mutations
   */
  cloneState(state: TState): TState {
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * Merge partial state updates
   */
  mergeState(currentState: TState, updates: Partial<TState>): TState {
    return {
      ...currentState,
      ...updates,
    };
  }

  /**
   * Get state snapshot with metadata
   */
  getSnapshot(state: TState): StateSnapshot<TState> {
    return {
      state: this.cloneState(state),
      timestamp: new Date(),
      version: this.generateVersion(),
    };
  }

  /**
   * Compare two states for equality
   */
  areStatesEqual(state1: TState, state2: TState): boolean {
    return JSON.stringify(state1) === JSON.stringify(state2);
  }

  /**
   * Get state diff between two states
   */
  getStateDiff(oldState: TState, newState: TState): StateDiff {
    const diff: StateDiff = {
      added: {},
      modified: {},
      removed: {},
    };

    // Check for added and modified fields
    for (const key in newState) {
      if (!(key in oldState)) {
        diff.added[key] = (newState as any)[key];
      } else if (JSON.stringify((oldState as any)[key]) !== JSON.stringify((newState as any)[key])) {
        diff.modified[key] = {
          old: (oldState as any)[key],
          new: (newState as any)[key],
        };
      }
    }

    // Check for removed fields
    for (const key in oldState) {
      if (!(key in newState)) {
        diff.removed[key] = (oldState as any)[key];
      }
    }

    return diff;
  }

  /**
   * Validate state against schema
   */
  validateState(state: TState, validator: (state: TState) => ValidationResult): ValidationResult {
    return validator(state);
  }

  /**
   * Create state migration
   */
  createMigration<TNewState>(
    oldState: TState,
    migrationFn: (state: TState) => TNewState
  ): TNewState {
    return migrationFn(oldState);
  }

  /**
   * Batch state updates
   */
  batchUpdates(state: TState, updates: StateUpdate<TState>[]): TState {
    let newState = this.cloneState(state);
    
    for (const update of updates) {
      newState = update(newState);
    }
    
    return newState;
  }

  /**
   * Create state history tracker
   */
  createHistoryTracker(maxHistory: number = 10): StateHistory<TState> {
    return new StateHistory<TState>(maxHistory);
  }

  /**
   * Debounce state updates
   */
  createDebouncedUpdater(
    updateFn: (state: TState) => void,
    delayMs: number = 100
  ): DebouncedUpdater<TState> {
    let timeoutId: NodeJS.Timeout | null = null;
    let pendingState: TState | null = null;

    return {
      update: (state: TState) => {
        pendingState = state;
        
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        timeoutId = setTimeout(() => {
          if (pendingState) {
            updateFn(pendingState);
            pendingState = null;
          }
          timeoutId = null;
        }, delayMs);
      },
      
      flush: () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        if (pendingState) {
          updateFn(pendingState);
          pendingState = null;
        }
      },
      
      cancel: () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        pendingState = null;
      },
    };
  }

  /**
   * Create computed properties
   */
  createComputed<TResult>(
    state: TState,
    computeFn: (state: TState) => TResult
  ): TResult {
    return computeFn(state);
  }

  /**
   * State persistence helpers
   */
  async persistState(
    state: TState,
    persistFn: (state: TState) => Promise<void>
  ): Promise<void> {
    await persistFn(state);
  }

  async loadState(
    loadFn: () => Promise<TState | null>,
    defaultState: TState
  ): Promise<TState> {
    const loaded = await loadFn();
    return loaded || defaultState;
  }

  private generateVersion(): string {
    return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * State history tracker
 */
export class StateHistory<TState extends Record<string, any>> {
  private history: StateSnapshot<TState>[] = [];
  private maxHistory: number;
  private currentIndex: number = -1;

  constructor(maxHistory: number = 10) {
    this.maxHistory = maxHistory;
  }

  push(state: TState): void {
    // Remove any states after current index (for redo functionality)
    this.history = this.history.slice(0, this.currentIndex + 1);
    
    // Add new state
    this.history.push({
      state: JSON.parse(JSON.stringify(state)),
      timestamp: new Date(),
      version: `v${Date.now()}`,
    });
    
    // Maintain max history
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }
  }

  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  undo(): TState | null {
    if (!this.canUndo()) return null;
    
    this.currentIndex--;
    return this.history[this.currentIndex].state;
  }

  redo(): TState | null {
    if (!this.canRedo()) return null;
    
    this.currentIndex++;
    return this.history[this.currentIndex].state;
  }

  getHistory(): StateSnapshot<TState>[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }
}

// Type definitions
export interface StateSnapshot<TState> {
  state: TState;
  timestamp: Date;
  version: string;
}

export interface StateDiff {
  added: Record<string, any>;
  modified: Record<string, { old: any; new: any }>;
  removed: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export type StateUpdate<TState> = (state: TState) => TState;

export interface DebouncedUpdater<TState> {
  update: (state: TState) => void;
  flush: () => void;
  cancel: () => void;
}