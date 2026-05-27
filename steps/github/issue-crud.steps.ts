import { createBdd } from 'playwright-bdd';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';

const { Given, When, Then } = createBdd(test);

Given('a seeded project issue exists on the kanban board', async ({ seededProjectIssue }) => {
  // Fixture auto-creates the issue and adds it to the project
  const { title, number } = seededProjectIssue;
  if (!title || !number) {
    throw new Error('seededProjectIssue fixture did not create an issue');
  }
});

When('I navigate to the issue page', async ({ issuePage, seededProjectIssue }) => {
  const { number } = seededProjectIssue;
  await issuePage.navigateTo(env.github.testRepo, number);
});

Then('I should see the issue heading', async ({ issuePage, seededProjectIssue }) => {
  const { title } = seededProjectIssue;
  await issuePage.expectHeading(title);
});

Then('I should see the issue number in the header', async ({ issuePage, seededProjectIssue }) => {
  const { number } = seededProjectIssue;
  await issuePage.expectIssueNumber(number);
});

When(
  'I update the issue description to {string}',
  async ({ githubAPI, seededProjectIssue }, newDescription: string) => {
    await githubAPI.updateIssue(env.github.testRepo, seededProjectIssue.number, {
      body: newDescription,
    });
  },
);

Then('I should see {string} in the issue body', async ({ issuePage }, expectedText: string) => {
  await issuePage.expectBodyText(expectedText);
});

When('I close the issue via API', async ({ githubAPI, seededProjectIssue }) => {
  await githubAPI.updateIssue(env.github.testRepo, seededProjectIssue.number, {
    state: 'closed',
  });
});

When('I reopen the issue via API', async ({ githubAPI, seededProjectIssue }) => {
  const issue = await githubAPI.updateIssue(env.github.testRepo, seededProjectIssue.number, {
    state: 'open',
  });
  if (issue.state !== 'open') {
    throw new Error(
      `Expected issue #${seededProjectIssue.number} to be open after reopen, got: ${issue.state}`,
    );
  }
});

Then('I should see a {string} status badge', async ({ issuePage }, expectedStatus: string) => {
  await issuePage.page.reload();
  await issuePage.expectState(expectedStatus);
});
