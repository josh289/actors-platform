import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PaymentSheetProps {
  amount: number;
  onComplete: (result: { success: boolean; paymentIntentId?: string }) => void;
}

export const PaymentSheet: React.FC<PaymentSheetProps> = ({ amount, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvc, setCvc] = useState('');
  const [zip, setZip] = useState('');
  
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      damping: 20,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onComplete({ success: false });
    });
  };

  const handleSubmit = async () => {
    // Validate inputs
    if (!cardNumber || !expMonth || !expYear || !cvc || !zip) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      // In production, this would use Stripe SDK to:
      // 1. Create payment method
      // 2. Confirm payment intent
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock success
      const paymentIntentId = `pi_${Date.now()}`;
      
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        onComplete({ success: true, paymentIntentId });
      });
    } catch (error) {
      Alert.alert('Payment Failed', 'Please try again');
      setLoading(false);
    }
  };

  const formatCardNumber = (text: string) => {
    const cleaned = text.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = cleaned.match(/.{1,4}/g);
    return matches ? matches.join(' ') : cleaned;
  };

  const formatExpiry = (month: string, year: string) => {
    if (!month || !year) return '';
    return `${month.padStart(2, '0')}/${year}`;
  };

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <Animated.View
            style={[
              styles.sheetContainer,
              { transform: [{ translateY: slideAnim }] }
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Payment Details</Text>
              <View style={{ width: 24 }} />
            </View>

            {/* Amount Display */}
            {amount > 0 && (
              <View style={styles.amountSection}>
                <Text style={styles.amountLabel}>Amount to pay</Text>
                <Text style={styles.amountValue}>
                  ${(amount / 100).toFixed(2)}
                </Text>
              </View>
            )}

            {/* Card Form */}
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Card Number</Text>
                <View style={styles.cardInputContainer}>
                  <TextInput
                    style={styles.input}
                    value={cardNumber}
                    onChangeText={(text) => setCardNumber(formatCardNumber(text))}
                    placeholder="1234 5678 9012 3456"
                    keyboardType="numeric"
                    maxLength={19}
                  />
                  <Ionicons name="card" size={20} color="#9CA3AF" />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Expiry</Text>
                  <View style={styles.expiryContainer}>
                    <TextInput
                      style={[styles.input, styles.expiryInput]}
                      value={expMonth}
                      onChangeText={setExpMonth}
                      placeholder="MM"
                      keyboardType="numeric"
                      maxLength={2}
                    />
                    <Text style={styles.expirySeparator}>/</Text>
                    <TextInput
                      style={[styles.input, styles.expiryInput]}
                      value={expYear}
                      onChangeText={setExpYear}
                      placeholder="YY"
                      keyboardType="numeric"
                      maxLength={2}
                    />
                  </View>
                </View>

                <View style={[styles.inputGroup, { flex: 0.5 }]}>
                  <Text style={styles.label}>CVC</Text>
                  <TextInput
                    style={styles.input}
                    value={cvc}
                    onChangeText={setCvc}
                    placeholder="123"
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>ZIP Code</Text>
                <TextInput
                  style={styles.input}
                  value={zip}
                  onChangeText={setZip}
                  placeholder="12345"
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>
            </View>

            {/* Security Notice */}
            <View style={styles.securityNotice}>
              <Ionicons name="lock-closed" size={14} color="#6B7280" />
              <Text style={styles.securityText}>
                Your payment information is encrypted and secure
              </Text>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {amount > 0 ? `Pay $${(amount / 100).toFixed(2)}` : 'Add Card'}
                </Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  amountSection: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  amountLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
  },
  form: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  cardInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingRight: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  expiryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
  },
  expiryInput: {
    flex: 1,
    borderWidth: 0,
    textAlign: 'center',
  },
  expirySeparator: {
    fontSize: 16,
    color: '#6B7280',
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  securityText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 6,
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});