export interface CleanupResult {
  logs: string;
  errorCount: number;
}

export class DataManager {
  private cleanupQueue: Array<{ label: string; fn: () => Promise<void> }> = [];

  enqueue(label: string, fn: () => Promise<void>): void {
    this.cleanupQueue.push({ label, fn });
  }

  async cleanupAll(): Promise<CleanupResult> {
    if (this.cleanupQueue.length === 0) {
      return { logs: 'No cleanup tasks queued.', errorCount: 0 };
    }

    const logBuffer: string[] = [];
    const log = (msg: string) => {
      console.log(msg);
      logBuffer.push(msg);
    };
    const warn = (msg: string) => {
      console.warn(msg);
      logBuffer.push(msg);
    };

    const taskLabels = this.cleanupQueue.map((t, i) => `${i + 1}) ${t.label}`).join(' → ');
    log(`[cleanup] ${this.cleanupQueue.length} task(s): ${taskLabels}`);

    const errors: Error[] = [];
    const start = performance.now();

    for (const { label, fn } of this.cleanupQueue.reverse()) {
      try {
        log(`[cleanup] ${label}...`);
        await fn();
      } catch (error) {
        warn(`[cleanup] FAILED ${label}: ${(error as Error).message}`);
        errors.push(error as Error);
      }
    }

    this.cleanupQueue = [];
    const elapsed = ((performance.now() - start) / 1000).toFixed(1);

    if (errors.length > 0) {
      warn(
        `[cleanup] ${errors.length} task(s) failed (${elapsed}s):\n` +
          errors.map((e) => `  - ${e.message}`).join('\n'),
      );
    } else {
      log(`[cleanup] Done (${elapsed}s)`);
    }

    return {
      logs: logBuffer.join('\n'),
      errorCount: errors.length,
    };
  }
}
