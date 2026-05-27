import { mergeTests } from '@playwright/test';
import { test as githubTest } from './github.fixture';
import { test as projectTest } from './github-project.fixture';
import { attachAllureLabels } from '../utils/allure-labels';

export const test = mergeTests(githubTest, projectTest).extend<{ _allureLabels: void }>({
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
