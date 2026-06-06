import { createBdd, DataTable } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';
import { seedAdditionalIssue } from '../../src/utils/testing/issue-seeder';
import { uniqueTestTitle } from '../../src/utils/testing/factories';

const { Given, When, Then } = createBdd(test);

async function resolveFieldValue(
  projectsAPI: import('../../src/utils/api/github-graphql').GitHubProjectsAPI,
  sandbox: import('../../src/utils/testing/issue-seeder').SandboxConfig,
  fieldName: string,
  value: string,
) {
  const fields = await projectsAPI.getFields(sandbox.projectId);
  const field = fields.find((f) => f.name === fieldName);
  if (!field) throw new Error(`Field "${fieldName}" not found`);

  let fieldValue: import('../../src/utils/api/github-graphql').ItemFieldValue;

  if (field.options) {
    const option = field.options.find((o) => o.name === value);
    if (!option) throw new Error(`Option "${value}" not found for field "${fieldName}"`);
    fieldValue = { singleSelectOptionId: option.id };
  } else if (field.type === 'Date') {
    fieldValue = { date: value };
  } else if (field.type === 'Iteration') {
    if (!field.iterations) throw new Error(`Field "${fieldName}" has no iterations`);
    const iteration = field.iterations.find((i) => i.title === value);
    if (!iteration) throw new Error(`Iteration "${value}" not found in field "${fieldName}"`);
    fieldValue = { iterationId: iteration.id };
  } else {
    const num = Number(value);
    fieldValue = Number.isNaN(num) ? { text: value } : { number: num };
  }

  return { field, fieldValue };
}

When(
  'I set the {string} field to {string} on issue {string} via the API',
  async ({ projectsAPI, sandbox, scenarioContext }, fieldName: string, value: string, key) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    const { field, fieldValue } = await resolveFieldValue(projectsAPI, sandbox, fieldName, value);

    await projectsAPI.setFieldValue(sandbox.projectId, issue.projectItemId, field.id, fieldValue);
  },
);

Then(
  'issue {string} should show {string} in the {string} column',
  async ({ projectsAPI, scenarioContext }, key, value: string, fieldName: string) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    const actualValue = await projectsAPI.getItemFieldValue(issue.projectItemId, fieldName);
    expect(actualValue).toBe(value);
  },
);

Given(
  'the following issues exist with {string} values in the sandbox project:',
  async (
    { githubAPI, projectsAPI, sandbox, dataManager, scenarioContext, scenarioId },
    fieldName: string,
    data: DataTable,
  ) => {
    const rows = data.hashes();
    for (const row of rows) {
      const title = `${uniqueTestTitle(row.key)} [${scenarioId}]`;
      const value = row[fieldName];
      if (!value) {
        throw new Error(`Column "${fieldName}" not found in data table`);
      }

      const issue = await seedAdditionalIssue(
        githubAPI,
        projectsAPI,
        sandbox,
        dataManager,
        scenarioContext,
        {
          title,
          body: `Custom field filter test issue ${row.key}`,
          key: row.key,
        },
      );

      const { field, fieldValue } = await resolveFieldValue(projectsAPI, sandbox, fieldName, value);
      await projectsAPI.setFieldValue(sandbox.projectId, issue.projectItemId, field.id, fieldValue);
    }
  },
);

When(
  'I filter the table by {string} {string}',
  async ({ page, projectFilterBar, tableViewPage }, fieldName: string, optionName: string) => {
    await projectFilterBar.open();
    await projectFilterBar.selectType(fieldName);
    await page.waitForURL(new RegExp(`filterQuery=${fieldName.toLowerCase()}`));

    await projectFilterBar.selectOption(optionName, fieldName);
    await projectFilterBar.save();
    await page.waitForURL(new RegExp(`filterQuery=${fieldName.toLowerCase()}%3A`));

    const option = page.getByRole('option', { name: new RegExp(`${optionName}, ${fieldName}`) });
    await projectFilterBar.close(option);
    await expect(tableViewPage.grid).toBeVisible();
  },
);
