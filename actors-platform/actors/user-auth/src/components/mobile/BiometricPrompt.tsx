import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

interface BiometricPromptProps {
  visible: boolean;
  onSuccess: (userId: string) => void;
  onCancel: () => void;
  userId?: string;
}

export const BiometricPrompt: React.FC<BiometricPromptProps> = ({
  visible,
  onSuccess,
  onCancel,
  userId,
}) => {
  useEffect(() => {
    if (visible) {
      authenticateWithBiometrics();
    }
  }, [visible]);

  const authenticateWithBiometrics = async () => {
    try {
      // Check if biometrics are available
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert(
          'Not Supported',
          'Your device does not support biometric authentication'
        );
        onCancel();
        return;
      }

      // Check if biometrics are enrolled
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) {
        Alert.alert(
          'Not Enrolled',
          'Please set up biometric authentication in your device settings'
        );
        onCancel();
        return;
      }

      // Get supported authentication types
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const biometricType = supportedTypes.includes(
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
      )
        ? 'Face ID'
        : 'Touch ID';

      // Authenticate
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Use ${biometricType} to login`,
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use Email',
        disableDeviceFallback: false,
      });

      if (result.success) {
        // In a real app, you would retrieve the stored user ID from secure storage
        const storedUserId = userId || 'stored-user-id';
        onSuccess(storedUserId);
      } else {
        if (result.error === 'user_cancel') {
          onCancel();
        } else {
          Alert.alert('Authentication Failed', 'Please try again');
          onCancel();
        }
      }
    } catch (error) {
      console.error('Biometric authentication error:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
      onCancel();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.prompt}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>
              {Platform.OS === 'ios' ? '🤳' : '👆'}
            </Text>
          </View>
          
          <Text style={styles.title}>Biometric Authentication</Text>
          <Text style={styles.message}>
            Authenticate to continue to your account
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.retryButton]}
              onPress={authenticateWithBiometrics}
            >
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  prompt: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 320,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  cancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    marginLeft: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});