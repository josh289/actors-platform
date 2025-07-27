import React, { useState } from 'react';
import { useActor } from '@actors-platform/sdk';

interface LogoutButtonProps {
  confirmLogout?: boolean;
  onLogout?: () => void;
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({ 
  confirmLogout = false, 
  onLogout 
}) => {
  const { tell } = useActor('user-auth');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleLogout = async () => {
    if (confirmLogout && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    setLoading(true);
    
    try {
      const token = localStorage.getItem('auth_token');
      if (token) {
        await tell({
          type: 'REVOKE_SESSION',
          payload: { sessionId: token }
        });
        localStorage.removeItem('auth_token');
      }
      
      if (onLogout) {
        onLogout();
      } else {
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Failed to logout:', error);
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  if (showConfirm) {
    return (
      <div className="logout-button__confirm">
        <span className="logout-button__confirm-text">Are you sure?</span>
        <button
          onClick={handleLogout}
          disabled={loading}
          className="logout-button logout-button--confirm"
        >
          {loading ? 'Logging out...' : 'Yes, logout'}
        </button>
        <button
          onClick={() => setShowConfirm(false)}
          className="logout-button logout-button--cancel"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="logout-button"
    >
      {loading ? 'Logging out...' : 'Logout'}
    </button>
  );
};

// CSS-in-JS styles
const styles = `
  .logout-button {
    padding: 8px 16px;
    font-size: 16px;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    background: #ef4444;
    color: white;
  }

  .logout-button:hover:not(:disabled) {
    background: #dc2626;
  }

  .logout-button:active:not(:disabled) {
    background: #b91c1c;
  }

  .logout-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .logout-button:focus-visible {
    outline: 2px solid #ef4444;
    outline-offset: 2px;
  }

  .logout-button__confirm {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .logout-button__confirm-text {
    font-size: 14px;
    color: #6b7280;
  }

  .logout-button--confirm {
    background: #ef4444;
    padding: 6px 12px;
    font-size: 14px;
  }

  .logout-button--cancel {
    background: #f3f4f6;
    color: #374151;
    padding: 6px 12px;
    font-size: 14px;
  }

  .logout-button--cancel:hover {
    background: #e5e7eb;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

export default LogoutButton;