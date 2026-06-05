import { mergeTests, test as pwTest } from '@playwright/test';
import type { GitHubIssue } from '../utils/api/github-rest';
import { test as githubTest } from './github.fixture';
import { test as dataTest } from './project-data.fixture';
import { test as apiTest, requireSandbox } from './project-api.fixture';
import { test as pagesTest } from './pages.fixture';
import { attachAllureLabels } from '../utils/reporting/allure-labels';
import { env } from '../config/env.config';
import { ensureAuthCookies } from '../utils/auth/cookies';
import { buildIssueParams } from '../utils/testing/factories';

const logPrefix = (testInfo: { title: string }) => `[${testInfo.title}]`;

export const test = mergeTests(githubTest, dataTest, apiTest, pagesTest).extend<{
  sandbox: {
    projectId: string;
    statusFieldId: string;
    statusOptions: Map<string, string>;
  };
  scenarioId: string;
  seededProjectIssue: GitHubIssue & { projectItemId: string };
  _allureLabels: void;
}>({
  // eslint-disable-next-line no-empty-pattern
  scenarioId: async ({}, use) => {
    await use(crypto.randomUUID().split('-')[0]); // 8-char unique ID per scenario
  },

  page: async ({ page }, use) => {
    await ensureAuthCookies(page.context());
    await use(page);
  },

  sandbox: async ({ projectsAPI }, use, testInfo) => {
    requireSandbox();

    const { projectId, statusFieldId, statusOptions } = await pwTest.step(
      'Fixture: resolve sandbox project',
      () => projectsAPI.resolveProject(env.github.testRepoOwner, env.github.sandboxProjectNumber),
    );

    const statuses = [...statusOptions.keys()].join(', ');
    console.log(
      `${logPrefix(testInfo)} [sandbox] Resolved project "${env.github.sandboxProject}" (${projectId}), statuses: ${statuses}`,
    );

    await use({ projectId, statusFieldId, statusOptions });
  },

  seededProjectIssue: async (
    { githubAPI, projectsAPI, sandbox, dataManager, scenarioId },
    use,
    testInfo,
  ) => {
    requireSandbox();

    const result = await pwTest.step('Fixture: seed project issue', async () => {
      const params = buildIssueParams();
      params.title = `${params.title} [${scenarioId}]`; // Append scenarioId for filtering
      const issue = await githubAPI.createIssue(env.github.testRepo, {
        ...params,
        body: `🤖 Seeded by Playwright E2E test. Auto-cleaned. Run: ${params.title}`,
      });
      console.log(
        `${logPrefix(testInfo)} [seeder] Created issue #${issue.number}: "${params.title}"`,
      );

      dataManager.enqueue(`close issue #${issue.number}`, () =>
        githubAPI.closeIssue(env.github.testRepo, issue.number),
      );

      const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);
      console.log(
        `${logPrefix(testInfo)} [seeder] Added issue #${issue.number} to project ${sandbox.projectId}`,
      );

      const backlogOptionId = sandbox.statusOptions.get('Backlog');
      if (backlogOptionId) {
        await projectsAPI.setFieldValue(sandbox.projectId, projectItemId, sandbox.statusFieldId, {
          singleSelectOptionId: backlogOptionId,
        });
      }

      dataManager.enqueue(`remove issue #${issue.number} from project`, () =>
        projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId),
      );

      return { ...issue, projectItemId };
    });

    await use(result);
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
