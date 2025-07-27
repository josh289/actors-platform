import { nanoid } from 'nanoid';
import { createHash } from 'crypto';

export interface JWTSecret {
  id: string;
  secret: string;
  algorithm: 'HS256' | 'HS384' | 'HS512';
  createdAt: Date;
  expiresAt: Date;
  rotatedAt?: Date;
  isActive: boolean;
}

export interface JWTPayload {
  sub: string; // userId
  iat: number; // issued at
  exp: number; // expires at
  jti: string; // JWT ID
  sid?: string; // session ID
  kid?: string; // key ID
}

export class JWTManager {
  private secrets: Map<string, JWTSecret> = new Map();
  private activeSecretId: string | null = null;
  private rotationInterval: number = 30 * 24 * 60 * 60 * 1000; // 30 days
  private secretLifetime: number = 90 * 24 * 60 * 60 * 1000; // 90 days
  
  constructor(private readonly config: {
    rotationInterval?: number;
    secretLifetime?: number;
    initialSecret?: string;
  } = {}) {
    if (config.rotationInterval) {
      this.rotationInterval = config.rotationInterval;
    }
    if (config.secretLifetime) {
      this.secretLifetime = config.secretLifetime;
    }
    
    // Initialize with a secret
    this.initializeSecret(config.initialSecret);
  }
  
  private initializeSecret(providedSecret?: string): void {
    const secret = providedSecret || this.generateSecret();
    const secretId = this.generateSecretId();
    
    this.secrets.set(secretId, {
      id: secretId,
      secret,
      algorithm: 'HS256',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.secretLifetime),
      isActive: true,
    });
    
    this.activeSecretId = secretId;
  }
  
  private generateSecret(): string {
    // Generate a cryptographically secure random secret
    const parts = [
      nanoid(32),
      Date.now().toString(36),
      nanoid(32),
    ];
    
    return createHash('sha512')
      .update(parts.join('-'))
      .digest('base64');
  }
  
  private generateSecretId(): string {
    return `jwt_secret_${Date.now()}_${nanoid(8)}`;
  }
  
  /**
   * Get the active secret for signing new JWTs
   */
  getActiveSecret(): JWTSecret | null {
    if (!this.activeSecretId) return null;
    return this.secrets.get(this.activeSecretId) || null;
  }
  
  /**
   * Get a secret by ID for verification
   */
  getSecret(secretId: string): JWTSecret | null {
    return this.secrets.get(secretId) || null;
  }
  
  /**
   * Get all non-expired secrets for verification
   */
  getValidSecrets(): JWTSecret[] {
    const now = new Date();
    return Array.from(this.secrets.values()).filter(
      secret => secret.expiresAt > now
    );
  }
  
  /**
   * Check if rotation is needed
   */
  shouldRotate(): boolean {
    const activeSecret = this.getActiveSecret();
    if (!activeSecret) return true;
    
    const rotationDue = new Date(
      activeSecret.createdAt.getTime() + this.rotationInterval
    );
    
    return new Date() > rotationDue;
  }
  
  /**
   * Rotate to a new secret
   */
  rotate(): JWTSecret {
    // Mark current secret as inactive but keep for verification
    if (this.activeSecretId) {
      const currentSecret = this.secrets.get(this.activeSecretId);
      if (currentSecret) {
        currentSecret.isActive = false;
        currentSecret.rotatedAt = new Date();
      }
    }
    
    // Generate new secret
    const newSecret = this.generateSecret();
    const newSecretId = this.generateSecretId();
    
    const jwtSecret: JWTSecret = {
      id: newSecretId,
      secret: newSecret,
      algorithm: 'HS256',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.secretLifetime),
      isActive: true,
    };
    
    this.secrets.set(newSecretId, jwtSecret);
    this.activeSecretId = newSecretId;
    
    // Clean up expired secrets
    this.cleanupExpiredSecrets();
    
    return jwtSecret;
  }
  
  /**
   * Clean up expired secrets
   */
  private cleanupExpiredSecrets(): void {
    const now = new Date();
    const expiredIds: string[] = [];
    
    for (const [id, secret] of this.secrets.entries()) {
      if (secret.expiresAt < now && !secret.isActive) {
        expiredIds.push(id);
      }
    }
    
    for (const id of expiredIds) {
      this.secrets.delete(id);
    }
  }
  
  /**
   * Sign a JWT payload
   */
  sign(payload: Omit<JWTPayload, 'iat' | 'kid'>): string {
    const activeSecret = this.getActiveSecret();
    if (!activeSecret) {
      throw new Error('No active JWT secret available');
    }
    
    const fullPayload: JWTPayload = {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      kid: activeSecret.id,
    };
    
    // Simple JWT implementation for demonstration
    // In production, use a proper JWT library
    const header = {
      alg: activeSecret.algorithm,
      typ: 'JWT',
      kid: activeSecret.id,
    };
    
    const encodedHeader = this.base64urlEncode(JSON.stringify(header));
    const encodedPayload = this.base64urlEncode(JSON.stringify(fullPayload));
    
    const signature = this.createSignature(
      `${encodedHeader}.${encodedPayload}`,
      activeSecret.secret
    );
    
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }
  
  /**
   * Verify a JWT
   */
  verify(token: string): { valid: boolean; payload?: JWTPayload; error?: string } {
    try {
      const [encodedHeader, encodedPayload, signature] = token.split('.');
      
      if (!encodedHeader || !encodedPayload || !signature) {
        return { valid: false, error: 'Invalid token format' };
      }
      
      // Decode header to get key ID
      const header = JSON.parse(this.base64urlDecode(encodedHeader));
      const payload = JSON.parse(this.base64urlDecode(encodedPayload)) as JWTPayload;
      
      // Check expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'Token expired' };
      }
      
      // Find the secret used to sign this token
      const secret = header.kid ? this.getSecret(header.kid) : null;
      if (!secret) {
        // Try all valid secrets if no kid specified
        const validSecrets = this.getValidSecrets();
        for (const validSecret of validSecrets) {
          const expectedSignature = this.createSignature(
            `${encodedHeader}.${encodedPayload}`,
            validSecret.secret
          );
          
          if (signature === expectedSignature) {
            return { valid: true, payload };
          }
        }
        
        return { valid: false, error: 'Invalid signature' };
      }
      
      // Verify signature with specific secret
      const expectedSignature = this.createSignature(
        `${encodedHeader}.${encodedPayload}`,
        secret.secret
      );
      
      if (signature !== expectedSignature) {
        return { valid: false, error: 'Invalid signature' };
      }
      
      return { valid: true, payload };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Token verification failed' 
      };
    }
  }
  
  /**
   * Get rotation status
   */
  getRotationStatus(): {
    activeSecretId: string | null;
    activeSecretAge: number | null;
    nextRotation: Date | null;
    totalSecrets: number;
    expiredSecrets: number;
  } {
    const activeSecret = this.getActiveSecret();
    const now = new Date();
    
    let expiredCount = 0;
    for (const secret of this.secrets.values()) {
      if (secret.expiresAt < now) {
        expiredCount++;
      }
    }
    
    return {
      activeSecretId: this.activeSecretId,
      activeSecretAge: activeSecret 
        ? now.getTime() - activeSecret.createdAt.getTime() 
        : null,
      nextRotation: activeSecret 
        ? new Date(activeSecret.createdAt.getTime() + this.rotationInterval)
        : null,
      totalSecrets: this.secrets.size,
      expiredSecrets: expiredCount,
    };
  }
  
  /**
   * Export secrets for backup (excluding the actual secret values)
   */
  exportMetadata(): Array<{
    id: string;
    algorithm: string;
    createdAt: Date;
    expiresAt: Date;
    isActive: boolean;
    rotatedAt?: Date;
  }> {
    return Array.from(this.secrets.values()).map(secret => ({
      id: secret.id,
      algorithm: secret.algorithm,
      createdAt: secret.createdAt,
      expiresAt: secret.expiresAt,
      isActive: secret.isActive,
      rotatedAt: secret.rotatedAt,
    }));
  }
  
  // Helper methods
  private base64urlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }
  
  private base64urlDecode(str: string): string {
    str += '='.repeat((4 - str.length % 4) % 4);
    return Buffer.from(
      str.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString();
  }
  
  private createSignature(data: string, secret: string): string {
    // Simple HMAC-SHA256 implementation
    // In production, use crypto.createHmac
    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }
}