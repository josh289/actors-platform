import React, { useState, useEffect, useRef } from 'react';
import { useActor } from '@actors-platform/sdk';

interface UserAvatarProps {
  userId: string;
  size?: 'sm' | 'md' | 'lg';
  showDropdown?: boolean;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ 
  userId, 
  size = 'md', 
  showDropdown = true 
}) => {
  const { ask, tell } = useActor('user-auth');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const result = await ask({
          type: 'GET_USER',
          payload: { userId }
        });

        if (result.success && result.data) {
          setUser(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId, ask]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (token) {
        await tell({
          type: 'REVOKE_SESSION',
          payload: { sessionId: token }
        });
        localStorage.removeItem('auth_token');
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  const sizeClasses = {
    sm: 'user-avatar--sm',
    md: 'user-avatar--md',
    lg: 'user-avatar--lg'
  };

  if (loading) {
    return (
      <div className={`user-avatar user-avatar--loading ${sizeClasses[size]}`}>
        <div className="user-avatar__skeleton" data-testid="user-avatar-skeleton"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const initials = (user.name || user.email)[0].toUpperCase();

  return (
    <div className={`user-avatar ${sizeClasses[size]}`} ref={dropdownRef}>
      <button
        className="user-avatar__button"
        onClick={() => showDropdown && setDropdownOpen(!dropdownOpen)}
        aria-haspopup="true"
        aria-expanded={dropdownOpen}
      >
        {user.avatar ? (
          <img 
            src={user.avatar} 
            alt={user.name || user.email}
            className="user-avatar__image"
          />
        ) : (
          <div className="user-avatar__placeholder">
            {initials}
          </div>
        )}
      </button>

      {showDropdown && dropdownOpen && (
        <div className="user-avatar__dropdown">
          <div className="user-avatar__dropdown-header">
            <div className="user-avatar__dropdown-name">{user.name || 'User'}</div>
            <div className="user-avatar__dropdown-email">{user.email}</div>
          </div>
          
          <div className="user-avatar__dropdown-divider"></div>
          
          <a href="/profile" className="user-avatar__dropdown-item">
            <svg className="user-avatar__dropdown-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Profile
          </a>
          
          <a href="/security" className="user-avatar__dropdown-item">
            <svg className="user-avatar__dropdown-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Security
          </a>
          
          <div className="user-avatar__dropdown-divider"></div>
          
          <button 
            onClick={handleLogout}
            className="user-avatar__dropdown-item user-avatar__dropdown-item--danger"
          >
            <svg className="user-avatar__dropdown-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      )}
    </div>
  );
};

// CSS-in-JS styles
const styles = `
  .user-avatar {
    position: relative;
  }

  .user-avatar--sm .user-avatar__button,
  .user-avatar--sm .user-avatar__skeleton {
    width: 28px;
    height: 28px;
  }

  .user-avatar--md .user-avatar__button,
  .user-avatar--md .user-avatar__skeleton {
    width: 36px;
    height: 36px;
  }

  .user-avatar--lg .user-avatar__button,
  .user-avatar--lg .user-avatar__skeleton {
    width: 48px;
    height: 48px;
  }

  .user-avatar__button {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid transparent;
    transition: border-color 0.2s;
    background: transparent;
    padding: 0;
  }

  .user-avatar__button:hover {
    border-color: #e5e7eb;
  }

  .user-avatar__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .user-avatar__placeholder {
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

  .user-avatar--lg .user-avatar__placeholder {
    font-size: 18px;
  }

  .user-avatar__skeleton {
    background: #e0e0e0;
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .user-avatar__dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 8px;
    width: 240px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    border: 1px solid #e5e7eb;
    z-index: 50;
  }

  .user-avatar__dropdown-header {
    padding: 12px 16px;
  }

  .user-avatar__dropdown-name {
    font-weight: 600;
    color: #111827;
    font-size: 14px;
  }

  .user-avatar__dropdown-email {
    font-size: 12px;
    color: #6b7280;
    margin-top: 2px;
  }

  .user-avatar__dropdown-divider {
    height: 1px;
    background: #e5e7eb;
  }

  .user-avatar__dropdown-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    color: #374151;
    text-decoration: none;
    font-size: 14px;
    transition: background-color 0.2s;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    cursor: pointer;
  }

  .user-avatar__dropdown-item:hover {
    background-color: #f3f4f6;
  }

  .user-avatar__dropdown-item--danger {
    color: #dc2626;
  }

  .user-avatar__dropdown-icon {
    width: 16px;
    height: 16px;
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

export default UserAvatar;