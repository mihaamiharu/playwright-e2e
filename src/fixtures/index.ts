import { mergeTests, test as pwTest } from '@playwright/test';
import { test as githubTest } from './github.fixture';
import { test as dataTest } from './project-data.fixture';
import { test as apiTest, requireSandbox } from './project-api.fixture';
import { test as pagesTest } from './pages.fixture';
import { attachAllureLabels } from '../utils/reporting/allure-labels';
import { env } from '../config/env.config';
import { ensureAuthCookies } from '../utils/auth/cookies';
import { DataManager } from '../utils/testing/data-manager';
import { getTableViewNumber } from '../config/setup/sandbox-bootstrap';
import { ProjectBoardPage } from '../pages/github/ProjectBoardPage';
import { TableViewPage } from '../pages/github/TableViewPage';
import { logged } from './pages.fixture';

const logPrefix = (testInfo: { title: string }) => `[${testInfo.title}]`;

export const test = mergeTests(githubTest, dataTest, apiTest, pagesTest).extend<{
  sandbox: {
    projectId: string;
    statusFieldId: string;
    statusOptions: Map<string, string>;
    boardViewNumber: number;
    tableViewNumber: number;
  };
  scenarioId: string;
  dataManager: DataManager;
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

    const boardViewNumber = 1;
    const tableViewNumber = getTableViewNumber() ?? 2;

    const statuses = [...statusOptions.keys()].join(', ');
    console.log(
      `${logPrefix(testInfo)} [sandbox] Resolved project "${env.github.sandboxProject}" (${projectId}), statuses: ${statuses}, views: board=${boardViewNumber} table=${tableViewNumber}`,
    );

    await use({ projectId, statusFieldId, statusOptions, boardViewNumber, tableViewNumber });
  },

  dataManager: async ({ githubAPI: _githubAPI, projectsAPI: _projectsAPI }, use, testInfo) => {
    const dm = new DataManager();
    await use(dm);
    const result = await pwTest.step('DataManager: LIFO cleanup', () => dm.cleanupAll());
    await testInfo.attach('cleanup-log', {
      body: result.logs,
      contentType: 'text/plain',
    });
  },

  _allureLabels: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      await attachAllureLabels(testInfo.tags, testInfo);
      await use();
    },
    { auto: true },
  ],

  projectBoardPage: async ({ page, sandbox }, use) => {
    await use(
      logged(
        new ProjectBoardPage(
          page,
          env.github.testRepoOwner,
          String(env.github.sandboxProjectNumber),
          sandbox.boardViewNumber,
        ),
        'ProjectBoardPage',
      ),
    );
  },

  tableViewPage: async ({ page, sandbox }, use) => {
    await use(logged(new TableViewPage(page, sandbox.tableViewNumber), 'TableViewPage'));
  },
});
