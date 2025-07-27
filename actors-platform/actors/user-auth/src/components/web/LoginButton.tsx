import React, { useState } from 'react';
import { LoginModal } from './LoginModal';

interface LoginButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

export const LoginButton: React.FC<LoginButtonProps> = ({ 
  variant = 'primary', 
  size = 'md' 
}) => {
  const [showModal, setShowModal] = useState(false);

  const handleSuccess = (user: any) => {
    setShowModal(false);
    // Optionally reload the page or update app state
    window.location.reload();
  };

  const sizeClasses = {
    sm: 'login-button--sm',
    md: 'login-button--md',
    lg: 'login-button--lg'
  };

  const variantClasses = {
    primary: 'login-button--primary',
    secondary: 'login-button--secondary'
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`login-button ${sizeClasses[size]} ${variantClasses[variant]}`}
      >
        Sign In
      </button>

      {showModal && (
        <LoginModal
          onSuccess={handleSuccess}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};

// CSS-in-JS styles
const styles = `
  .login-button {
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* Size variants */
  .login-button--sm {
    padding: 6px 12px;
    font-size: 14px;
  }

  .login-button--md {
    padding: 8px 16px;
    font-size: 16px;
  }

  .login-button--lg {
    padding: 12px 24px;
    font-size: 18px;
  }

  /* Color variants */
  .login-button--primary {
    background: #3b82f6;
    color: white;
  }

  .login-button--primary:hover {
    background: #2563eb;
  }

  .login-button--primary:active {
    background: #1d4ed8;
  }

  .login-button--secondary {
    background: #f3f4f6;
    color: #374151;
  }

  .login-button--secondary:hover {
    background: #e5e7eb;
  }

  .login-button--secondary:active {
    background: #d1d5db;
  }

  .login-button:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

export default LoginButton;