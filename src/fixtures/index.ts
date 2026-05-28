import { mergeTests } from '@playwright/test';
import type { GitHubIssue } from '../utils/api/github-rest';
import { test as githubTest } from './github.fixture';
import { test as dataTest } from './project-data.fixture';
import { test as apiTest, requireSandbox } from './project-api.fixture';
import { test as pagesTest } from './pages.fixture';
import { attachAllureLabels } from '../utils/reporting/allure-labels';
import { env } from '../config/env.config';
import { ensureAuthCookies } from '../utils/auth/cookies';

export const test = mergeTests(githubTest, dataTest, apiTest, pagesTest).extend<{
  sandbox: {
    projectId: string;
    statusFieldId: string;
    statusOptions: Map<string, string>;
  };
  seededProjectIssue: GitHubIssue & { projectItemId: string };
  _allureLabels: void;
}>({
  page: async ({ page }, use) => {
    await ensureAuthCookies(page.context());
    await use(page);
  },

  sandbox: async ({ projectsAPI }, use) => {
    requireSandbox();

    const { projectId, statusFieldId, statusOptions } = await projectsAPI.resolveProject(
      env.github.testRepoOwner,
      env.github.sandboxProjectNumber,
    );

    console.log(
      `[sandbox] Resolved project "${env.github.sandboxProject}" (${projectId}), ` +
        `statuses: ${[...statusOptions.keys()].join(', ')}`,
    );

    await use({ projectId, statusFieldId, statusOptions });
  },

  seededProjectIssue: async ({ githubAPI, projectsAPI, sandbox, dataManager }, use) => {
    requireSandbox();

    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const title = `e2e-${uniqueId}`;
    const issue = await githubAPI.createIssue(env.github.testRepo, {
      title,
      body: `🤖 Seeded by Playwright E2E test. Auto-cleaned. Run: ${uniqueId}`,
    });
    console.log(`[seeder] Created issue #${issue.number}: "${title}"`);

    const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);
    console.log(`[seeder] Added issue #${issue.number} to project ${sandbox.projectId}`);

    dataManager.enqueue(async () => {
      console.log(`[cleanup] Removing issue #${issue.number} from project`);
      await projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId);
    });
    dataManager.enqueue(async () => {
      console.log(`[cleanup] Closing issue #${issue.number}`);
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
    });

    await use({ ...issue, projectItemId });
  },

  _allureLabels: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      await attachAllureLabels(testInfo.tags, testInfo);
      await use();
    },
    { auto: true },
  ],
});
