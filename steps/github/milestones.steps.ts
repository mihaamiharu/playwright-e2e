import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';
import { buildMilestoneParams } from '../../src/utils/testing/factories';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';
import { seedAdditionalIssue } from '../../src/utils/testing/issue-seeder';

const { When, Then } = createBdd(test);

let milestoneNumber = 0;
let milestoneTitle = '';
let secondMilestoneIssueNumber = 0;

When('I create a milestone with a due date via the API', async ({ githubAPI, dataManager }) => {
  const milestone = await githubAPI.createMilestone(env.github.testRepo, buildMilestoneParams());

  milestoneNumber = milestone.number;
  milestoneTitle = milestone.title;

  dataManager.enqueue(`delete milestone #${milestone.number}`, async () => {
    await githubAPI.deleteMilestone(env.github.testRepo, milestone.number);
  });
});

When(
  'I link issue {string} to the milestone via the API',
  async ({ githubAPI, scenarioContext }, key) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    await githubAPI.updateIssue(env.github.testRepo, issue.number, {
      milestone: milestoneNumber,
    });
  },
);

Then('I should see the milestone name in the issue sidebar', async ({ milestonePanel }) => {
  await milestonePanel.expectMilestone(milestoneTitle);
});

When(
  'I seed a second issue on the board linked to the milestone',
  async ({ githubAPI, projectsAPI, sandbox, dataManager, scenarioContext }) => {
    const issue = await seedAdditionalIssue(
      githubAPI,
      projectsAPI,
      sandbox,
      dataManager,
      scenarioContext,
      {
        body: `Second issue for milestone progress test`,
        milestone: milestoneNumber,
      },
    );

    secondMilestoneIssueNumber = issue.number;
  },
);

When('I navigate to the milestone page', async ({ page }) => {
  await page.goto(`/${env.github.testRepo}/milestone/${milestoneNumber}`);
  await expect(page.getByRole('heading', { name: milestoneTitle, level: 2 })).toBeVisible();
});

Then('I should see the milestone progress bar showing partial completion', async ({ page }) => {
  const progressBar = page.locator('[role="progressbar"]');
  await expect(progressBar).toBeVisible({ timeout: 20_000 });

  let isFirst = true;
  await expect(async () => {
    if (!isFirst) {
      await page.reload();
    }
    isFirst = false;
    const progressValue = Number(await progressBar.getAttribute('aria-valuenow'));
    const progressMax = Number(await progressBar.getAttribute('aria-valuemax'));
    expect(progressValue).toBeGreaterThan(0);
    expect(progressValue).toBeLessThan(progressMax);
  }).toPass({ timeout: 15_000 });
});

When('I close the second issue via the API', async ({ githubAPI }) => {
  await githubAPI.updateIssue(env.github.testRepo, secondMilestoneIssueNumber, {
    state: 'closed',
  });
});

When('I close the milestone via the API', async ({ githubAPI }) => {
  await githubAPI.updateMilestone(env.github.testRepo, milestoneNumber, {
    state: 'closed',
  });
});

Then('the milestone should show completed status and full progress', async ({ page }) => {
  await expect(page.getByTestId('milestone-status')).toBeVisible();
  await expect(page.getByTestId('milestone-status')).toHaveText(/Closed/);

  const progressBar = page.locator('[role="progressbar"]');
  await expect(progressBar).toBeVisible({ timeout: 20_000 });

  let isFirst = true;
  await expect(async () => {
    if (!isFirst) {
      await page.reload();
    }
    isFirst = false;
    const progressValue = Number(await progressBar.getAttribute('aria-valuenow'));
    const progressMax = Number(await progressBar.getAttribute('aria-valuemax'));
    expect(progressValue).toBeGreaterThan(0);
    expect(progressValue).toBe(progressMax);
  }).toPass({ timeout: 15_000 });
});
