import { test as base } from 'playwright-bdd';
import { ScenarioContext } from '../utils/testing/scenario-context';

export type ProjectDataFixtures = {
  scenarioContext: ScenarioContext;
};

export const test = base.extend<ProjectDataFixtures>({
  // eslint-disable-next-line no-empty-pattern
  scenarioContext: async ({}, use) => {
    await use(new ScenarioContext());
  },
});
