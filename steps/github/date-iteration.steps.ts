import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

const { When } = createBdd(test);

When(
  'the {string} field value should be {string} on the seeded issue via the API',
  async ({ projectsAPI, scenarioContext }, fieldName: string, expectedValue: string) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    const actualValue = await projectsAPI.getItemFieldValue(
      seededIssue.projectItemId,
      fieldName,
    );
    expect(actualValue).toBe(expectedValue);
  },
);
