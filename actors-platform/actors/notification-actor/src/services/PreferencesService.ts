import { UserPreferences } from '../types';
import { logger } from '../utils/logger';
import { isWithinInterval, parse } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';

export class PreferencesService {
  canSendEmail(preferences: UserPreferences | undefined, category?: string): boolean {
    if (!preferences) {
      return true; // Default to sending if no preferences
    }

    if (!preferences.email.enabled) {
      return false;
    }

    if (category && preferences.email.categories[category] === false) {
      return false;
    }

    return true;
  }

  canSendSMS(preferences: UserPreferences | undefined, category?: string): boolean {
    if (!preferences) {
      return true; // Default to sending if no preferences
    }

    if (!preferences.sms.enabled) {
      return false;
    }

    if (category && preferences.sms.categories[category] === false) {
      return false;
    }

    return true;
  }

  canSendPush(preferences: UserPreferences | undefined, category?: string): boolean {
    if (!preferences) {
      return true; // Default to sending if no preferences
    }

    if (!preferences.push.enabled) {
      return false;
    }

    if (category && preferences.push.categories[category] === false) {
      return false;
    }

    return true;
  }

  isInQuietHours(preferences: UserPreferences | undefined): boolean {
    if (!preferences?.quietHours?.enabled) {
      return false;
    }

    try {
      const { start, end, timezone } = preferences.quietHours;
      const now = new Date();
      const zonedNow = utcToZonedTime(now, timezone);
      
      // Parse quiet hours times
      const todayStr = zonedNow.toISOString().split('T')[0];
      const startTime = parse(`${todayStr} ${start}`, 'yyyy-MM-dd HH:mm', new Date());
      let endTime = parse(`${todayStr} ${end}`, 'yyyy-MM-dd HH:mm', new Date());

      // Handle overnight quiet hours (e.g., 22:00 to 08:00)
      if (endTime <= startTime) {
        if (zonedNow >= startTime) {
          // We're after start time today, end time is tomorrow
          endTime = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);
        } else {
          // We're before end time today, start time was yesterday
          startTime.setTime(startTime.getTime() - 24 * 60 * 60 * 1000);
        }
      }

      const isInQuiet = isWithinInterval(zonedNow, { start: startTime, end: endTime });
      
      if (isInQuiet) {
        logger.info('Message blocked due to quiet hours', {
          timezone,
          quietStart: start,
          quietEnd: end,
          currentTime: zonedNow.toISOString()
        });
      }

      return isInQuiet;
    } catch (error) {
      logger.error('Error checking quiet hours', { error, preferences });
      return false; // Default to sending on error
    }
  }

  getNextAvailableTime(preferences: UserPreferences): Date | null {
    if (!preferences?.quietHours?.enabled) {
      return null;
    }

    try {
      const { end, timezone } = preferences.quietHours;
      const now = new Date();
      const zonedNow = utcToZonedTime(now, timezone);
      
      if (!this.isInQuietHours(preferences)) {
        return null; // Not in quiet hours, can send now
      }

      // Calculate next available time (end of quiet hours)
      const todayStr = zonedNow.toISOString().split('T')[0];
      let endTime = parse(`${todayStr} ${end}`, 'yyyy-MM-dd HH:mm', new Date());

      // If end time has passed today, it's tomorrow
      if (endTime <= zonedNow) {
        endTime = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);
      }

      return endTime;
    } catch (error) {
      logger.error('Error calculating next available time', { error, preferences });
      return null;
    }
  }

  mergePreferences(existing: UserPreferences, updates: Partial<UserPreferences>): UserPreferences {
    return {
      ...existing,
      ...updates,
      email: {
        ...existing.email,
        ...(updates.email || {}),
        categories: {
          ...existing.email.categories,
          ...(updates.email?.categories || {})
        }
      },
      sms: {
        ...existing.sms,
        ...(updates.sms || {}),
        categories: {
          ...existing.sms.categories,
          ...(updates.sms?.categories || {})
        }
      },
      push: {
        ...existing.push,
        ...(updates.push || {}),
        categories: {
          ...existing.push.categories,
          ...(updates.push?.categories || {})
        }
      },
      quietHours: updates.quietHours ? {
        ...existing.quietHours,
        ...updates.quietHours
      } : existing.quietHours
    };
  }

  getDefaultPreferences(userId: string): UserPreferences {
    return {
      userId,
      email: {
        enabled: true,
        categories: {
          transactional: true,
          marketing: true,
          updates: true,
          security: true
        }
      },
      sms: {
        enabled: true,
        categories: {
          transactional: true,
          marketing: false,
          updates: false,
          security: true
        }
      },
      push: {
        enabled: true,
        categories: {
          transactional: true,
          marketing: true,
          updates: true,
          security: true
        }
      }
    };
  }

  validatePreferences(preferences: any): boolean {
    // Validate the structure of preferences
    if (!preferences || typeof preferences !== 'object') {
      return false;
    }

    // Validate quiet hours if present
    if (preferences.quietHours) {
      const { start, end, timezone } = preferences.quietHours;
      
      if (!this.validateTimeFormat(start) || !this.validateTimeFormat(end)) {
        return false;
      }

      if (!this.validateTimezone(timezone)) {
        return false;
      }
    }

    return true;
  }

  private validateTimeFormat(time: string): boolean {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
  }

  private validateTimezone(timezone: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }
}