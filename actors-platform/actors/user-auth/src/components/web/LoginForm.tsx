import React, { useState } from 'react';

interface LoginFormProps {
  onSuccess: (data: any) => void;
  onError?: (error: Error) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onError }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Failed to send magic link');
      }

      setMessage('Check your email for the magic link!');
      onSuccess({ email });
    } catch (error) {
      const err = error as Error;
      setMessage(err.message);
      onError?.(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-form">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
            disabled={loading}
            className="form-input"
          />
        </div>
        
        <button 
          type="submit" 
          disabled={loading || !email}
          className="submit-button"
        >
          {loading ? 'Sending...' : 'Send Magic Link'}
        </button>

        {message && (
          <div className={`message ${message.includes('Check') ? 'success' : 'error'}`}>
            {message}
          </div>
        )}
      </form>

      <style jsx>{`
        .login-form {
          max-width: 400px;
          margin: 0 auto;
          padding: 2rem;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #333;
        }

        .form-input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 1rem;
          transition: border-color 0.2s;
        }

        .form-input:focus {
          outline: none;
          border-color: #0070f3;
        }

        .form-input:disabled {
          background-color: #f5f5f5;
          cursor: not-allowed;
        }

        .submit-button {
          width: 100%;
          padding: 0.75rem;
          background-color: #0070f3;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .submit-button:hover:not(:disabled) {
          background-color: #0051cc;
        }

        .submit-button:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }

        .message {
          margin-top: 1rem;
          padding: 0.75rem;
          border-radius: 6px;
          text-align: center;
        }

        .message.success {
          background-color: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .message.error {
          background-color: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }
      `}</style>
    </div>
  );
};