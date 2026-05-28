import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';

const { Given, When, Then } = createBdd(test);

// ── FLD-01 ──────────────────────────────────────────────────

When(
  'I set the {string} field to {string} on the seeded issue via the API',
  async ({ projectsAPI, sandbox, seededProjectIssue }, fieldName: string, value: string) => {
    const fields = await projectsAPI.getFields(sandbox.projectId);
    const field = fields.find((f) => f.name === fieldName);
    if (!field) throw new Error(`Field "${fieldName}" not found`);

    let fieldValue: import('../../src/utils/api/github-graphql').ItemFieldValue;

    if (field.options) {
      // SingleSelect
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
      // Text / Number — detect numeric
      const num = Number(value);
      fieldValue = Number.isNaN(num) ? { text: value } : { number: num };
    }

    await projectsAPI.setFieldValue(
      sandbox.projectId,
      seededProjectIssue.projectItemId,
      field.id,
      fieldValue,
    );
  },
);

Then(
  'the seeded issue should show {string} in the {string} column',
  async ({ tableViewPage, seededProjectIssue }, value: string, _columnName: string) => {
    await tableViewPage.expectRowValue(seededProjectIssue.title, value);
  },
);

// ── FLD-02 ──────────────────────────────────────────────────

Given(
  'issue {string} exists with {string} set to {string} in the sandbox project',
  async (
    { githubAPI, projectsAPI, sandbox, dataManager, scenarioContext },
    issueId: string,
    fieldName: string,
    value: string,
  ) => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);
    const title = `${issueId}-e2e-${ts}-${rand}`;

    if (issueId === 'A') scenarioContext.set('issueATitle', title);
    else scenarioContext.set('issueBTitle', title);

    const issue = await githubAPI.createIssue(env.github.testRepo, {
      title,
      body: `Custom field filter test issue ${issueId}`,
    });
    const itemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

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

    await projectsAPI.setFieldValue(sandbox.projectId, itemId, field.id, fieldValue);

    dataManager.enqueue(`close issue #${issue.number}`, async () => {
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
    });
    dataManager.enqueue(`remove issue #${issue.number} from project`, async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, itemId);
    });
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

Then(
  'custom issue {string} should be visible in the table',
  async ({ tableViewPage, scenarioContext }, issueId: string) => {
    const title =
      issueId === 'A'
        ? scenarioContext.get<string>('issueATitle')
        : scenarioContext.get<string>('issueBTitle');
    await tableViewPage.expectRowVisible(title);
  },
);

Then(
  'custom issue {string} should not be visible in the table',
  async ({ tableViewPage, scenarioContext }, issueId: string) => {
    const title =
      issueId === 'A'
        ? scenarioContext.get<string>('issueATitle')
        : scenarioContext.get<string>('issueBTitle');
    await tableViewPage.expectRowNotVisible(title);
  },
);
