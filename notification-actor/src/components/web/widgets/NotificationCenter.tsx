import React, { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Message, MessageStatus } from '../../../types';

export interface NotificationCenterProps {
  userId: string;
  maxItems?: number;
  onMarkAsRead?: (notificationId: string) => void;
  onMarkAllAsRead?: () => void;
  className?: string;
}

interface NotificationItem extends Message {
  title?: string;
  icon?: string;
  actionUrl?: string;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  userId,
  maxItems = 10,
  onMarkAsRead,
  onMarkAllAsRead,
  className = ''
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  // Fetch notifications
  const fetchNotifications = useCallback(async (pageNum: number) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/notifications?userId=${userId}&page=${pageNum}&limit=${maxItems}`);
      const data = await response.json();
      
      if (pageNum === 1) {
        setNotifications(data.notifications);
      } else {
        setNotifications(prev => [...prev, ...data.notifications]);
      }
      
      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, maxItems]);

  useEffect(() => {
    fetchNotifications(1);
  }, [fetchNotifications]);

  // Subscribe to real-time updates
  useEffect(() => {
    const handleNewNotification = (event: CustomEvent<NotificationItem>) => {
      setNotifications(prev => [event.detail, ...prev]);
    };

    window.addEventListener('notification:new' as any, handleNewNotification);
    return () => {
      window.removeEventListener('notification:new' as any, handleNewNotification);
    };
  }, []);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, { method: 'POST' });
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, status: MessageStatus.READ } : n)
      );
      onMarkAsRead?.(notificationId);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await fetch(`/api/notifications/read-all?userId=${userId}`, { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, status: MessageStatus.READ })));
      onMarkAllAsRead?.();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNotifications(nextPage);
  };

  const getNotificationIcon = (notification: NotificationItem) => {
    if (notification.icon) return notification.icon;
    
    switch (notification.channel) {
      case 'email':
        return '📧';
      case 'sms':
        return '💬';
      case 'push':
        return '🔔';
      default:
        return '📢';
    }
  };

  const getNotificationClass = (notification: NotificationItem) => {
    const baseClass = 'notification-item';
    const readClass = notification.status === MessageStatus.READ ? 'read' : 'unread';
    const priorityClass = notification.priority === 'high' ? 'high-priority' : '';
    return `${baseClass} ${readClass} ${priorityClass}`.trim();
  };

  if (loading && notifications.length === 0) {
    return (
      <div className={`notification-center loading ${className}`}>
        <div className="spinner">Loading...</div>
      </div>
    );
  }

  const unreadCount = notifications.filter(n => n.status !== MessageStatus.READ).length;

  return (
    <div className={`notification-center ${className}`}>
      <div className="notification-header">
        <h3>Notifications</h3>
        {unreadCount > 0 && (
          <button 
            className="mark-all-read-btn"
            onClick={handleMarkAllAsRead}
          >
            Mark all as read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="no-notifications">
          <p>No notifications yet</p>
        </div>
      ) : (
        <>
          <div className="notification-list">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={getNotificationClass(notification)}
                onClick={() => handleMarkAsRead(notification.id)}
                data-testid={notification.id}
              >
                <div className="notification-icon">
                  {getNotificationIcon(notification)}
                </div>
                <div className="notification-content">
                  <div className="notification-title">
                    {notification.title || 'Notification'}
                  </div>
                  <div className="notification-message">
                    {notification.content || notification.metadata?.message}
                  </div>
                  <div className="notification-time">
                    {formatDistanceToNow(new Date(notification.sentAt || Date.now()), { addSuffix: true })}
                  </div>
                </div>
                {notification.actionUrl && (
                  <a 
                    href={notification.actionUrl}
                    className="notification-action"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View
                  </a>
                )}
              </div>
            ))}
          </div>

          {hasMore && (
            <button 
              className="load-more-btn"
              onClick={loadMore}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          )}
        </>
      )}
    </div>
  );
};

// Default styles
const styles = `
.notification-center {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  max-width: 400px;
  max-height: 600px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.notification-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.mark-all-read-btn {
  background: none;
  border: none;
  color: #1976d2;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
}

.mark-all-read-btn:hover {
  text-decoration: underline;
}

.notification-list {
  flex: 1;
  overflow-y: auto;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background-color 0.2s;
}

.notification-item:hover {
  background-color: #f5f5f5;
}

.notification-item.unread {
  background-color: #e3f2fd;
}

.notification-item.high-priority {
  border-left: 4px solid #f44336;
}

.notification-icon {
  font-size: 24px;
  margin-right: 12px;
  flex-shrink: 0;
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-message {
  font-size: 14px;
  color: #666;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.notification-time {
  font-size: 12px;
  color: #999;
}

.notification-action {
  margin-left: 12px;
  color: #1976d2;
  text-decoration: none;
  font-size: 14px;
  flex-shrink: 0;
}

.notification-action:hover {
  text-decoration: underline;
}

.no-notifications {
  padding: 48px 16px;
  text-align: center;
  color: #666;
}

.load-more-btn {
  width: 100%;
  padding: 12px;
  background: none;
  border: none;
  border-top: 1px solid #e0e0e0;
  color: #1976d2;
  cursor: pointer;
  font-size: 14px;
}

.load-more-btn:hover:not(:disabled) {
  background-color: #f5f5f5;
}

.load-more-btn:disabled {
  color: #999;
  cursor: not-allowed;
}

.spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid #f3f3f3;
  border-top: 2px solid #1976d2;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
`;

// Export styles for use in applications
export const NotificationCenterStyles = styles;