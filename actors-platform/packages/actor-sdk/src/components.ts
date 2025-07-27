import { z } from 'zod';

export interface ComponentExport {
  name: string;
  type: ComponentType;
  category: ComponentCategory;
  props?: z.ZodSchema;
  description?: string;
  examples?: ComponentExample[];
}

export enum ComponentType {
  REACT = 'react',
  VUE = 'vue',
  ANGULAR = 'angular',
  WEBCOMPONENT = 'webcomponent',
  REACT_NATIVE = 'react-native',
  FLUTTER = 'flutter',
}

export enum ComponentCategory {
  WIDGET = 'widget',
  PAGE = 'page',
  MODAL = 'modal',
  MICRO = 'micro',
  SCREEN = 'screen',
  SERVICE = 'service',
}

export interface ComponentExample {
  title: string;
  description?: string;
  code: string;
  props?: any;
}

export class ComponentRegistry {
  private components = new Map<string, ComponentExport>();

  register(component: ComponentExport): void {
    if (this.components.has(component.name)) {
      throw new Error(`Component ${component.name} already registered`);
    }

    this.components.set(component.name, component);
  }

  get(name: string): ComponentExport | undefined {
    return this.components.get(name);
  }

  list(filter?: {
    type?: ComponentType;
    category?: ComponentCategory;
  }): ComponentExport[] {
    let components = Array.from(this.components.values());

    if (filter?.type) {
      components = components.filter(c => c.type === filter.type);
    }

    if (filter?.category) {
      components = components.filter(c => c.category === filter.category);
    }

    return components;
  }

  clear(): void {
    this.components.clear();
  }
}

export interface ActorComponentManifest {
  actor: string;
  version: string;
  components: ComponentExport[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export class ComponentBuilder {
  static widget(
    name: string,
    type: ComponentType,
    props?: z.ZodSchema,
    options?: Partial<ComponentExport>
  ): ComponentExport {
    return {
      name,
      type,
      category: ComponentCategory.WIDGET,
      props,
      ...options,
    };
  }

  static page(
    name: string,
    type: ComponentType,
    props?: z.ZodSchema,
    options?: Partial<ComponentExport>
  ): ComponentExport {
    return {
      name,
      type,
      category: ComponentCategory.PAGE,
      props,
      ...options,
    };
  }

  static modal(
    name: string,
    type: ComponentType,
    props?: z.ZodSchema,
    options?: Partial<ComponentExport>
  ): ComponentExport {
    return {
      name,
      type,
      category: ComponentCategory.MODAL,
      props,
      ...options,
    };
  }

  static micro(
    name: string,
    type: ComponentType,
    props?: z.ZodSchema,
    options?: Partial<ComponentExport>
  ): ComponentExport {
    return {
      name,
      type,
      category: ComponentCategory.MICRO,
      props,
      ...options,
    };
  }

  static screen(
    name: string,
    props?: z.ZodSchema,
    options?: Partial<ComponentExport>
  ): ComponentExport {
    return {
      name,
      type: ComponentType.REACT_NATIVE,
      category: ComponentCategory.SCREEN,
      props,
      ...options,
    };
  }
}

export function createManifest(
  actor: string,
  version: string,
  components: ComponentExport[],
  dependencies?: Record<string, string>
): ActorComponentManifest {
  return {
    actor,
    version,
    components,
    dependencies,
  };
}