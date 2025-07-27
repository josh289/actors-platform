import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useActor } from '@actors-platform/sdk';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SecurityScreenProps {
  navigation: any;
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

export const SecurityScreen: React.FC<SecurityScreenProps> = ({ navigation }) => {
  const { ask, tell } = useActor('user-auth');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'sessions' | 'events'>('sessions');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    const token = await AsyncStorage.getItem('auth_token');
    if (!token) {
      navigation.navigate('Login');
      return;
    }

    setCurrentSessionId(token);

    // Get user ID from session
    const sessionResult = await ask({
      type: 'GET_SESSION',
      payload: { token }
    });

    if (sessionResult.success && sessionResult.data) {
      setUserId(sessionResult.data.userId);
      await fetchData(sessionResult.data.userId);
    }
  };

  const fetchData = async (uid: string) => {
    try {
      const [sessionsResult, eventsResult] = await Promise.all([
        ask({
          type: 'GET_SESSIONS',
          payload: { userId: uid }
        }),
        ask({
          type: 'GET_SECURITY_EVENTS',
          payload: { userId: uid, limit: 20 }
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
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (userId) {
      await fetchData(userId);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    Alert.alert(
      'Revoke Session',
      'Are you sure you want to sign out this device?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await tell({
                type: 'REVOKE_SESSION',
                payload: { sessionId }
              });

              if (sessionId === currentSessionId) {
                await AsyncStorage.removeItem('auth_token');
                navigation.navigate('Login');
              } else if (userId) {
                await fetchData(userId);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to revoke session');
            }
          }
        }
      ]
    );
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sessions' && styles.activeTab]}
          onPress={() => setActiveTab('sessions')}
        >
          <Text style={[styles.tabText, activeTab === 'sessions' && styles.activeTabText]}>
            Sessions ({sessions.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'events' && styles.activeTab]}
          onPress={() => setActiveTab('events')}
        >
          <Text style={[styles.tabText, activeTab === 'events' && styles.activeTabText]}>
            Security Events
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {activeTab === 'sessions' ? (
          <View style={styles.sessionsList}>
            {sessions.map((session) => {
              const isCurrent = session.id === currentSessionId;
              
              return (
                <View key={session.id} style={styles.sessionItem}>
                  <View style={styles.sessionInfo}>
                    <Text style={styles.deviceName}>{getDeviceInfo(session.userAgent)}</Text>
                    <Text style={styles.sessionMeta}>
                      {session.ipAddress || 'Unknown location'}
                    </Text>
                    <Text style={styles.sessionMeta}>
                      Last active: {formatDate(session.lastActivity)}
                    </Text>
                    {isCurrent && (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>Current device</Text>
                      </View>
                    )}
                  </View>
                  {!isCurrent && (
                    <TouchableOpacity
                      style={styles.revokeButton}
                      onPress={() => handleRevokeSession(session.id)}
                    >
                      <Text style={styles.revokeButtonText}>Sign out</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.eventsList}>
            {securityEvents.length === 0 ? (
              <Text style={styles.emptyText}>No security events recorded</Text>
            ) : (
              securityEvents.map((event) => (
                <View key={event.id} style={styles.eventItem}>
                  <View
                    style={[
                      styles.eventIndicator,
                      { backgroundColor: getSeverityColor(event.severity) }
                    ]}
                  />
                  <View style={styles.eventContent}>
                    <Text style={styles.eventType}>
                      {event.type.replace(/_/g, ' ')}
                    </Text>
                    <Text style={styles.eventTime}>{formatDate(event.timestamp)}</Text>
                    {event.details?.ipAddress && (
                      <Text style={styles.eventDetail}>IP: {event.details.ipAddress}</Text>
                    )}
                  </View>
                  <View style={[styles.severityBadge, styles[`severity${event.severity}`]]}>
                    <Text style={styles.severityText}>{event.severity}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#3b82f6',
  },
  content: {
    flex: 1,
  },
  sessionsList: {
    padding: 16,
  },
  sessionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 12,
  },
  sessionInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  sessionMeta: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 2,
  },
  currentBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  currentBadgeText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '500',
  },
  revokeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fee2e2',
    borderRadius: 6,
  },
  revokeButtonText: {
    color: '#dc2626',
    fontWeight: '500',
  },
  eventsList: {
    padding: 16,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 12,
  },
  eventIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  eventContent: {
    flex: 1,
  },
  eventType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
    textTransform: 'capitalize',
  },
  eventTime: {
    fontSize: 12,
    color: '#6b7280',
  },
  eventDetail: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  severityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  severityText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  severitylow: {
    backgroundColor: '#d1fae5',
  },
  severitymedium: {
    backgroundColor: '#fef3c7',
  },
  severityhigh: {
    backgroundColor: '#fee2e2',
  },
  severitycritical: {
    backgroundColor: '#dc2626',
  },
  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 16,
    marginTop: 40,
  },
});

export default SecurityScreen;