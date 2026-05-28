import { mergeTests } from '@playwright/test';
import { test as githubTest } from './github.fixture';
import { test as projectTest } from './github-project.fixture';
import { attachAllureLabels } from '../utils/reporting/allure-labels';
import { IssuePage } from '../pages/github/IssuePage';
import { ProjectBoardPage } from '../pages/github/ProjectBoardPage';
import { TableViewPage } from '../pages/github/TableViewPage';
import { ProjectSearchBar } from '../pages/github/filters/ProjectSearchBar';
import { LabelsPanel } from '../pages/github/panels/LabelsPanel';
import { AssigneePanel } from '../pages/github/panels/AssigneePanel';
import { MilestonePanel } from '../pages/github/panels/MilestonePanel';
import { BoardView } from '../pages/github/views/BoardView';
import { SavedViews } from '../pages/github/views/SavedViews';
import { env } from '../config/env.config';

export const test = mergeTests(githubTest, projectTest).extend<{
  issuePage: IssuePage;
  labelsPanel: LabelsPanel;
  assigneePanel: AssigneePanel;
  milestonePanel: MilestonePanel;
  projectBoardPage: ProjectBoardPage;
  boardView: BoardView;
  tableViewPage: TableViewPage;
  savedViews: SavedViews;
  projectFilterBar: ProjectSearchBar;
  _allureLabels: void;
}>({
  issuePage: async ({ page }, use) => {
    await use(new IssuePage(page));
  },
  labelsPanel: async ({ page }, use) => {
    await use(new LabelsPanel(page));
  },
  assigneePanel: async ({ page }, use) => {
    await use(new AssigneePanel(page));
  },
  milestonePanel: async ({ page }, use) => {
    await use(new MilestonePanel(page));
  },
  projectBoardPage: async ({ page }, use) => {
    await use(
      new ProjectBoardPage(page, env.github.testRepoOwner, String(env.github.sandboxProjectNumber)),
    );
  },
  boardView: async ({ page }, use) => {
    await use(new BoardView(page));
  },
  tableViewPage: async ({ page }, use) => {
    await use(new TableViewPage(page));
  },
  savedViews: async ({ page }, use) => {
    await use(new SavedViews(page));
  },
  projectFilterBar: async ({ page }, use) => {
    await use(new ProjectSearchBar(page));
  },
  // Auto-fixture to attach Allure labels from Gherkin tags before every test runs
  _allureLabels: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      await attachAllureLabels(testInfo.tags);
      await use();
    },
    { auto: true },
  ],
});
