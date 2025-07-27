import React, { useState, useEffect } from 'react';
import { useActor } from '@actors-platform/sdk';
import { AuthGuard } from './AuthGuard';

interface ProfilePageProps {
  userId: string;
  editable?: boolean;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  bio: string | null;
  createdAt: Date;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ userId, editable = true }) => {
  const { ask, tell } = useActor('user-auth');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    bio: ''
  });

  useEffect(() => {
    fetchUser();
  }, [userId]);

  const fetchUser = async () => {
    try {
      const result = await ask({
        type: 'GET_USER',
        payload: { userId }
      });

      if (result.success && result.data) {
        setUser(result.data);
        setFormData({
          name: result.data.name || '',
          bio: result.data.bio || ''
        });
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await tell({
        type: 'UPDATE_PROFILE',
        payload: {
          userId,
          updates: {
            name: formData.name || null,
            bio: formData.bio || null
          }
        }
      });

      if (result.success) {
        await fetchUser();
        setEditing(false);
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: user?.name || '',
      bio: user?.bio || ''
    });
    setEditing(false);
  };

  if (loading) {
    return (
      <div className="profile-page profile-page--loading">
        <div className="profile-page__skeleton-header"></div>
        <div className="profile-page__skeleton-content"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile-page profile-page--error">
        <h2>User not found</h2>
        <p>The user profile you're looking for doesn't exist.</p>
      </div>
    );
  }

  return (
    <AuthGuard>
      <div className="profile-page">
        <div className="profile-page__header">
          <div className="profile-page__avatar-section">
            {user.avatar ? (
              <img 
                src={user.avatar} 
                alt={user.name || user.email}
                className="profile-page__avatar"
              />
            ) : (
              <div className="profile-page__avatar-placeholder">
                {(user.name || user.email)[0].toUpperCase()}
              </div>
            )}
            {editable && (
              <button className="profile-page__avatar-change">
                Change avatar
              </button>
            )}
          </div>

          <div className="profile-page__info">
            <h1 className="profile-page__name">
              {user.name || 'Unnamed User'}
            </h1>
            <p className="profile-page__email">{user.email}</p>
            <p className="profile-page__joined">
              Joined {new Date(user.createdAt).toLocaleDateString()}
            </p>
          </div>

          {editable && !editing && (
            <button 
              onClick={() => setEditing(true)}
              className="profile-page__edit-button"
            >
              Edit Profile
            </button>
          )}
        </div>

        <div className="profile-page__content">
          {editing ? (
            <form className="profile-page__form" onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}>
              <div className="profile-page__field">
                <label htmlFor="name" className="profile-page__label">
                  Display Name
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="profile-page__input"
                  placeholder="Your name"
                />
              </div>

              <div className="profile-page__field">
                <label htmlFor="bio" className="profile-page__label">
                  Bio
                </label>
                <textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="profile-page__textarea"
                  placeholder="Tell us about yourself"
                  rows={4}
                />
              </div>

              <div className="profile-page__actions">
                <button
                  type="submit"
                  disabled={saving}
                  className="profile-page__button profile-page__button--primary"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="profile-page__button profile-page__button--secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="profile-page__bio">
              <h2 className="profile-page__section-title">About</h2>
              <p className="profile-page__bio-text">
                {user.bio || 'No bio provided yet.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
};

// CSS-in-JS styles
const styles = `
  .profile-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 20px;
  }

  .profile-page--loading {
    min-height: 400px;
  }

  .profile-page__skeleton-header {
    height: 200px;
    background: #e5e7eb;
    border-radius: 12px;
    margin-bottom: 24px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .profile-page__skeleton-content {
    height: 300px;
    background: #e5e7eb;
    border-radius: 12px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .profile-page--error {
    text-align: center;
    padding: 60px 20px;
  }

  .profile-page__header {
    display: flex;
    align-items: flex-start;
    gap: 32px;
    margin-bottom: 40px;
    padding-bottom: 32px;
    border-bottom: 1px solid #e5e7eb;
  }

  .profile-page__avatar-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .profile-page__avatar,
  .profile-page__avatar-placeholder {
    width: 120px;
    height: 120px;
    border-radius: 50%;
  }

  .profile-page__avatar {
    object-fit: cover;
  }

  .profile-page__avatar-placeholder {
    background: #3b82f6;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48px;
    font-weight: 600;
  }

  .profile-page__avatar-change {
    font-size: 14px;
    color: #3b82f6;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 0;
  }

  .profile-page__avatar-change:hover {
    text-decoration: underline;
  }

  .profile-page__info {
    flex: 1;
  }

  .profile-page__name {
    font-size: 32px;
    font-weight: 700;
    color: #111827;
    margin: 0 0 8px 0;
  }

  .profile-page__email {
    font-size: 16px;
    color: #6b7280;
    margin: 0 0 8px 0;
  }

  .profile-page__joined {
    font-size: 14px;
    color: #9ca3af;
    margin: 0;
  }

  .profile-page__edit-button {
    padding: 10px 20px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .profile-page__edit-button:hover {
    background: #2563eb;
  }

  .profile-page__content {
    max-width: 600px;
  }

  .profile-page__form {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .profile-page__field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .profile-page__label {
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .profile-page__input,
  .profile-page__textarea {
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 16px;
    transition: all 0.2s;
  }

  .profile-page__input:focus,
  .profile-page__textarea:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .profile-page__textarea {
    resize: vertical;
    min-height: 100px;
  }

  .profile-page__actions {
    display: flex;
    gap: 12px;
  }

  .profile-page__button {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .profile-page__button--primary {
    background: #3b82f6;
    color: white;
  }

  .profile-page__button--primary:hover:not(:disabled) {
    background: #2563eb;
  }

  .profile-page__button--primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .profile-page__button--secondary {
    background: #f3f4f6;
    color: #374151;
  }

  .profile-page__button--secondary:hover {
    background: #e5e7eb;
  }

  .profile-page__bio {
    padding: 24px;
    background: #f9fafb;
    border-radius: 12px;
  }

  .profile-page__section-title {
    font-size: 20px;
    font-weight: 600;
    color: #111827;
    margin: 0 0 12px 0;
  }

  .profile-page__bio-text {
    color: #4b5563;
    line-height: 1.6;
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

  @media (max-width: 640px) {
    .profile-page__header {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .profile-page__name {
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

export default ProfilePage;