/**
 * DataManager — guaranteed cleanup queue for E2E test data lifecycle.
 *
 * Every test that creates resources via API enqueues a cleanup task.
 * The DataManager runs ALL enqueued tasks after each test, even if the test fails.
 * This prevents test pollution between runs.
 */
export class DataManager {
  private cleanupQueue: Array<() => Promise<void>> = [];

  /** Enqueue a cleanup function. It WILL run — even if the test throws. */
  enqueue(fn: () => Promise<void>): void {
    this.cleanupQueue.push(fn);
  }

  /** Run all enqueued cleanup tasks in reverse order (LIFO). */
  async cleanupAll(): Promise<void> {
    if (this.cleanupQueue.length === 0) return;

    // eslint-disable-next-line no-console
    console.log(`[cleanup] Running ${this.cleanupQueue.length} task(s)...`);

    const errors: Error[] = [];

    // Reverse — cleanup in opposite order of creation (child resources first)
    for (const fn of this.cleanupQueue.reverse()) {
      try {
        await fn();
      } catch (error) {
        // Don't let one cleanup failure block the rest
        errors.push(error as Error);
      }
    }

    this.cleanupQueue = [];

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `DataManager: ${errors.length} cleanup task(s) failed:\n` +
          errors.map((e) => `  - ${e.message}`).join('\n'),
      );
    } else {
      // eslint-disable-next-line no-console
      console.log('[cleanup] Done');
    }
  }
}
