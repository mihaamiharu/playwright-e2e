import { mergeTests } from '@playwright/test';
import { test as githubTest } from './github.fixture';
import { test as projectTest } from './github-project.fixture';
import { attachAllureLabels } from '../utils/allure-labels';
import { IssuePage } from '../pages/github/IssuePage';
import { ProjectBoardPage } from '../pages/github/ProjectBoardPage';
import { TableViewPage } from '../pages/github/TableViewPage';
import { ProjectFilterBar } from '../pages/github/ProjectFilterBar';
import { env } from '../config/env.config';

export const test = mergeTests(githubTest, projectTest).extend<{
  issuePage: IssuePage;
  projectBoardPage: ProjectBoardPage;
  tableViewPage: TableViewPage;
  projectFilterBar: ProjectFilterBar;
  _allureLabels: void;
}>({
  issuePage: async ({ page }, use) => {
    await use(new IssuePage(page));
  },
  projectBoardPage: async ({ page }, use) => {
    await use(
      new ProjectBoardPage(page, env.github.testRepoOwner, String(env.github.sandboxProjectNumber)),
    );
  },
  tableViewPage: async ({ page }, use) => {
    await use(new TableViewPage(page));
  },
  projectFilterBar: async ({ page }, use) => {
    await use(new ProjectFilterBar(page));
  },
  // Auto-fixture to attach Allure labels from Gherkin tags before every test runs
  _allureLabels: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      await attachAllureLabels(testInfo.tags, testInfo);
      await use();
    },
    { auto: true },
  ],
});
