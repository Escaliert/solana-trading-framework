export class RateLimiter {
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private windowStart: number = 0;
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly minDelayMs: number;

  constructor(maxRequests: number = 5, windowMs: number = 60000, minDelayMs: number = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.minDelayMs = minDelayMs;
  }

  public async waitIfNeeded(): Promise<void> {
    const now = Date.now();

    // Reset window if it's been long enough
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.requestCount = 0;
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

    // Ensure minimum delay between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minDelayMs) {
      const delayNeeded = this.minDelayMs - timeSinceLastRequest;
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
  }
}

export class RetryManager {
  public static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Check if it's a rate limiting error
        if (this.isRateLimitError(error)) {
          const delay = this.calculateBackoffDelay(attempt, initialDelay);
          console.log(`🔄 Rate limited. Retrying after ${delay}ms delay...`);
          await this.sleep(delay);
          continue;
        }

        // For non-rate-limit errors, don't retry
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