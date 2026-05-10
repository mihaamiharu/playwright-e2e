import { test as base } from '@playwright/test';
import { DataManager } from '../utils/data-manager';
import { GitHubAPI } from '../utils/api-client';
import { env } from '../config/env.config';
import type { GitHubIssue } from '../utils/api-client';

/**
 * Data lifecycle fixtures — auto-seed and auto-cleanup.
 *
 * Any test that creates data (issues, repos, etc.) should use these fixtures.
 * The DataManager guarantees cleanup even when the test fails.
 */

export type DataLifecycleFixtures = {
  /** DataManager — enqueue cleanup tasks that always run after test */
  dataManager: DataManager;

  /**
   * Seeds a GitHub issue via API, returns it to the test,
   * and automatically closes it after (even on failure).
   *
   * Requires GITHUB_API_TOKEN and GITHUB_TEST_REPO in .env.
   */
  seededIssue: GitHubIssue;
};

export const test = base.extend<DataLifecycleFixtures>({
  dataManager: async (_params, use) => {
    const dm = new DataManager();
    await use(dm);
    // Runs AFTER the test — always, even if test throws
    await dm.cleanupAll();
  },

  seededIssue: async ({ request, dataManager }, use) => {
    if (!env.hasGitHubToken || !env.github.testRepo) {
      throw new Error('seededIssue fixture requires GITHUB_API_TOKEN and GITHUB_TEST_REPO in .env');
    }

    const api = new GitHubAPI(request);
    const title = `e2e-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const issue = await api.createIssue(env.github.testRepo, {
      title,
      body: '🤖 Auto-created by Playwright E2E test. Will be auto-closed.',
    });

    // Enqueue cleanup — guaranteed to run after test
    dataManager.enqueue(async () => {
      await api.closeIssue(env.github.testRepo, issue.number);
    });

    await use(issue);
  },
});

export { expect } from '@playwright/test';
