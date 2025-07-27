import { 
  ComponentBuilder, 
  ComponentType, 
  createManifest 
} from '@actors-platform/sdk';
import { z } from 'zod';

// Web component schemas
const LoginFormProps = z.object({
  onSuccess: z.function().args(z.any()).returns(z.void()),
  onError: z.function().args(z.any()).returns(z.void()).optional(),
});

const UserProfileProps = z.object({
  userId: z.string(),
  editable: z.boolean().optional(),
});

const AuthGuardProps = z.object({
  children: z.any(),
  requiredPermission: z.string().optional(),
  fallback: z.any().optional(),
});

const UserAvatarProps = z.object({
  userId: z.string(),
  size: z.enum(['sm', 'md', 'lg']).optional(),
  showDropdown: z.boolean().optional(),
});

const AuthStatusProps = z.object({
  showAvatar: z.boolean().optional(),
  showName: z.boolean().optional(),
});

const LoginModalProps = z.object({
  onSuccess: z.function().args(z.any()).returns(z.void()),
  onClose: z.function().args().returns(z.void()),
});

const SessionManagerProps = z.object({
  userId: z.string(),
});

const LoginButtonProps = z.object({
  variant: z.enum(['primary', 'secondary']).optional(),
  size: z.enum(['sm', 'md', 'lg']).optional(),
});

const LogoutButtonProps = z.object({
  confirmLogout: z.boolean().optional(),
  onLogout: z.function().args().returns(z.void()).optional(),
});

// Mobile component schemas
const ScreenNavigationProps = z.object({
  navigation: z.any(), // Navigation prop from React Navigation
});

const BiometricPromptProps = z.object({
  visible: z.boolean(),
  onSuccess: z.function().args(z.string()).returns(z.void()),
  onCancel: z.function().args().returns(z.void()),
  userId: z.string().optional(),
});

const QuickLoginSheetProps = z.object({
  visible: z.boolean(),
  onSuccess: z.function().args(z.any()).returns(z.void()),
  onClose: z.function().args().returns(z.void()),
});

const AuthCardProps = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
    avatar: z.string().nullable(),
  }),
});

// Create component manifest
export const authComponentManifest = createManifest(
  'auth',
  '1.0.0',
  [
    // Web Components - Widgets
    ComponentBuilder.widget('AuthStatus', ComponentType.REACT, AuthStatusProps, {
      description: 'Authentication status for app header/navbar',
    }),
    ComponentBuilder.widget('UserAvatar', ComponentType.REACT, UserAvatarProps, {
      description: 'User avatar with dropdown menu',
    }),

    // Web Components - Pages
    ComponentBuilder.page('LoginPage', ComponentType.REACT, LoginFormProps, {
      description: 'Full page login with magic link and social auth',
    }),
    ComponentBuilder.page('ProfilePage', ComponentType.REACT, UserProfileProps, {
      description: 'User profile management page',
    }),
    ComponentBuilder.page('SecurityDashboard', ComponentType.REACT, UserProfileProps, {
      description: 'View sessions and security events',
    }),

    // Web Components - Modals
    ComponentBuilder.modal('LoginModal', ComponentType.REACT, LoginModalProps, {
      description: 'Quick login overlay modal',
    }),
    ComponentBuilder.modal('SessionManager', ComponentType.REACT, SessionManagerProps, {
      description: 'Manage active sessions modal',
    }),

    // Web Components - Micro
    ComponentBuilder.micro('LoginButton', ComponentType.REACT, LoginButtonProps, {
      description: 'Simple login trigger button',
    }),
    ComponentBuilder.micro('LogoutButton', ComponentType.REACT, LogoutButtonProps, {
      description: 'Logout action button',
    }),
    ComponentBuilder.micro('AuthGuard', ComponentType.REACT, AuthGuardProps, {
      description: 'Route protection wrapper',
    }),
    ComponentBuilder.micro('LoginForm', ComponentType.REACT, LoginFormProps, {
      description: 'Standalone login form component',
    }),

    // Mobile Components - Screens
    ComponentBuilder.screen('LoginScreen', ScreenNavigationProps, {
      description: 'Mobile login with biometrics support',
    }),
    ComponentBuilder.screen('ProfileScreen', ScreenNavigationProps, {
      description: 'User profile management screen',
    }),
    ComponentBuilder.screen('SecurityScreen', ScreenNavigationProps, {
      description: 'Security settings and sessions',
    }),

    // Mobile Components - Widgets
    ComponentBuilder.widget('AuthCard', ComponentType.REACT_NATIVE, AuthCardProps, {
      description: 'User authentication status card',
    }),
    ComponentBuilder.widget('BiometricPrompt', ComponentType.REACT_NATIVE, BiometricPromptProps, {
      description: 'Fingerprint/FaceID authentication prompt',
    }),

    // Mobile Components - Modals
    ComponentBuilder.modal('QuickLoginSheet', ComponentType.REACT_NATIVE, QuickLoginSheetProps, {
      description: 'Bottom sheet for quick login',
    }),
  ],
  {
    // Web dependencies
    'react': '^18.0.0',
    'react-dom': '^18.0.0',
    
    // Mobile dependencies
    'react-native': '^0.72.0',
    'expo-local-authentication': '^13.0.0',
    
    // Shared dependencies
    'better-auth': '^0.1.0',
    'zod': '^3.22.0',
  }
);

// Export manifest as default
export default authComponentManifest;