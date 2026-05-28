import { createBdd } from 'playwright-bdd';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';

const { Given, When, Then } = createBdd(test);

When(
  'I add a comment {string} via the API',
  async ({ githubAPI, seededProjectIssue, scenarioContext }, body) => {
    const comment = await githubAPI.addComment(
      env.github.testRepo,
      seededProjectIssue.number,
      body,
    );
    scenarioContext.set('commentId', comment.id);
  },
);

Then('I should see the comment {string} on the issue', async ({ issuePage }, body) => {
  await issuePage.expectCommentVisible(body);
});

Given(
  'a comment exists on the issue with text {string}',
  async ({ githubAPI, seededProjectIssue, scenarioContext }, body) => {
    const comment = await githubAPI.addComment(
      env.github.testRepo,
      seededProjectIssue.number,
      body,
    );
    scenarioContext.set('commentId', comment.id);
  },
);

When(
  'I update the comment to {string} via the API',
  async ({ githubAPI, scenarioContext }, newBody) => {
    await githubAPI.updateComment(
      env.github.testRepo,
      scenarioContext.get<number>('commentId'),
      newBody,
    );
  },
);

Then('I should see {string} in the comments', async ({ issuePage }, text) => {
  await issuePage.expectCommentVisible(text);
});

Then('I should not see {string} on the page', async ({ issuePage }, text) => {
  await issuePage.expectCommentNotVisible(text);
});
