import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';
import { buildMilestoneParams } from '../../src/utils/testing/factories';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';
import { seedAdditionalIssue } from '../../src/utils/testing/issue-seeder';

const { When, Then } = createBdd(test);

When('I close the seeded issue via the API', async ({ githubAPI, scenarioContext }) => {
  const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
  await githubAPI.updateIssue(env.github.testRepo, seededIssue.number, {
    state: 'closed',
  });
});

When(
  'I create a milestone with a due date via the API',
  async ({ githubAPI, dataManager, scenarioContext }) => {
    const milestone = await githubAPI.createMilestone(env.github.testRepo, buildMilestoneParams());

    scenarioContext.set('milestoneNumber', milestone.number);
    scenarioContext.set('milestoneTitle', milestone.title);

    dataManager.enqueue(`delete milestone #${milestone.number}`, async () => {
      await githubAPI.deleteMilestone(env.github.testRepo, milestone.number);
    });
  },
);

When(
  'I link the seeded issue to the milestone via the API',
  async ({ githubAPI, scenarioContext }) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    await githubAPI.updateIssue(env.github.testRepo, seededIssue.number, {
      milestone: scenarioContext.get<number>('milestoneNumber'),
    });
  },
);

Then(
  'I should see the milestone name in the issue sidebar',
  async ({ milestonePanel, scenarioContext }) => {
    await milestonePanel.expectMilestone(scenarioContext.get<string>('milestoneTitle'));
  },
);

When(
  'I seed a second issue on the board linked to the milestone',
  async ({ githubAPI, projectsAPI, sandbox, dataManager, scenarioContext }) => {
    const milestoneNumber = scenarioContext.get<number>('milestoneNumber');

    const issue = await seedAdditionalIssue(githubAPI, projectsAPI, sandbox, dataManager, {
      body: `Second issue for milestone progress test`,
      milestone: milestoneNumber,
    });

    scenarioContext.set('secondMilestoneIssueNumber', issue.number);
  },
);

When('I navigate to the milestone page', async ({ page, scenarioContext }) => {
  const milestoneNumber = scenarioContext.get<number>('milestoneNumber');
  const milestoneTitle = scenarioContext.get<string>('milestoneTitle');
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

When('I close the second issue via the API', async ({ githubAPI, scenarioContext }) => {
  await githubAPI.updateIssue(
    env.github.testRepo,
    scenarioContext.get<number>('secondMilestoneIssueNumber'),
    {
      state: 'closed',
    },
  );
});

When('I close the milestone via the API', async ({ githubAPI, scenarioContext }) => {
  await githubAPI.updateMilestone(
    env.github.testRepo,
    scenarioContext.get<number>('milestoneNumber'),
    {
      state: 'closed',
    },
  );
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
