import React, { useState } from 'react';
import { LoginForm } from './LoginForm';

interface LoginPageProps {
  onSuccess: (user: any) => void;
  onError?: (error: Error) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess, onError }) => {
  const [showSocialOptions, setShowSocialOptions] = useState(false);

  return (
    <div className="login-page">
      <div className="login-page__container">
        <div className="login-page__header">
          <h1 className="login-page__title">Welcome back</h1>
          <p className="login-page__subtitle">
            Sign in to your account to continue
          </p>
        </div>

        <div className="login-page__content">
          <LoginForm onSuccess={onSuccess} onError={onError} />

          <div className="login-page__divider">
            <span className="login-page__divider-text">or continue with</span>
          </div>

          {!showSocialOptions ? (
            <button
              onClick={() => setShowSocialOptions(true)}
              className="login-page__social-toggle"
            >
              Show social login options
            </button>
          ) : (
            <div className="login-page__social">
              <button className="login-page__social-button">
                <svg className="login-page__social-icon" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>

              <button className="login-page__social-button">
                <svg className="login-page__social-icon" viewBox="0 0 24 24" fill="#000">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
                </svg>
                Continue with Facebook
              </button>

              <button className="login-page__social-button">
                <svg className="login-page__social-icon" viewBox="0 0 24 24" fill="#000">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c5.51 0 10-4.48 10-10S17.51 2 12 2zm6.605 4.61a8.502 8.502 0 011.93 5.314c-.281-.054-3.101-.629-5.943-.271-.065-.141-.12-.293-.184-.445a25.416 25.416 0 00-.564-1.236c3.145-1.28 4.577-3.124 4.761-3.362zM12 3.475c2.17 0 4.154.813 5.662 2.148-.152.216-1.443 1.941-4.48 3.08-1.399-2.57-2.95-4.675-3.189-5A8.687 8.687 0 0112 3.475zm-3.633.803a53.896 53.896 0 013.167 4.935c-3.992 1.063-7.517 1.04-7.896 1.04a8.581 8.581 0 014.729-5.975zM3.453 12.01v-.26c.37.01 4.512.065 8.775-1.215.25.477.477.965.694 1.453-.109.033-.228.065-.336.098-4.404 1.42-6.747 5.303-6.942 5.629a8.522 8.522 0 01-2.19-5.705zM12 20.547a8.482 8.482 0 01-5.239-1.8c.152-.315 1.888-3.656 6.703-5.337.022-.01.033-.01.054-.022a35.318 35.318 0 011.823 6.475 8.4 8.4 0 01-3.341.684zm4.761-1.465c-.086-.52-.542-3.015-1.659-6.084 2.679-.423 5.022.271 5.314.369a8.468 8.468 0 01-3.655 5.715z"/>
                </svg>
                Continue with GitHub
              </button>
            </div>
          )}
        </div>

        <div className="login-page__footer">
          <p className="login-page__footer-text">
            Don't have an account?{' '}
            <a href="/register" className="login-page__footer-link">
              Sign up
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

// CSS-in-JS styles
const styles = `
  .login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: #f9fafb;
  }

  .login-page__container {
    width: 100%;
    max-width: 400px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    padding: 40px 32px;
  }

  .login-page__header {
    text-align: center;
    margin-bottom: 32px;
  }

  .login-page__title {
    font-size: 28px;
    font-weight: 700;
    color: #111827;
    margin: 0 0 8px 0;
  }

  .login-page__subtitle {
    font-size: 16px;
    color: #6b7280;
    margin: 0;
  }

  .login-page__content {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .login-page__divider {
    position: relative;
    text-align: center;
    margin: 8px 0;
  }

  .login-page__divider::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 1px;
    background: #e5e7eb;
    transform: translateY(-50%);
  }

  .login-page__divider-text {
    position: relative;
    padding: 0 16px;
    background: white;
    color: #6b7280;
    font-size: 14px;
  }

  .login-page__social-toggle {
    width: 100%;
    padding: 10px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    color: #374151;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .login-page__social-toggle:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }

  .login-page__social {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .login-page__social-button {
    width: 100%;
    padding: 10px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    color: #374151;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .login-page__social-button:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }

  .login-page__social-icon {
    width: 20px;
    height: 20px;
  }

  .login-page__footer {
    margin-top: 32px;
    text-align: center;
  }

  .login-page__footer-text {
    font-size: 14px;
    color: #6b7280;
    margin: 0;
  }

  .login-page__footer-link {
    color: #3b82f6;
    text-decoration: none;
    font-weight: 500;
  }

  .login-page__footer-link:hover {
    text-decoration: underline;
  }

  @media (max-width: 640px) {
    .login-page__container {
      padding: 32px 24px;
    }

    .login-page__title {
      font-size: 24px;
    }
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

export default LoginPage;