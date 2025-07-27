import React, { useEffect, useState } from 'react';
import { useActor } from '@actors-platform/sdk';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredPermission?: string;
  fallback?: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ 
  children, 
  requiredPermission, 
  fallback 
}) => {
  const { ask } = useActor('user-auth');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        
        if (!token) {
          setLoading(false);
          return;
        }

        // Verify session
        const sessionResult = await ask({
          type: 'GET_SESSION',
          payload: { token }
        });

        if (!sessionResult.success || !sessionResult.data) {
          localStorage.removeItem('auth_token');
          setLoading(false);
          return;
        }

        setIsAuthenticated(true);

        // Check permission if required
        if (requiredPermission) {
          const permissionResult = await ask({
            type: 'GET_PERMISSION',
            payload: {
              userId: sessionResult.data.userId,
              permission: requiredPermission
            }
          });

          setHasPermission(permissionResult.success && permissionResult.data?.hasPermission);
        } else {
          setHasPermission(true);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
        setHasPermission(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [ask, requiredPermission]);

  if (loading) {
    return (
      <div className="auth-guard__loading">
        <div className="auth-guard__spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div className="auth-guard__fallback">
        <h2>Authentication Required</h2>
        <p>Please sign in to access this content.</p>
        <a href="/login" className="auth-guard__login-link">
          Sign In
        </a>
      </div>
    );
  }

  if (requiredPermission && !hasPermission) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div className="auth-guard__fallback">
        <h2>Access Denied</h2>
        <p>You don't have permission to access this content.</p>
        <a href="/" className="auth-guard__home-link">
          Go Home
        </a>
      </div>
    );
  }

  return <>{children}</>;
};

// CSS-in-JS styles
const styles = `
  .auth-guard__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
  }

  .auth-guard__spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #f3f4f6;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: auth-guard-spin 0.8s linear infinite;
  }

  .auth-guard__fallback {
    text-align: center;
    padding: 40px 20px;
    max-width: 400px;
    margin: 0 auto;
  }

  .auth-guard__fallback h2 {
    font-size: 24px;
    font-weight: 600;
    color: #111827;
    margin: 0 0 12px 0;
  }

  .auth-guard__fallback p {
    color: #6b7280;
    margin: 0 0 24px 0;
    line-height: 1.5;
  }

  .auth-guard__login-link,
  .auth-guard__home-link {
    display: inline-block;
    padding: 10px 20px;
    background: #3b82f6;
    color: white;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 500;
    transition: background 0.2s;
  }

  .auth-guard__login-link:hover,
  .auth-guard__home-link:hover {
    background: #2563eb;
  }

  @keyframes auth-guard-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

export default AuthGuard;