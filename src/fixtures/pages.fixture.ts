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

const LOG_PAGE_ACTIONS = process.env.LOG_PAGE_ACTIONS !== 'false';
const SENSITIVE_METHODS = new Set(['login']);

export function logged<T extends object>(instance: T, className: string): T {
  if (!LOG_PAGE_ACTIONS) return instance;
  return new Proxy(instance, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function' && prop !== 'constructor') {
        return (...args: unknown[]) => {
          const a =
            args.length > 0 && !SENSITIVE_METHODS.has(prop as string)
              ? ` ${args.map((a) => JSON.stringify(a)).join(', ')}`
              : '';
          console.log(`  [page] ${className}.${String(prop)}${a}`);
          return value.apply(target, args);
        };
      }
      return value;
    },
  });
}

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
    await use(logged(new IssuePage(page), 'IssuePage'));
  },
  labelsPanel: async ({ page }, use) => {
    await use(logged(new LabelsPanel(page), 'LabelsPanel'));
  },
  assigneePanel: async ({ page }, use) => {
    await use(logged(new AssigneePanel(page), 'AssigneePanel'));
  },
  milestonePanel: async ({ page }, use) => {
    await use(logged(new MilestonePanel(page), 'MilestonePanel'));
  },
  projectBoardPage: async ({ page }, use) => {
    await use(
      logged(
        new ProjectBoardPage(
          page,
          env.github.testRepoOwner,
          String(env.github.sandboxProjectNumber),
        ),
        'ProjectBoardPage',
      ),
    );
  },
  boardView: async ({ page }, use) => {
    await use(logged(new BoardView(page), 'BoardView'));
  },
  tableViewPage: async ({ page }, use) => {
    await use(logged(new TableViewPage(page), 'TableViewPage'));
  },
  savedViews: async ({ page }, use) => {
    await use(logged(new SavedViews(page), 'SavedViews'));
  },
  projectFilterBar: async ({ page }, use) => {
    await use(logged(new ProjectSearchBar(page), 'ProjectSearchBar'));
  },
});
