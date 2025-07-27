import React, { useState, useEffect } from 'react';
import { useActor } from '@actors-platform/sdk';
import { AuthGuard } from './AuthGuard';

interface SecurityDashboardProps {
  userId: string;
  editable?: boolean;
}

interface Session {
  id: string;
  userId: string;
  userAgent?: string;
  ipAddress?: string;
  lastActivity: Date;
  createdAt: Date;
}

interface SecurityEvent {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId: string | null;
  details: any;
  timestamp: Date;
}

export const SecurityDashboard: React.FC<SecurityDashboardProps> = ({ userId }) => {
  const { ask, tell } = useActor('user-auth');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'sessions' | 'events'>('sessions');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      setCurrentSessionId(token);
    }
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    try {
      const [sessionsResult, eventsResult] = await Promise.all([
        ask({
          type: 'GET_SESSIONS',
          payload: { userId }
        }),
        ask({
          type: 'GET_SECURITY_EVENTS',
          payload: { userId, limit: 50 }
        })
      ]);

      if (sessionsResult.success && sessionsResult.data) {
        setSessions(sessionsResult.data);
      }

      if (eventsResult.success && eventsResult.data) {
        setSecurityEvents(eventsResult.data);
      }
    } catch (error) {
      console.error('Failed to fetch security data:', error);
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
        await fetchData();
      }
    } catch (error) {
      console.error('Failed to revoke session:', error);
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
    
    if (/mobile/i.test(userAgent)) return 'Mobile device';
    if (/tablet/i.test(userAgent)) return 'Tablet';
    if (/macintosh/i.test(userAgent)) return 'Mac';
    if (/windows/i.test(userAgent)) return 'Windows PC';
    if (/linux/i.test(userAgent)) return 'Linux';
    
    return 'Unknown device';
  };

  const getSeverityColor = (severity: SecurityEvent['severity']) => {
    const colors = {
      low: '#10b981',
      medium: '#f59e0b',
      high: '#ef4444',
      critical: '#dc2626'
    };
    return colors[severity];
  };

  if (loading) {
    return (
      <div className="security-dashboard security-dashboard--loading">
        <div className="security-dashboard__skeleton"></div>
      </div>
    );
  }

  return (
    <AuthGuard>
      <div className="security-dashboard">
        <h1 className="security-dashboard__title">Security Settings</h1>
        
        <div className="security-dashboard__tabs">
          <button
            className={`security-dashboard__tab ${activeTab === 'sessions' ? 'security-dashboard__tab--active' : ''}`}
            onClick={() => setActiveTab('sessions')}
          >
            Active Sessions ({sessions.length})
          </button>
          <button
            className={`security-dashboard__tab ${activeTab === 'events' ? 'security-dashboard__tab--active' : ''}`}
            onClick={() => setActiveTab('events')}
          >
            Security Events
          </button>
        </div>

        {activeTab === 'sessions' ? (
          <div className="security-dashboard__sessions">
            <p className="security-dashboard__description">
              These are the devices currently logged into your account. Revoke access for any unfamiliar devices.
            </p>
            
            {sessions.map((session) => (
              <div key={session.id} className="security-dashboard__session">
                <div className="security-dashboard__session-info">
                  <div className="security-dashboard__session-device">
                    <svg className="security-dashboard__session-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <h3>{getDeviceInfo(session.userAgent)}</h3>
                      <p>{session.ipAddress || 'Unknown location'}</p>
                    </div>
                  </div>
                  <div className="security-dashboard__session-meta">
                    <p>Last active: {formatDate(session.lastActivity)}</p>
                    {session.id === currentSessionId && (
                      <span className="security-dashboard__current-badge">Current session</span>
                    )}
                  </div>
                </div>
                {session.id !== currentSessionId && (
                  <button
                    onClick={() => handleRevokeSession(session.id)}
                    className="security-dashboard__revoke-button"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="security-dashboard__events">
            <p className="security-dashboard__description">
              Recent security events for your account. Monitor for any suspicious activity.
            </p>
            
            {securityEvents.length === 0 ? (
              <p className="security-dashboard__empty">No security events recorded.</p>
            ) : (
              securityEvents.map((event) => (
                <div key={event.id} className="security-dashboard__event">
                  <div className="security-dashboard__event-indicator" style={{ backgroundColor: getSeverityColor(event.severity) }}></div>
                  <div className="security-dashboard__event-content">
                    <h4>{event.type.replace(/_/g, ' ')}</h4>
                    <p>{formatDate(event.timestamp)}</p>
                    {event.details?.ipAddress && <p>IP: {event.details.ipAddress}</p>}
                  </div>
                  <span className={`security-dashboard__event-severity security-dashboard__event-severity--${event.severity}`}>
                    {event.severity}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </AuthGuard>
  );
};

// CSS-in-JS styles
const styles = `
  .security-dashboard {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 20px;
  }

  .security-dashboard--loading {
    min-height: 400px;
  }

  .security-dashboard__skeleton {
    height: 400px;
    background: #e5e7eb;
    border-radius: 12px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .security-dashboard__title {
    font-size: 32px;
    font-weight: 700;
    color: #111827;
    margin: 0 0 32px 0;
  }

  .security-dashboard__tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 32px;
    border-bottom: 1px solid #e5e7eb;
  }

  .security-dashboard__tab {
    padding: 12px 24px;
    background: none;
    border: none;
    font-size: 16px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    position: relative;
    transition: color 0.2s;
  }

  .security-dashboard__tab:hover {
    color: #374151;
  }

  .security-dashboard__tab--active {
    color: #3b82f6;
  }

  .security-dashboard__tab--active::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 2px;
    background: #3b82f6;
  }

  .security-dashboard__description {
    color: #6b7280;
    margin: 0 0 24px 0;
    line-height: 1.5;
  }

  .security-dashboard__sessions {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .security-dashboard__session {
    padding: 20px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .security-dashboard__session-info {
    flex: 1;
  }

  .security-dashboard__session-device {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
  }

  .security-dashboard__session-device h3 {
    font-size: 16px;
    font-weight: 600;
    color: #111827;
    margin: 0 0 4px 0;
  }

  .security-dashboard__session-device p {
    font-size: 14px;
    color: #6b7280;
    margin: 0;
  }

  .security-dashboard__session-icon {
    width: 32px;
    height: 32px;
    color: #6b7280;
  }

  .security-dashboard__session-meta {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .security-dashboard__session-meta p {
    font-size: 14px;
    color: #6b7280;
    margin: 0;
  }

  .security-dashboard__current-badge {
    font-size: 12px;
    padding: 4px 12px;
    background: #dbeafe;
    color: #1e40af;
    border-radius: 9999px;
    font-weight: 500;
  }

  .security-dashboard__revoke-button {
    padding: 8px 16px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    color: #dc2626;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .security-dashboard__revoke-button:hover {
    background: #fee2e2;
    border-color: #fecaca;
  }

  .security-dashboard__events {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .security-dashboard__event {
    padding: 16px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .security-dashboard__event-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .security-dashboard__event-content {
    flex: 1;
  }

  .security-dashboard__event-content h4 {
    font-size: 14px;
    font-weight: 600;
    color: #111827;
    margin: 0 0 4px 0;
    text-transform: capitalize;
  }

  .security-dashboard__event-content p {
    font-size: 12px;
    color: #6b7280;
    margin: 0;
  }

  .security-dashboard__event-severity {
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 9999px;
    font-weight: 500;
    text-transform: uppercase;
  }

  .security-dashboard__event-severity--low {
    background: #d1fae5;
    color: #065f46;
  }

  .security-dashboard__event-severity--medium {
    background: #fef3c7;
    color: #92400e;
  }

  .security-dashboard__event-severity--high {
    background: #fee2e2;
    color: #991b1b;
  }

  .security-dashboard__event-severity--critical {
    background: #dc2626;
    color: white;
  }

  .security-dashboard__empty {
    text-align: center;
    color: #9ca3af;
    padding: 40px;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  @media (max-width: 640px) {
    .security-dashboard__session {
      flex-direction: column;
      align-items: flex-start;
      gap: 16px;
    }

    .security-dashboard__revoke-button {
      width: 100%;
    }
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

export default SecurityDashboard;