// Test setup file
import { vi } from 'vitest';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.SENDGRID_API_KEY = 'test_sendgrid_key';
process.env.TWILIO_ACCOUNT_SID = 'test_account_sid';
process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
process.env.TWILIO_FROM_NUMBER = '+1234567890';
process.env.EMAIL_FROM_ADDRESS = 'test@example.com';
process.env.EMAIL_FROM_NAME = 'Test Sender';

// Mock logger to reduce noise in tests
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));