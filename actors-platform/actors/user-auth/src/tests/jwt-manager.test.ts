import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JWTManager } from '../security/jwt-manager';

describe('JWTManager', () => {
  let jwtManager: JWTManager;
  
  beforeEach(() => {
    vi.clearAllMocks();
    jwtManager = new JWTManager({
      rotationInterval: 1000, // 1 second for testing
      secretLifetime: 5000, // 5 seconds for testing
      initialSecret: 'test-secret-123',
    });
  });
  
  describe('Secret Management', () => {
    it('should initialize with a secret', () => {
      const activeSecret = jwtManager.getActiveSecret();
      expect(activeSecret).toBeDefined();
      expect(activeSecret?.isActive).toBe(true);
      expect(activeSecret?.algorithm).toBe('HS256');
    });
    
    it('should generate unique secret IDs', () => {
      const manager1 = new JWTManager();
      const manager2 = new JWTManager();
      
      const secret1 = manager1.getActiveSecret();
      const secret2 = manager2.getActiveSecret();
      
      expect(secret1?.id).not.toBe(secret2?.id);
    });
    
    it('should detect when rotation is needed', async () => {
      expect(jwtManager.shouldRotate()).toBe(false);
      
      // Wait for rotation interval
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(jwtManager.shouldRotate()).toBe(true);
    });
    
    it('should rotate secrets correctly', () => {
      const originalSecret = jwtManager.getActiveSecret();
      const rotatedSecret = jwtManager.rotate();
      
      expect(rotatedSecret.id).not.toBe(originalSecret?.id);
      expect(rotatedSecret.isActive).toBe(true);
      expect(originalSecret?.isActive).toBe(false);
      
      // Both secrets should be available for verification
      expect(jwtManager.getSecret(originalSecret!.id)).toBeDefined();
      expect(jwtManager.getSecret(rotatedSecret.id)).toBeDefined();
    });
    
    it('should clean up expired secrets', async () => {
      // Create multiple rotations
      const secret1 = jwtManager.getActiveSecret();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const secret2 = jwtManager.rotate();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const secret3 = jwtManager.rotate();
      
      // All should exist initially
      expect(jwtManager.getValidSecrets()).toHaveLength(3);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 5100));
      
      // Trigger cleanup with another rotation
      jwtManager.rotate();
      
      // Expired secrets should be cleaned up
      const validSecrets = jwtManager.getValidSecrets();
      expect(validSecrets.length).toBeLessThan(3);
    }, 10000); // Increased timeout to 10 seconds
  });
  
  describe('JWT Operations', () => {
    it('should sign and verify valid tokens', () => {
      const payload = {
        sub: 'user-123',
        sid: 'session-456',
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: 'jwt-789',
      };
      
      const token = jwtManager.sign(payload);
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      
      const verifyResult = jwtManager.verify(token);
      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.payload).toMatchObject({
        sub: payload.sub,
        sid: payload.sid,
        jti: payload.jti,
      });
    });
    
    it('should reject invalid tokens', () => {
      const invalidTokens = [
        'invalid.token',
        'invalid.token.signature',
        '',
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.invalid',
      ];
      
      for (const token of invalidTokens) {
        const result = jwtManager.verify(token);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });
    
    it('should reject expired tokens', () => {
      const payload = {
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        jti: 'jwt-expired',
      };
      
      const token = jwtManager.sign(payload);
      const result = jwtManager.verify(token);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });
    
    it('should verify tokens with rotated secrets', () => {
      // Sign with current secret
      const token1 = jwtManager.sign({
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: 'jwt-1',
      });
      
      // Rotate secret
      jwtManager.rotate();
      
      // Sign with new secret
      const token2 = jwtManager.sign({
        sub: 'user-456',
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: 'jwt-2',
      });
      
      // Both tokens should verify
      const result1 = jwtManager.verify(token1);
      const result2 = jwtManager.verify(token2);
      
      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
      expect(result1.payload?.sub).toBe('user-123');
      expect(result2.payload?.sub).toBe('user-456');
    });
    
    it('should include key ID in token header', () => {
      const activeSecret = jwtManager.getActiveSecret();
      const token = jwtManager.sign({
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: 'jwt-kid',
      });
      
      const [encodedHeader] = token.split('.');
      const header = JSON.parse(
        Buffer.from(
          encodedHeader.replace(/-/g, '+').replace(/_/g, '/'),
          'base64'
        ).toString()
      );
      
      expect(header.kid).toBe(activeSecret?.id);
    });
  });
  
  describe('Rotation Status', () => {
    it('should provide rotation status', async () => {
      const status = jwtManager.getRotationStatus();
      
      expect(status.activeSecretId).toBeDefined();
      expect(status.activeSecretAge).toBeGreaterThanOrEqual(0);
      expect(status.nextRotation).toBeInstanceOf(Date);
      expect(status.totalSecrets).toBe(1);
      expect(status.expiredSecrets).toBe(0);
    });
    
    it('should update status after rotation', () => {
      const statusBefore = jwtManager.getRotationStatus();
      
      jwtManager.rotate();
      
      const statusAfter = jwtManager.getRotationStatus();
      
      expect(statusAfter.activeSecretId).not.toBe(statusBefore.activeSecretId);
      expect(statusAfter.totalSecrets).toBe(2);
      expect(statusAfter.activeSecretAge).toBeLessThan(100);
    });
  });
  
  describe('Metadata Export', () => {
    it('should export metadata without secrets', () => {
      // Create some rotations
      jwtManager.rotate();
      jwtManager.rotate();
      
      const metadata = jwtManager.exportMetadata();
      
      expect(metadata).toHaveLength(3);
      
      // Check that secrets are not exposed
      metadata.forEach(item => {
        expect(item).not.toHaveProperty('secret');
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('algorithm');
        expect(item).toHaveProperty('createdAt');
        expect(item).toHaveProperty('expiresAt');
        expect(item).toHaveProperty('isActive');
      });
      
      // Only one should be active
      const activeCount = metadata.filter(item => item.isActive).length;
      expect(activeCount).toBe(1);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle missing initial secret', () => {
      const manager = new JWTManager();
      const secret = manager.getActiveSecret();
      
      expect(secret).toBeDefined();
      expect(secret?.secret).toBeDefined();
      expect(secret?.secret.length).toBeGreaterThan(32);
    });
    
    it('should handle signing when no active secret', () => {
      // This shouldn't happen in practice, but test the error case
      const manager = new JWTManager();
      (manager as any).activeSecretId = null;
      
      expect(() => {
        manager.sign({ sub: 'user', exp: 0, jti: 'test' });
      }).toThrow('No active JWT secret available');
    });
    
    it('should handle concurrent rotations safely', async () => {
      // Simulate concurrent rotation attempts
      const rotationPromises = Array(5).fill(null).map(() => 
        new Promise(resolve => {
          setTimeout(() => {
            resolve(jwtManager.rotate());
          }, Math.random() * 100);
        })
      );
      
      const results = await Promise.all(rotationPromises);
      
      // Should have 6 secrets total (1 initial + 5 rotations)
      expect(jwtManager.getValidSecrets().length).toBe(6);
      
      // Only the last one should be active
      const activeSecrets = jwtManager.getValidSecrets().filter(s => s.isActive);
      expect(activeSecrets).toHaveLength(1);
    });
  });
});