import { isRetryableError, type RetryStrategy } from "./retry-strategy";

export class ExponentialBackoffStrategy implements RetryStrategy {
  constructor(
    public maxAttempts = 3,
    public baseDelay = 100,
    private maxDelay = 5000,
    private jitter = true,
  ) {}

  shouldRetry(error: unknown, attempt: number): boolean {
    return attempt < this.maxAttempts && isRetryableError(error);
  }

  getDelay(attempt: number): number {
    const delay = Math.min(this.baseDelay * attempt ** 2, this.maxDelay);

    if (!this.jitter) return delay;

    // Add random jitter to prevent thundering herd
    return delay * (0.5 + Math.random());
  }
}
