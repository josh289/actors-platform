import React, { useState, useEffect } from 'react';

export interface NotificationBellProps {
  userId: string;
  showCount?: boolean;
  onClick?: () => void;
  className?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  userId,
  showCount = true,
  onClick,
  className = ''
}) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Fetch unread count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const response = await fetch(`/api/notifications/unread-count?userId=${userId}`);
        const data = await response.json();
        setUnreadCount(data.count);
      } catch (error) {
        console.error('Failed to fetch unread count:', error);
      }
    };

    fetchUnreadCount();
    
    // Poll for updates every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  // Subscribe to real-time updates
  useEffect(() => {
    const handleNewNotification = () => {
      setUnreadCount(prev => prev + 1);
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 1000);
    };

    const handleNotificationRead = () => {
      setUnreadCount(prev => Math.max(0, prev - 1));
    };

    const handleAllRead = () => {
      setUnreadCount(0);
    };

    window.addEventListener('notification:new' as any, handleNewNotification);
    window.addEventListener('notification:read' as any, handleNotificationRead);
    window.addEventListener('notification:all-read' as any, handleAllRead);

    return () => {
      window.removeEventListener('notification:new' as any, handleNewNotification);
      window.removeEventListener('notification:read' as any, handleNotificationRead);
      window.removeEventListener('notification:all-read' as any, handleAllRead);
    };
  }, []);

  return (
    <button 
      className={`notification-bell ${className} ${isAnimating ? 'animating' : ''}`}
      onClick={onClick}
      aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
    >
      <svg 
        width="24" 
        height="24" 
        viewBox="0 0 24 24" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path 
          d="M12 2C10.9 2 10 2.9 10 4C10 4.1 10.01 4.19 10.02 4.29C7.21 5.1 5 7.84 5 11V17L3 19V20H21V19L19 17V11C19 7.84 16.79 5.1 13.98 4.29C13.99 4.19 14 4.1 14 4C14 2.9 13.1 2 12 2ZM12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22Z" 
          fill="currentColor"
        />
      </svg>
      {showCount && unreadCount > 0 && (
        <span className="notification-count">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};

// Default styles
const styles = `
.notification-bell {
  position: relative;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: background-color 0.2s;
  color: #333;
}

.notification-bell:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.notification-bell.animating {
  animation: bell-ring 1s ease-in-out;
}

.notification-count {
  position: absolute;
  top: 0;
  right: 0;
  background-color: #f44336;
  color: white;
  font-size: 11px;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 12px;
  min-width: 18px;
  text-align: center;
}

@keyframes bell-ring {
  0% { transform: rotate(0deg); }
  10% { transform: rotate(10deg); }
  20% { transform: rotate(-10deg); }
  30% { transform: rotate(10deg); }
  40% { transform: rotate(-10deg); }
  50% { transform: rotate(5deg); }
  60% { transform: rotate(-5deg); }
  70% { transform: rotate(2deg); }
  80% { transform: rotate(-2deg); }
  90% { transform: rotate(1deg); }
  100% { transform: rotate(0deg); }
}
`;

export const NotificationBellStyles = styles;