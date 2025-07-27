/**
 * Rate limiting implementation for actors
 */
export class RateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private keyGenerator: (identifier: string) => string;
  private requests: Map<string, RequestRecord[]> = new Map();

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.keyGenerator = options.keyGenerator || ((id) => id);
  }

  async allow(identifier: string): Promise<boolean> {
    const key = this.keyGenerator(identifier);
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get or create request records for this key
    let records = this.requests.get(key) || [];
    
    // Remove expired records
    records = records.filter(r => r.timestamp > windowStart);
    
    // Check if limit exceeded
    if (records.length >= this.maxRequests) {
      this.requests.set(key, records);
      return false;
    }

    // Add new request
    records.push({ timestamp: now });
    this.requests.set(key, records);
    
    // Clean up old keys periodically
    if (Math.random() < 0.01) { // 1% chance
      this.cleanup();
    }

    return true;
  }

  reset(identifier?: string): void {
    if (identifier) {
      const key = this.keyGenerator(identifier);
      this.requests.delete(key);
    } else {
      this.requests.clear();
    }
  }

  getStatus(identifier: string): RateLimitStatus {
    const key = this.keyGenerator(identifier);
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    const records = (this.requests.get(key) || [])
      .filter(r => r.timestamp > windowStart);
    
    const remaining = Math.max(0, this.maxRequests - records.length);
    const resetTime = records.length > 0 
      ? new Date(records[0].timestamp + this.windowMs)
      : new Date(now + this.windowMs);

    return {
      limit: this.maxRequests,
      remaining,
      resetTime,
      windowMs: this.windowMs,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Remove keys with no recent requests
    const keysToDelete: string[] = [];
    
    this.requests.forEach((records, key) => {
      const activeRecords = records.filter(r => r.timestamp > windowStart);
      if (activeRecords.length === 0) {
        keysToDelete.push(key);
      } else {
        this.requests.set(key, activeRecords);
      }
    });
    
    keysToDelete.forEach(key => this.requests.delete(key));
  }
}

/**
 * Token bucket rate limiter for more sophisticated rate limiting
 */
export class TokenBucketRateLimiter {
  private capacity: number;
  private refillRate: number;
  private buckets: Map<string, TokenBucket> = new Map();
  private keyGenerator: (identifier: string) => string;

  constructor(options: TokenBucketOptions) {
    this.capacity = options.capacity;
    this.refillRate = options.refillRate;
    this.keyGenerator = options.keyGenerator || ((id) => id);
  }

  async allow(identifier: string, tokens: number = 1): Promise<boolean> {
    const key = this.keyGenerator(identifier);
    
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.capacity, this.refillRate);
      this.buckets.set(key, bucket);
    }

    return bucket.consume(tokens);
  }

  getStatus(identifier: string): TokenBucketStatus {
    const key = this.keyGenerator(identifier);
    const bucket = this.buckets.get(key);
    
    if (!bucket) {
      return {
        capacity: this.capacity,
        available: this.capacity,
        refillRate: this.refillRate,
        nextRefill: new Date(),
      };
    }

    return bucket.getStatus();
  }

  reset(identifier?: string): void {
    if (identifier) {
      const key = this.keyGenerator(identifier);
      this.buckets.delete(key);
    } else {
      this.buckets.clear();
    }
  }
}

class TokenBucket {
  private capacity: number;
  private tokens: number;
  private refillRate: number;
  private lastRefill: number;

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  consume(tokens: number): boolean {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = (timePassed / 1000) * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getStatus(): TokenBucketStatus {
    this.refill();
    
    const nextRefillMs = (1 / this.refillRate) * 1000;
    
    return {
      capacity: this.capacity,
      available: Math.floor(this.tokens),
      refillRate: this.refillRate,
      nextRefill: new Date(this.lastRefill + nextRefillMs),
    };
  }
}

// Type definitions
export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (identifier: string) => string;
}

export interface RateLimitStatus {
  limit: number;
  remaining: number;
  resetTime: Date;
  windowMs: number;
}

export interface TokenBucketOptions {
  capacity: number;
  refillRate: number; // tokens per second
  keyGenerator?: (identifier: string) => string;
}

export interface TokenBucketStatus {
  capacity: number;
  available: number;
  refillRate: number;
  nextRefill: Date;
}

interface RequestRecord {
  timestamp: number;
}