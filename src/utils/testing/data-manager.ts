export class DataManager {
  private cleanupQueue: Array<{ label: string; fn: () => Promise<void> }> = [];

  enqueue(label: string, fn: () => Promise<void>): void {
    this.cleanupQueue.push({ label, fn });
  }

  async cleanupAll(): Promise<void> {
    if (this.cleanupQueue.length === 0) return;

    const taskLabels = this.cleanupQueue.map((t, i) => `${i + 1}) ${t.label}`).join(' → ');
    console.log(`[cleanup] ${this.cleanupQueue.length} task(s): ${taskLabels}`);

    const errors: Error[] = [];
    const start = performance.now();

    for (const { label, fn } of this.cleanupQueue.reverse()) {
      try {
        console.log(`[cleanup] ${label}...`);
        await fn();
      } catch (error) {
        errors.push(error as Error);
      }
    }

    this.cleanupQueue = [];
    const elapsed = ((performance.now() - start) / 1000).toFixed(1);

    if (errors.length > 0) {
      console.warn(
        `[cleanup] ${errors.length} task(s) failed (${elapsed}s):\n` +
          errors.map((e) => `  - ${e.message}`).join('\n'),
      );
    } else {
      console.log(`[cleanup] Done (${elapsed}s)`);
    }
  }
}
