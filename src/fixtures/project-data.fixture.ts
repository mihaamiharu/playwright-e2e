import { test as base } from 'playwright-bdd';
import { test as pwTest } from '@playwright/test';
import { DataManager } from '../utils/testing/data-manager';
import { ScenarioContext } from '../utils/testing/scenario-context';

export type ProjectDataFixtures = {
  dataManager: DataManager;
  scenarioContext: ScenarioContext;
};

export const test = base.extend<ProjectDataFixtures>({
  dataManager: async ({ page: _page }, use, testInfo) => {
    const dm = new DataManager();
    await use(dm);
    const result = await pwTest.step('DataManager: LIFO cleanup', () => dm.cleanupAll());
    await testInfo.attach('cleanup-log', {
      body: result.logs,
      contentType: 'text/plain',
    });
  },

  // eslint-disable-next-line no-empty-pattern
  scenarioContext: async ({}, use) => {
    await use(new ScenarioContext());
  },
});
