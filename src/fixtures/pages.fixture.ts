import { test as base } from 'playwright-bdd';
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

export type PageFixtures = {
  issuePage: IssuePage;
  labelsPanel: LabelsPanel;
  assigneePanel: AssigneePanel;
  milestonePanel: MilestonePanel;
  projectBoardPage: ProjectBoardPage;
  boardView: BoardView;
  tableViewPage: TableViewPage;
  savedViews: SavedViews;
  projectFilterBar: ProjectSearchBar;
};

export const test = base.extend<PageFixtures>({
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
});
