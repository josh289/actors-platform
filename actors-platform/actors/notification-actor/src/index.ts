export { NotificationActor } from './actor/NotificationActor';
export * from './types';
export * from './types/events';
export * from './types/actor';

// Services
export { EmailService } from './services/EmailService';
export { SMSService } from './services/SMSService';
export { PushService } from './services/PushService';
export { PreferencesService } from './services/PreferencesService';

// Web Components
export { NotificationCenter } from './components/web/widgets/NotificationCenter';
export { NotificationBell } from './components/web/micro/NotificationBell';
export { NotificationPreferences } from './components/web/pages/NotificationPreferences';
export { EmailPreview } from './components/web/modals/EmailPreview';

// GraphQL
export { typeDefs } from './graphql/schema';
export { resolvers } from './graphql/resolvers';

// Utils
export { CircuitBreaker } from './utils/circuit-breaker';
export { logger } from './utils/logger';