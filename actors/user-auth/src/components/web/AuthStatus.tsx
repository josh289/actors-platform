import React, { useEffect, useState } from 'react';
import { useActor } from '@actors-platform/sdk';

interface AuthStatusProps {
  showAvatar?: boolean;
  showName?: boolean;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
}

export const AuthStatus: React.FC<AuthStatusProps> = ({ 
  showAvatar = true, 
  showName = true 
}) => {
  const { ask } = useActor('user-auth');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        // Get session from localStorage/cookie
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

        if (sessionResult.success && sessionResult.data) {
          // Get user details
          const userResult = await ask({
            type: 'GET_USER',
            payload: { userId: sessionResult.data.userId }
          });

          if (userResult.success && userResult.data) {
            setUser(userResult.data);
          }
        }
      } catch (error) {
        console.error('Failed to check auth status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();
  }, [ask]);

  if (loading) {
    return (
      <div className="auth-status auth-status--loading">
        <div className="auth-status__skeleton" data-testid="auth-status-skeleton"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="auth-status">
      {showAvatar && (
        <div className="auth-status__avatar">
          {user.avatar ? (
            <img 
              src={user.avatar} 
              alt={user.name || user.email}
              className="auth-status__avatar-img"
            />
          ) : (
            <div className="auth-status__avatar-placeholder">
              {(user.name || user.email)[0].toUpperCase()}
            </div>
          )}
        </div>
      )}
      
      {showName && (
        <div className="auth-status__info">
          <span className="auth-status__name">
            {user.name || user.email}
          </span>
        </div>
      )}
    </div>
  );
};

// CSS-in-JS styles
const styles = `
  .auth-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .auth-status--loading {
    opacity: 0.6;
  }

  .auth-status__skeleton {
    width: 120px;
    height: 32px;
    background: #e0e0e0;
    border-radius: 16px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .auth-status__avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    overflow: hidden;
  }

  .auth-status__avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .auth-status__avatar-placeholder {
    width: 100%;
    height: 100%;
    background: #3b82f6;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 14px;
  }

  .auth-status__info {
    display: flex;
    flex-direction: column;
  }

  .auth-status__name {
    font-size: 14px;
    font-weight: 500;
    color: #111827;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

export default AuthStatus;