import { describe, it, expect } from 'vitest';
import { authComponentManifest } from '../components/manifest';
import { ComponentType } from '@actors-platform/sdk';
import { z } from 'zod';

describe('Component Manifest', () => {
  it('should have correct manifest metadata', () => {
    expect(authComponentManifest.actorType).toBe('auth');
    expect(authComponentManifest.version).toBe('1.0.0');
    expect(authComponentManifest.components).toBeDefined();
    expect(authComponentManifest.dependencies).toBeDefined();
  });
  
  it('should have required dependencies', () => {
    const deps = authComponentManifest.dependencies;
    
    // Web dependencies
    expect(deps['react']).toBeDefined();
    expect(deps['react-dom']).toBeDefined();
    
    // Mobile dependencies
    expect(deps['react-native']).toBeDefined();
    expect(deps['expo-local-authentication']).toBeDefined();
    
    // Shared dependencies
    expect(deps['better-auth']).toBeDefined();
    expect(deps['zod']).toBeDefined();
  });
  
  describe('Web Components', () => {
    const webComponents = authComponentManifest.components.filter(
      c => c.platform === ComponentType.REACT
    );
    
    it('should have all web component categories', () => {
      const categories = new Set(webComponents.map(c => c.category));
      
      expect(categories.has('widget')).toBe(true);
      expect(categories.has('page')).toBe(true);
      expect(categories.has('modal')).toBe(true);
      expect(categories.has('micro')).toBe(true);
    });
    
    it('should have correct web widgets', () => {
      const widgets = webComponents.filter(c => c.category === 'widget');
      const widgetNames = widgets.map(w => w.name);
      
      expect(widgetNames).toContain('AuthStatus');
      expect(widgetNames).toContain('UserAvatar');
      
      // Verify AuthStatus props
      const authStatus = widgets.find(w => w.name === 'AuthStatus');
      expect(authStatus?.propsSchema).toBeDefined();
      
      const parsed = authStatus!.propsSchema.safeParse({
        showAvatar: true,
        showName: false,
      });
      expect(parsed.success).toBe(true);
    });
    
    it('should have correct web pages', () => {
      const pages = webComponents.filter(c => c.category === 'page');
      const pageNames = pages.map(p => p.name);
      
      expect(pageNames).toContain('LoginPage');
      expect(pageNames).toContain('ProfilePage');
      expect(pageNames).toContain('SecurityDashboard');
      
      // All pages should have descriptions
      pages.forEach(page => {
        expect(page.metadata?.description).toBeDefined();
        expect(page.metadata.description.length).toBeGreaterThan(0);
      });
    });
    
    it('should have correct web modals', () => {
      const modals = webComponents.filter(c => c.category === 'modal');
      const modalNames = modals.map(m => m.name);
      
      expect(modalNames).toContain('LoginModal');
      expect(modalNames).toContain('SessionManager');
      
      // Verify LoginModal props
      const loginModal = modals.find(m => m.name === 'LoginModal');
      const mockFn = () => {};
      const parsed = loginModal!.propsSchema.safeParse({
        onSuccess: mockFn,
        onClose: mockFn,
      });
      expect(parsed.success).toBe(true);
    });
    
    it('should have correct web micro components', () => {
      const micros = webComponents.filter(c => c.category === 'micro');
      const microNames = micros.map(m => m.name);
      
      expect(microNames).toContain('LoginButton');
      expect(microNames).toContain('LogoutButton');
      expect(microNames).toContain('AuthGuard');
      expect(microNames).toContain('LoginForm');
    });
  });
  
  describe('Mobile Components', () => {
    const mobileComponents = authComponentManifest.components.filter(
      c => c.platform === ComponentType.REACT_NATIVE || c.category === 'screen'
    );
    
    it('should have all mobile component categories', () => {
      const categories = new Set(mobileComponents.map(c => c.category));
      
      expect(categories.has('screen')).toBe(true);
      expect(categories.has('widget')).toBe(true);
      expect(categories.has('modal')).toBe(true);
    });
    
    it('should have correct mobile screens', () => {
      const screens = mobileComponents.filter(c => c.category === 'screen');
      const screenNames = screens.map(s => s.name);
      
      expect(screenNames).toContain('LoginScreen');
      expect(screenNames).toContain('ProfileScreen');
      expect(screenNames).toContain('SecurityScreen');
      
      // All screens should accept navigation prop
      screens.forEach(screen => {
        const parsed = screen.propsSchema.safeParse({
          navigation: { navigate: () => {} },
        });
        expect(parsed.success).toBe(true);
      });
    });
    
    it('should have correct mobile widgets', () => {
      const widgets = mobileComponents.filter(
        c => c.category === 'widget' && c.platform === ComponentType.REACT_NATIVE
      );
      const widgetNames = widgets.map(w => w.name);
      
      expect(widgetNames).toContain('AuthCard');
      expect(widgetNames).toContain('BiometricPrompt');
      
      // Verify BiometricPrompt props
      const biometric = widgets.find(w => w.name === 'BiometricPrompt');
      const parsed = biometric!.propsSchema.safeParse({
        visible: true,
        onSuccess: () => {},
        onCancel: () => {},
        userId: 'user-123',
      });
      expect(parsed.success).toBe(true);
    });
    
    it('should have correct mobile modals', () => {
      const modals = mobileComponents.filter(
        c => c.category === 'modal' && c.platform === ComponentType.REACT_NATIVE
      );
      const modalNames = modals.map(m => m.name);
      
      expect(modalNames).toContain('QuickLoginSheet');
    });
  });
  
  describe('Component Props Validation', () => {
    it('should validate required props correctly', () => {
      const component = authComponentManifest.components.find(
        c => c.name === 'UserAvatar'
      );
      
      // Valid props
      const validParsed = component!.propsSchema.safeParse({
        userId: 'user-123',
        size: 'md',
        showDropdown: true,
      });
      expect(validParsed.success).toBe(true);
      
      // Invalid props - missing userId
      const invalidParsed = component!.propsSchema.safeParse({
        size: 'md',
      });
      expect(invalidParsed.success).toBe(false);
      
      // Invalid props - wrong size
      const wrongSizeParsed = component!.propsSchema.safeParse({
        userId: 'user-123',
        size: 'xl', // not in enum
      });
      expect(wrongSizeParsed.success).toBe(false);
    });
    
    it('should handle optional props correctly', () => {
      const component = authComponentManifest.components.find(
        c => c.name === 'AuthStatus'
      );
      
      // All props are optional
      const emptyParsed = component!.propsSchema.safeParse({});
      expect(emptyParsed.success).toBe(true);
      
      // With optional props
      const withPropsParsed = component!.propsSchema.safeParse({
        showAvatar: true,
        showName: false,
      });
      expect(withPropsParsed.success).toBe(true);
    });
    
    it('should validate function props', () => {
      const component = authComponentManifest.components.find(
        c => c.name === 'LoginModal'
      );
      
      const parsed = component!.propsSchema.safeParse({
        onSuccess: (user: any) => console.log(user),
        onClose: () => console.log('close'),
      });
      expect(parsed.success).toBe(true);
      
      // Wrong type for function
      const wrongTypeParsed = component!.propsSchema.safeParse({
        onSuccess: 'not a function',
        onClose: () => {},
      });
      expect(wrongTypeParsed.success).toBe(false);
    });
  });
  
  describe('Component Metadata', () => {
    it('should have descriptions for all components', () => {
      authComponentManifest.components.forEach(component => {
        expect(component.metadata?.description).toBeDefined();
        expect(component.metadata.description).not.toBe('');
      });
    });
    
    it('should have unique component names', () => {
      const names = authComponentManifest.components.map(c => c.name);
      const uniqueNames = new Set(names);
      
      expect(names.length).toBe(uniqueNames.size);
    });
    
    it('should have valid component categories', () => {
      const validCategories = ['widget', 'page', 'modal', 'micro', 'screen'];
      
      authComponentManifest.components.forEach(component => {
        expect(validCategories).toContain(component.category);
      });
    });
  });
  
  describe('Export Structure', () => {
    it('should export manifest as default', () => {
      expect(authComponentManifest).toBeDefined();
      expect(typeof authComponentManifest).toBe('object');
    });
    
    it('should have all required manifest properties', () => {
      expect(authComponentManifest).toHaveProperty('actorType');
      expect(authComponentManifest).toHaveProperty('version');
      expect(authComponentManifest).toHaveProperty('components');
      expect(authComponentManifest).toHaveProperty('dependencies');
    });
  });
});