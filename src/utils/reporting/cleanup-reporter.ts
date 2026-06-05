import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

class CleanupReporter implements Reporter {
  private failedCleanups: Array<{ title: string; log: string }> = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    const cleanupAttachment = result.attachments.find((a) => a.name === 'cleanup-log');

    if (cleanupAttachment && cleanupAttachment.body) {
      const logBody = cleanupAttachment.body.toString('utf-8');
      if (logBody.includes('FAILED')) {
        this.failedCleanups.push({
          title: test.title,
          log: logBody,
        });
      }
    }
  }

  onEnd(): void {
    if (this.failedCleanups.length === 0) {
      return;
    }

    console.log(
      '\n================================================================================',
    );
    console.log('⚠️  DATA MANAGER CLEANUP FAILURES DETECTED');
    console.log('================================================================================');
    console.log(
      `There were ${this.failedCleanups.length} test(s) where cleanup data was orphaned.\n`,
    );

    for (const failure of this.failedCleanups) {
      console.log(`Test: "${failure.title}"`);
      // Extract just the failed lines to keep the summary concise
      const failedLines = failure.log
        .split('\n')
        .filter((line) => line.includes('FAILED'))
        .join('\n');
      console.log(`${failedLines}\n`);
    }

    console.log(
      'To view full cleanup logs, check the Allure report attachments for the tests above.',
    );
    console.log(
      '================================================================================\n',
    );
  }
}

export default CleanupReporter;
