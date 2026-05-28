import { mergeTests } from '@playwright/test';
import type { GitHubIssue } from '../utils/api/github-rest';
import { test as githubTest } from './github.fixture';
import { test as dataTest } from './project-data.fixture';
import { test as apiTest, requireSandbox } from './project-api.fixture';
import { test as pagesTest } from './pages.fixture';
import { attachAllureLabels } from '../utils/reporting/allure-labels';
import { env } from '../config/env.config';
import { ensureAuthCookies } from '../utils/auth/cookies';

const logPrefix = (testInfo: { title: string }) => `[${testInfo.title}]`;

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

  sandbox: async ({ projectsAPI }, use, testInfo) => {
    requireSandbox();

    const { projectId, statusFieldId, statusOptions } = await projectsAPI.resolveProject(
      env.github.testRepoOwner,
      env.github.sandboxProjectNumber,
    );

    const statuses = [...statusOptions.keys()].join(', ');
    console.log(
      `${logPrefix(testInfo)} [sandbox] Resolved project "${env.github.sandboxProject}" (${projectId}), statuses: ${statuses}`,
    );

    await use({ projectId, statusFieldId, statusOptions });
  },

  seededProjectIssue: async ({ githubAPI, projectsAPI, sandbox, dataManager }, use, testInfo) => {
    requireSandbox();

    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const title = `e2e-${uniqueId}`;
    const issue = await githubAPI.createIssue(env.github.testRepo, {
      title,
      body: `🤖 Seeded by Playwright E2E test. Auto-cleaned. Run: ${uniqueId}`,
    });
    console.log(`${logPrefix(testInfo)} [seeder] Created issue #${issue.number}: "${title}"`);

    const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);
    console.log(
      `${logPrefix(testInfo)} [seeder] Added issue #${issue.number} to project ${sandbox.projectId}`,
    );

    dataManager.enqueue(`close issue #${issue.number}`, () =>
      githubAPI.closeIssue(env.github.testRepo, issue.number),
    );
    dataManager.enqueue(`remove issue #${issue.number} from project`, () =>
      projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId),
    );

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
