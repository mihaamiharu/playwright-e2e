import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';

const { When, Then } = createBdd(test);

When('I close the seeded issue via the API', async ({ githubAPI, seededProjectIssue }) => {
  await githubAPI.updateIssue(env.github.testRepo, seededProjectIssue.number, {
    state: 'closed',
  });
});

When(
  'I create a milestone with a due date via the API',
  async ({ githubAPI, dataManager, scenarioContext }) => {
    const uniqueId = `milestone-${Date.now()}`;
    const title = `e2e-${uniqueId}`;
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const milestone = await githubAPI.createMilestone(env.github.testRepo, {
      title,
      due_on: dueDate,
    });

    scenarioContext.set('milestoneNumber', milestone.number);
    scenarioContext.set('milestoneTitle', milestone.title);

    dataManager.enqueue(`delete milestone #${milestone.number}`, async () => {
      await githubAPI.deleteMilestone(env.github.testRepo, milestone.number);
    });
  },
);

When(
  'I link the seeded issue to the milestone via the API',
  async ({ githubAPI, seededProjectIssue, scenarioContext }) => {
    await githubAPI.updateIssue(env.github.testRepo, seededProjectIssue.number, {
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
    const uniqueId = `mil-issue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const title = `e2e-${uniqueId}`;

    const issue = await githubAPI.createIssue(env.github.testRepo, {
      title,
      body: `Second issue for milestone progress test. Run: ${uniqueId}`,
      milestone: milestoneNumber,
    });

    scenarioContext.set('secondMilestoneIssueNumber', issue.number);

    dataManager.enqueue(`close issue #${issue.number}`, async () => {
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
    });

    const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);
    dataManager.enqueue(`remove issue #${issue.number} from project`, async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId);
    });
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

// ── MIL-03 ──────────────────────────────────────────────────

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
