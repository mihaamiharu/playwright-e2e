import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

const { When } = createBdd(test);

When(
  'the {string} field should be {string} on issue {string} via API',
  async (
    { projectsAPI, scenarioContext },
    fieldName: string,
    expectedValue: string,
    key: string,
  ) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    const actualValue = await projectsAPI.getItemFieldValue(issue.projectItemId, fieldName);
    expect(actualValue).toBe(expectedValue);
  },
);
