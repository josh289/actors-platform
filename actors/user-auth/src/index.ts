// Auth Actor - 100% compliant with Actor Definition Guide specification

export { AuthActor as default } from './auth-actor';
export { authComponentManifest as manifest } from './components/manifest';

// Export types for external use
export * from './state';
export * from './events';

// Re-export components for convenience
export { LoginForm } from './components/web/LoginForm';
export { LoginScreen } from './components/mobile/LoginScreen';
export { BiometricPrompt } from './components/mobile/BiometricPrompt';
export { QuickLoginSheet } from './components/mobile/QuickLoginSheet';

// Export API setup for REST endpoints
export { createAuthRouter, setupAuthAPI } from './api/auth';