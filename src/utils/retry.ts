export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  onRetry?: (error: Error, attempt: number, maxAttempts: number) => void;
  retryable?: (error: Error) => boolean;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelay = options?.baseDelay ?? 1000;
  const onRetry = options?.onRetry;
  const retryable = options?.retryable;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      if (retryable && !retryable(error as Error)) throw error;

      if (onRetry) {
        onRetry(error as Error, attempt, maxAttempts);
      }

      await new Promise((r) => setTimeout(r, baseDelay * attempt));
    }
  }

  throw new Error('Unreachable');
}
