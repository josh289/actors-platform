import React, { useState, useEffect } from 'react';
import { useActor } from '@actors-platform/sdk';

interface LoginModalProps {
  onSuccess: (user: any) => void;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onSuccess, onClose }) => {
  const { tell, ask } = useActor('user-auth');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [step, setStep] = useState<'email' | 'token'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Handle escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await tell({
        type: 'SEND_MAGIC_LINK',
        payload: { 
          email,
          ipAddress: '0.0.0.0',
          userAgent: navigator.userAgent
        }
      });

      if (result.success) {
        setStep('token');
      } else {
        setError(result.error?.message || 'Failed to send magic link');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await tell({
        type: 'VERIFY_MAGIC_LINK',
        payload: { token, email }
      });

      if (result.success && result.data?.token) {
        // Save token
        localStorage.setItem('auth_token', result.data.token);
        
        // Get user data
        const userResult = await ask({
          type: 'GET_USER',
          payload: { userId: result.data.userId }
        });

        if (userResult.success && userResult.data) {
          onSuccess(userResult.data);
        }
      } else {
        setError(result.error?.message || 'Invalid or expired token');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="login-modal__backdrop" 
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
    >
      <div className="login-modal__container">
        <button
          className="login-modal__close"
          onClick={onClose}
          aria-label="Close modal"
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="login-modal__content">
          <h2 id="login-modal-title" className="login-modal__title">
            {step === 'email' ? 'Sign in to your account' : 'Check your email'}
          </h2>

          {step === 'email' ? (
            <>
              <p className="login-modal__description">
                We'll send you a magic link to sign in without a password.
              </p>

              <form onSubmit={handleSendMagicLink} className="login-modal__form">
                <div className="login-modal__field">
                  <label htmlFor="email" className="login-modal__label">
                    Email address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="login-modal__input"
                    placeholder="you@example.com"
                    required
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="login-modal__error" role="alert">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="login-modal__button login-modal__button--primary"
                >
                  {loading ? 'Sending...' : 'Send magic link'}
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="login-modal__description">
                We sent a magic link to <strong>{email}</strong>. 
                Click the link in the email or enter the verification code below.
              </p>

              <form onSubmit={handleVerifyToken} className="login-modal__form">
                <div className="login-modal__field">
                  <label htmlFor="token" className="login-modal__label">
                    Verification code
                  </label>
                  <input
                    type="text"
                    id="token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="login-modal__input"
                    placeholder="Enter your code"
                    required
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="login-modal__error" role="alert">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="login-modal__button login-modal__button--primary"
                >
                  {loading ? 'Verifying...' : 'Verify code'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setToken('');
                    setError(null);
                  }}
                  className="login-modal__button login-modal__button--text"
                >
                  Try a different email
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// CSS-in-JS styles
const styles = `
  .login-modal__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
  }

  .login-modal__container {
    background: white;
    border-radius: 12px;
    width: 100%;
    max-width: 400px;
    position: relative;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }

  .login-modal__close {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: all 0.2s;
  }

  .login-modal__close:hover {
    background: #f3f4f6;
    color: #111827;
  }

  .login-modal__close svg {
    width: 20px;
    height: 20px;
  }

  .login-modal__content {
    padding: 32px;
  }

  .login-modal__title {
    font-size: 24px;
    font-weight: 600;
    color: #111827;
    margin: 0 0 8px 0;
  }

  .login-modal__description {
    color: #6b7280;
    margin: 0 0 24px 0;
    line-height: 1.5;
  }

  .login-modal__form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .login-modal__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .login-modal__label {
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .login-modal__input {
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 16px;
    transition: all 0.2s;
  }

  .login-modal__input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .login-modal__error {
    background: #fee2e2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 14px;
  }

  .login-modal__button {
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .login-modal__button--primary {
    background: #3b82f6;
    color: white;
  }

  .login-modal__button--primary:hover:not(:disabled) {
    background: #2563eb;
  }

  .login-modal__button--primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .login-modal__button--text {
    background: transparent;
    color: #3b82f6;
    padding: 8px 0;
  }

  .login-modal__button--text:hover {
    color: #2563eb;
    text-decoration: underline;
  }

  @media (max-width: 640px) {
    .login-modal__content {
      padding: 24px;
    }

    .login-modal__title {
      font-size: 20px;
    }
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

export default LoginModal;