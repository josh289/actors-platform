import React, { useState, useEffect } from 'react';
import { useActor } from '@actors-platform/sdk';

interface SessionManagerProps {
  userId: string;
}

interface Session {
  id: string;
  userId: string;
  userAgent?: string;
  ipAddress?: string;
  lastActivity: Date;
  createdAt: Date;
}

export const SessionManager: React.FC<SessionManagerProps> = ({ userId }) => {
  const { ask, tell } = useActor('user-auth');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      setCurrentSessionId(token);
    }
    fetchSessions();
  }, [userId]);

  const fetchSessions = async () => {
    try {
      const result = await ask({
        type: 'GET_SESSIONS',
        payload: { userId }
      });

      if (result.success && result.data) {
        setSessions(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await tell({
        type: 'REVOKE_SESSION',
        payload: { sessionId }
      });

      if (sessionId === currentSessionId) {
        localStorage.removeItem('auth_token');
        window.location.href = '/login';
      } else {
        await fetchSessions();
      }
    } catch (error) {
      console.error('Failed to revoke session:', error);
    }
  };

  const handleRevokeAllOther = async () => {
    const otherSessions = sessions.filter(s => s.id !== currentSessionId);
    
    for (const session of otherSessions) {
      await handleRevokeSession(session.id);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  };

  const getDeviceInfo = (userAgent?: string) => {
    if (!userAgent) return 'Unknown device';
    
    if (/mobile/i.test(userAgent)) return '📱 Mobile';
    if (/tablet/i.test(userAgent)) return '📱 Tablet';
    if (/macintosh/i.test(userAgent)) return '💻 Mac';
    if (/windows/i.test(userAgent)) return '💻 Windows';
    if (/linux/i.test(userAgent)) return '💻 Linux';
    
    return '💻 Desktop';
  };

  if (loading) {
    return (
      <div className="session-manager session-manager--loading">
        <div className="session-manager__skeleton"></div>
      </div>
    );
  }

  const otherSessions = sessions.filter(s => s.id !== currentSessionId);

  return (
    <div className="session-manager">
      <div className="session-manager__header">
        <h2 className="session-manager__title">Active Sessions</h2>
        <p className="session-manager__subtitle">
          You have {sessions.length} active {sessions.length === 1 ? 'session' : 'sessions'}
        </p>
      </div>

      {otherSessions.length > 0 && (
        <button
          onClick={handleRevokeAllOther}
          className="session-manager__revoke-all"
        >
          Sign out all other sessions
        </button>
      )}

      <div className="session-manager__list">
        {sessions.map((session) => {
          const isCurrent = session.id === currentSessionId;
          
          return (
            <div 
              key={session.id} 
              className={`session-manager__item ${isCurrent ? 'session-manager__item--current' : ''}`}
            >
              <div className="session-manager__item-info">
                <div className="session-manager__device">
                  <span className="session-manager__device-icon">{getDeviceInfo(session.userAgent)}</span>
                  {isCurrent && (
                    <span className="session-manager__current-badge">This device</span>
                  )}
                </div>
                <div className="session-manager__meta">
                  <p className="session-manager__location">
                    {session.ipAddress || 'Unknown location'}
                  </p>
                  <p className="session-manager__time">
                    Last active: {formatDate(session.lastActivity)}
                  </p>
                </div>
              </div>
              
              {!isCurrent && (
                <button
                  onClick={() => handleRevokeSession(session.id)}
                  className="session-manager__revoke"
                >
                  Sign out
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="session-manager__footer">
        <p className="session-manager__footer-text">
          If you notice any unfamiliar devices, revoke their access immediately and change your password.
        </p>
      </div>
    </div>
  );
};

// CSS-in-JS styles
const styles = `
  .session-manager {
    width: 100%;
    max-width: 500px;
  }

  .session-manager--loading {
    min-height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .session-manager__skeleton {
    width: 100%;
    height: 300px;
    background: #e5e7eb;
    border-radius: 8px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .session-manager__header {
    margin-bottom: 24px;
  }

  .session-manager__title {
    font-size: 24px;
    font-weight: 600;
    color: #111827;
    margin: 0 0 8px 0;
  }

  .session-manager__subtitle {
    font-size: 14px;
    color: #6b7280;
    margin: 0;
  }

  .session-manager__revoke-all {
    width: 100%;
    padding: 10px 16px;
    background: #fee2e2;
    color: #dc2626;
    border: 1px solid #fecaca;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 16px;
  }

  .session-manager__revoke-all:hover {
    background: #fecaca;
    border-color: #fca5a5;
  }

  .session-manager__list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
  }

  .session-manager__item {
    padding: 16px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .session-manager__item--current {
    background: #dbeafe;
    border-color: #bfdbfe;
  }

  .session-manager__item-info {
    flex: 1;
  }

  .session-manager__device {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .session-manager__device-icon {
    font-size: 16px;
  }

  .session-manager__current-badge {
    font-size: 12px;
    padding: 2px 8px;
    background: #3b82f6;
    color: white;
    border-radius: 9999px;
    font-weight: 500;
  }

  .session-manager__meta p {
    font-size: 13px;
    color: #6b7280;
    margin: 0;
    line-height: 1.4;
  }

  .session-manager__location {
    font-weight: 500;
  }

  .session-manager__revoke {
    padding: 6px 12px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    color: #dc2626;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .session-manager__revoke:hover {
    background: #fee2e2;
    border-color: #fecaca;
  }

  .session-manager__footer {
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
  }

  .session-manager__footer-text {
    font-size: 13px;
    color: #6b7280;
    line-height: 1.5;
    margin: 0;
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

export default SessionManager;