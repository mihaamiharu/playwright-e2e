import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures/github-project.fixture';
import { env } from '../../src/config/env.config';

const { When, Then } = createBdd(test);

When('I close the seeded issue via the API', async ({ githubAPI, seededProjectIssue, page }) => {
  await githubAPI.updateIssue(env.github.testRepo, seededProjectIssue.number, {
    state: 'closed',
  });
  await page.waitForTimeout(1000);
});

let milestoneNumber = 0;
let milestoneTitle = '';

When('I create a milestone with a due date via the API', async ({ githubAPI, dataManager }) => {
  const uniqueId = `milestone-${Date.now()}`;
  const title = `e2e-${uniqueId}`;
  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const milestone = await githubAPI.createMilestone(env.github.testRepo, {
    title,
    due_on: dueDate,
  });

  milestoneNumber = milestone.number;
  milestoneTitle = milestone.title;

  dataManager.enqueue(async () => {
    await githubAPI.deleteMilestone(env.github.testRepo, milestoneNumber);
  });
});

When('I link the seeded issue to the milestone via the API', async ({ githubAPI, seededProjectIssue }) => {
  await githubAPI.updateIssue(env.github.testRepo, seededProjectIssue.number, {
    milestone: milestoneNumber,
  });
});

Then('I should see the milestone name in the issue sidebar', async ({ page }) => {
  const milestoneSection = page.getByTestId('sidebar-milestones-section');
  await expect(milestoneSection.getByTestId('issue-milestone-container')).toContainText(milestoneTitle);
});

When('I seed a second issue on the board linked to the milestone', async ({ githubAPI, projectsAPI, sandbox, dataManager }) => {
  const uniqueId = `mil-issue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const title = `e2e-${uniqueId}`;

  const issue = await githubAPI.createIssue(env.github.testRepo, {
    title,
    body: `Second issue for milestone progress test. Run: ${uniqueId}`,
    milestone: milestoneNumber,
  });

  const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

  dataManager.enqueue(async () => {
    await projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId);
  });
  dataManager.enqueue(async () => {
    await githubAPI.closeIssue(env.github.testRepo, issue.number);
  });
});

When('I navigate to the milestone page', async ({ page }) => {
  await page.goto(`/${env.github.testRepo}/milestone/${milestoneNumber}`);
  await page.getByRole('heading', { name: milestoneTitle, level: 2 }).waitFor({ state: 'visible', timeout: 15000 });
});

Then('I should see the milestone progress bar showing partial completion', async ({ page }) => {
  const progressBar = page.locator('[role="progressbar"]');
  await progressBar.waitFor({ state: 'visible', timeout: 20000 });

  const progressValue = Number(await progressBar.getAttribute('aria-valuenow'));
  const progressMax = Number(await progressBar.getAttribute('aria-valuemax'));

  expect(progressValue).toBeGreaterThan(0);
  expect(progressValue).toBeLessThan(progressMax);
});
