import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';

interface SubscriptionBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
}

export const SubscriptionBadge: React.FC<SubscriptionBadgeProps> = ({ 
  status, 
  size = 'md' 
}) => {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  const getStatusConfig = () => {
    switch (status.toLowerCase()) {
      case 'active':
        return {
          icon: CheckCircle,
          classes: 'bg-green-100 text-green-800',
          label: 'Active'
        };
      case 'trialing':
        return {
          icon: Clock,
          classes: 'bg-blue-100 text-blue-800',
          label: 'Trial'
        };
      case 'past_due':
        return {
          icon: AlertCircle,
          classes: 'bg-yellow-100 text-yellow-800',
          label: 'Past Due'
        };
      case 'canceled':
      case 'cancelled':
        return {
          icon: XCircle,
          classes: 'bg-gray-100 text-gray-800',
          label: 'Canceled'
        };
      case 'canceling':
        return {
          icon: Clock,
          classes: 'bg-orange-100 text-orange-800',
          label: 'Canceling'
        };
      case 'incomplete':
        return {
          icon: AlertCircle,
          classes: 'bg-red-100 text-red-800',
          label: 'Incomplete'
        };
      default:
        return {
          icon: AlertCircle,
          classes: 'bg-gray-100 text-gray-800',
          label: status
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${config.classes} ${sizeClasses[size]}`}>
      <Icon className={`${iconSizes[size]} mr-1`} />
      {config.label}
    </span>
  );
};