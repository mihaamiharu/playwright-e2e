import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';

const { When } = createBdd(test);

When('the {string} field value should be {string} on the seeded issue via the API', async ({ projectsAPI, seededProjectIssue }, fieldName: string, expectedValue: string) => {
  const actualValue = await projectsAPI.getItemFieldValue(seededProjectIssue.projectItemId, fieldName);
  expect(actualValue).toBe(expectedValue);
});
