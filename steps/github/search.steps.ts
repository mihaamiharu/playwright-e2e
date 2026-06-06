import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

const { When } = createBdd(test);

When(
  'I search the project by title for issue {string}',
  async ({ page, projectFilterBar, scenarioContext }, key) => {
    const issue = scenarioContext.get<SeededIssue>(key);

    await projectFilterBar.open();
    await projectFilterBar.typeSearch(issue.title);
    await projectFilterBar.save();

    await page.waitForURL(/filterQuery=/);
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  },
);
