import React, { useState, useEffect } from 'react';
import { UserPreferences } from '../../../types';

export interface NotificationPreferencesProps {
  userId: string;
  onSave?: (preferences: UserPreferences) => void;
  className?: string;
}

const defaultCategories = {
  transactional: 'Transaction Updates',
  marketing: 'Marketing & Promotions',
  updates: 'Product Updates',
  security: 'Security Alerts'
};

export const NotificationPreferences: React.FC<NotificationPreferencesProps> = ({
  userId,
  onSave,
  className = ''
}) => {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch current preferences
  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const response = await fetch(`/api/notifications/preferences?userId=${userId}`);
        const data = await response.json();
        setPreferences(data);
      } catch (error) {
        console.error('Failed to fetch preferences:', error);
        setMessage({ type: 'error', text: 'Failed to load preferences' });
      } finally {
        setLoading(false);
      }
    };

    fetchPreferences();
  }, [userId]);

  const handleChannelToggle = (channel: 'email' | 'sms' | 'push') => {
    if (!preferences) return;

    setPreferences({
      ...preferences,
      [channel]: {
        ...preferences[channel],
        enabled: !preferences[channel].enabled
      }
    });
  };

  const handleCategoryToggle = (channel: 'email' | 'sms' | 'push', category: string) => {
    if (!preferences) return;

    setPreferences({
      ...preferences,
      [channel]: {
        ...preferences[channel],
        categories: {
          ...preferences[channel].categories,
          [category]: !preferences[channel].categories[category]
        }
      }
    });
  };

  const handleQuietHoursToggle = () => {
    if (!preferences) return;

    setPreferences({
      ...preferences,
      quietHours: preferences.quietHours ? {
        ...preferences.quietHours,
        enabled: !preferences.quietHours.enabled
      } : {
        enabled: true,
        start: '22:00',
        end: '08:00',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    });
  };

  const handleQuietHoursChange = (field: 'start' | 'end', value: string) => {
    if (!preferences?.quietHours) return;

    setPreferences({
      ...preferences,
      quietHours: {
        ...preferences.quietHours,
        [field]: value
      }
    });
  };

  const handleTimezoneChange = (timezone: string) => {
    if (!preferences?.quietHours) return;

    setPreferences({
      ...preferences,
      quietHours: {
        ...preferences.quietHours,
        timezone
      }
    });
  };

  const handleSave = async () => {
    if (!preferences) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, preferences })
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Preferences saved successfully!' });
        onSave?.(preferences);
      } else {
        throw new Error('Failed to save preferences');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save preferences' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={`notification-preferences loading ${className}`}>Loading...</div>;
  }

  if (!preferences) {
    return <div className={`notification-preferences error ${className}`}>Failed to load preferences</div>;
  }

  return (
    <div className={`notification-preferences ${className}`}>
      <h2>Notification Preferences</h2>
      
      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="preferences-section">
        <h3>Notification Channels</h3>
        
        {/* Email Preferences */}
        <div className="channel-section">
          <div className="channel-header">
            <label className="switch">
              <input
                type="checkbox"
                checked={preferences.email.enabled}
                onChange={() => handleChannelToggle('email')}
              />
              <span className="slider"></span>
            </label>
            <span className="channel-name">Email Notifications</span>
          </div>
          
          {preferences.email.enabled && (
            <div className="category-list">
              {Object.entries(defaultCategories).map(([key, label]) => (
                <label key={key} className="category-item">
                  <input
                    type="checkbox"
                    checked={preferences.email.categories[key] ?? true}
                    onChange={() => handleCategoryToggle('email', key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* SMS Preferences */}
        <div className="channel-section">
          <div className="channel-header">
            <label className="switch">
              <input
                type="checkbox"
                checked={preferences.sms.enabled}
                onChange={() => handleChannelToggle('sms')}
              />
              <span className="slider"></span>
            </label>
            <span className="channel-name">SMS Notifications</span>
          </div>
          
          {preferences.sms.enabled && (
            <div className="category-list">
              {Object.entries(defaultCategories).map(([key, label]) => (
                <label key={key} className="category-item">
                  <input
                    type="checkbox"
                    checked={preferences.sms.categories[key] ?? true}
                    onChange={() => handleCategoryToggle('sms', key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Push Preferences */}
        <div className="channel-section">
          <div className="channel-header">
            <label className="switch">
              <input
                type="checkbox"
                checked={preferences.push.enabled}
                onChange={() => handleChannelToggle('push')}
              />
              <span className="slider"></span>
            </label>
            <span className="channel-name">Push Notifications</span>
          </div>
          
          {preferences.push.enabled && (
            <div className="category-list">
              {Object.entries(defaultCategories).map(([key, label]) => (
                <label key={key} className="category-item">
                  <input
                    type="checkbox"
                    checked={preferences.push.categories[key] ?? true}
                    onChange={() => handleCategoryToggle('push', key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="preferences-section">
        <h3>Quiet Hours</h3>
        <div className="quiet-hours">
          <label className="switch">
            <input
              type="checkbox"
              checked={preferences.quietHours?.enabled ?? false}
              onChange={handleQuietHoursToggle}
            />
            <span className="slider"></span>
          </label>
          <span>Enable quiet hours</span>
        </div>
        
        {preferences.quietHours?.enabled && (
          <div className="quiet-hours-settings">
            <div className="time-inputs">
              <label>
                Start time:
                <input
                  type="time"
                  value={preferences.quietHours.start}
                  onChange={(e) => handleQuietHoursChange('start', e.target.value)}
                />
              </label>
              <label>
                End time:
                <input
                  type="time"
                  value={preferences.quietHours.end}
                  onChange={(e) => handleQuietHoursChange('end', e.target.value)}
                />
              </label>
            </div>
            <label>
              Timezone:
              <select
                value={preferences.quietHours.timezone}
                onChange={(e) => handleTimezoneChange(e.target.value)}
              >
                <option value={preferences.quietHours.timezone}>
                  {preferences.quietHours.timezone}
                </option>
                {/* Add more timezone options as needed */}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="actions">
        <button 
          className="save-button"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
};

// Default styles
const styles = `
.notification-preferences {
  max-width: 600px;
  margin: 0 auto;
  padding: 24px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.notification-preferences h2 {
  margin-top: 0;
  margin-bottom: 24px;
  font-size: 24px;
  font-weight: 600;
}

.message {
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 24px;
  font-size: 14px;
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

.preferences-section {
  margin-bottom: 32px;
}

.preferences-section h3 {
  margin-bottom: 16px;
  font-size: 18px;
  font-weight: 600;
}

.channel-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #e0e0e0;
}

.channel-section:last-child {
  border-bottom: none;
}

.channel-header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.channel-name {
  margin-left: 12px;
  font-size: 16px;
  font-weight: 500;
}

.category-list {
  margin-left: 56px;
}

.category-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  cursor: pointer;
}

.category-item input[type="checkbox"] {
  margin-right: 8px;
}

.category-item span {
  font-size: 14px;
}

.quiet-hours {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.quiet-hours span {
  margin-left: 12px;
  font-size: 16px;
}

.quiet-hours-settings {
  margin-left: 56px;
}

.time-inputs {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}

.time-inputs label {
  display: flex;
  flex-direction: column;
  font-size: 14px;
}

.time-inputs input[type="time"] {
  margin-top: 4px;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: .4s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: .4s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: #2196F3;
}

input:checked + .slider:before {
  transform: translateX(20px);
}

.actions {
  margin-top: 32px;
  text-align: right;
}

.save-button {
  padding: 12px 24px;
  background-color: #2196F3;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.save-button:hover:not(:disabled) {
  background-color: #1976D2;
}

.save-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
`;

export const NotificationPreferencesStyles = styles;