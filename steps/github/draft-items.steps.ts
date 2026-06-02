import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';
import { uniqueTestTitle, buildIssueParams } from '../../src/utils/testing/factories';

const { When, Then } = createBdd(test);

When(
  'I create a draft issue with title {string} via the API',
  async ({ projectsAPI, sandbox, dataManager, scenarioContext }, title: string) => {
    const draftTitle = uniqueTestTitle('draft', title);

    const draftItemId = await projectsAPI.addDraftIssue(sandbox.projectId, draftTitle);
    scenarioContext.set('draftItemId', draftItemId);
    scenarioContext.set('draftTitle', draftTitle);

    dataManager.enqueue(`remove draft ${draftTitle} from project`, async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, draftItemId);
    });
  },
);

Then(
  'the draft issue should be visible on the board without an issue number',
  async ({ page, scenarioContext }) => {
    const draftTitle = scenarioContext.get<string>('draftTitle');
    const card = page.getByRole('button', { name: new RegExp(draftTitle) });
    await expect(card.first()).toBeVisible({ timeout: 15000 });

    const cardText = await card.first().textContent();
    const hasIssueNumber = /#\d+/.test(cardText || '');
    expect(hasIssueNumber).toBe(false);
  },
);

When(
  'I create a full issue with the same title via the API',
  async ({ githubAPI, projectsAPI, sandbox, dataManager, scenarioContext }) => {
    const issueTitle = uniqueTestTitle('draft-convert', 'Converted issue');

    const issue = await githubAPI.createIssue(
      env.github.testRepo,
      buildIssueParams({ title: issueTitle, body: 'Converted from draft' }),
    );

    dataManager.enqueue(`close issue #${issue.number}`, async () => {
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
    });

    const itemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);
    scenarioContext.set('issueTitle', issueTitle);

    dataManager.enqueue(`remove issue #${issue.number} from project`, async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, itemId);
    });
  },
);

Then(
  'the issue should be visible with an issue number on the board',
  async ({ page, scenarioContext }) => {
    const issueTitle = scenarioContext.get<string>('issueTitle');
    const card = page.getByRole('button', { name: new RegExp(issueTitle) });
    await expect(card.first()).toBeVisible({ timeout: 15000 });

    const cardText = await card.first().textContent();
    const hasIssueNumber = /#\d+/.test(cardText || '');
    expect(hasIssueNumber).toBe(true);
  },
);
