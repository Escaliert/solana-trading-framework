export class RateLimiter {
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private windowStart: number = 0;
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly minDelayMs: number;
  private consecutiveErrors: number = 0;
  private circuitBreakerUntil: number = 0;

  constructor(maxRequests: number = 5, windowMs: number = 60000, minDelayMs: number = 1500, conservative: boolean = true) {
    if (conservative) {
      // Ultra-conservative defaults for Solana public RPC
      this.maxRequests = Math.min(maxRequests, 5); // Never exceed 5 req per window
      this.windowMs = Math.max(windowMs, 30000); // Minimum 30 second windows
      this.minDelayMs = Math.max(minDelayMs, 3000); // Minimum 3 seconds between requests for RPC
    } else {
      // Jupiter rate limit: 1 request per second = 1500ms for safety
      this.maxRequests = maxRequests;
      this.windowMs = windowMs;
      this.minDelayMs = Math.max(minDelayMs, 1500); // Jupiter: 1.5 seconds between requests
    }
  }

  public async waitIfNeeded(): Promise<void> {
    const now = Date.now();

    // Check circuit breaker first
    if (now < this.circuitBreakerUntil) {
      const waitTime = this.circuitBreakerUntil - now;
      console.log(`🔴 Circuit breaker active. Waiting ${Math.round(waitTime / 1000)}s before retry...`);
      await this.sleep(waitTime);
      this.circuitBreakerUntil = 0;
      this.consecutiveErrors = 0;
    }

    // Reset window if it's been long enough
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.requestCount = 0;
      // Reset errors after successful window
      this.consecutiveErrors = Math.max(0, this.consecutiveErrors - 1);
    }

    // Check if we're hitting rate limits
    if (this.requestCount >= this.maxRequests) {
      const waitTime = this.windowMs - (now - this.windowStart);
      if (waitTime > 0) {
        console.log(`⏳ Rate limit reached. Waiting ${Math.round(waitTime / 1000)}s...`);
        await this.sleep(waitTime);
        this.windowStart = Date.now();
        this.requestCount = 0;
      }
    }

    // Ensure minimum delay between requests (with exponential backoff for errors)
    const baseDelay = this.minDelayMs;
    const errorMultiplier = Math.pow(2, Math.min(this.consecutiveErrors, 5)); // Cap at 32x
    const actualDelay = baseDelay * errorMultiplier;

    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < actualDelay) {
      const delayNeeded = actualDelay - timeSinceLastRequest;
      if (this.consecutiveErrors > 0) {
        console.log(`⚠️ Extended delay due to recent errors: ${Math.round(delayNeeded / 1000)}s...`);
      }
      await this.sleep(delayNeeded);
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public reset(): void {
    this.lastRequestTime = 0;
    this.requestCount = 0;
    this.windowStart = 0;
    this.consecutiveErrors = 0;
    this.circuitBreakerUntil = 0;
  }

  public recordError(): void {
    this.consecutiveErrors++;

    // Activate circuit breaker after 3 consecutive errors
    if (this.consecutiveErrors >= 3) {
      const breakerTime = 60000 * Math.pow(2, Math.min(this.consecutiveErrors - 3, 3)); // 1min, 2min, 4min, 8min max
      this.circuitBreakerUntil = Date.now() + breakerTime;
      console.log(`🔴 Circuit breaker activated for ${Math.round(breakerTime / 1000)}s after ${this.consecutiveErrors} consecutive errors`);
    }
  }

  public recordSuccess(): void {
    this.consecutiveErrors = Math.max(0, this.consecutiveErrors - 1);
  }
}

export class RetryManager {
  public static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 5000, // Start with 5 seconds instead of 1
    rateLimiter?: RateLimiter
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        // Record success if rate limiter provided
        if (rateLimiter) {
          rateLimiter.recordSuccess();
        }
        return result;
      } catch (error) {
        lastError = error as Error;

        // Record error if rate limiter provided
        if (rateLimiter) {
          rateLimiter.recordError();
        }

        // Check if it's a rate limiting error
        if (this.isRateLimitError(error)) {
          const delay = this.calculateBackoffDelay(attempt, initialDelay);
          console.log(`🔄 Rate limited. Retrying after ${Math.round(delay/1000)}s delay...`);
          await this.sleep(delay);
          continue;
        }

        // For non-rate-limit errors, don't retry immediately
        if (attempt < maxRetries) {
          const delay = this.calculateBackoffDelay(attempt, 2000); // 2s base for non-rate-limit errors
          console.log(`⚠️ Request failed, retrying after ${Math.round(delay/1000)}s...`);
          await this.sleep(delay);
          continue;
        }

        throw error;
      }
    }

    throw lastError!;
  }

  private static isRateLimitError(error: any): boolean {
    if (error?.response?.status === 429) return true;
    if (error?.message?.includes('429')) return true;
    if (error?.message?.includes('Too Many Requests')) return true;
    if (error?.message?.includes('rate limit')) return true;
    return false;
  }

  private static calculateBackoffDelay(attempt: number, initialDelay: number): number {
    // Exponential backoff with jitter
    const baseDelay = initialDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * baseDelay;
    return Math.min(baseDelay + jitter, 30000); // Max 30 seconds
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}