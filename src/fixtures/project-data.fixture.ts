import { test as base } from 'playwright-bdd';
import { DataManager } from '../utils/testing/data-manager';
import { ScenarioContext } from '../utils/testing/scenario-context';

export type ProjectDataFixtures = {
  dataManager: DataManager;
  scenarioContext: ScenarioContext;
};

export const test = base.extend<ProjectDataFixtures>({
  // eslint-disable-next-line no-empty-pattern
  dataManager: async ({}, use) => {
    const dm = new DataManager();
    await use(dm);
    await dm.cleanupAll();
  },

  // eslint-disable-next-line no-empty-pattern
  scenarioContext: async ({}, use) => {
    await use(new ScenarioContext());
  },
});
