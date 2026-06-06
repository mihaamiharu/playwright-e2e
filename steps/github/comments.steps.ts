import { createBdd } from 'playwright-bdd';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

let commentId = 0;

const { Given, When, Then } = createBdd(test);

When(
  'I add comment {string} to issue {string} via the API',
  async ({ githubAPI, scenarioContext }, body: string, key: string) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    const comment = await githubAPI.addComment(env.github.testRepo, issue.number, body);
    commentId = comment.id;
  },
);

Then('I should see the comment {string} on the issue', async ({ issuePage }, body: string) => {
  await issuePage.expectCommentVisible(body);
});

Given(
  'a comment exists on issue {string} with text {string}',
  async ({ githubAPI, scenarioContext }, key: string, body: string) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    const comment = await githubAPI.addComment(env.github.testRepo, issue.number, body);
    commentId = comment.id;
  },
);

When('I update the comment to {string} via the API', async ({ githubAPI }, newBody: string) => {
  await githubAPI.updateComment(env.github.testRepo, commentId, newBody);
});

Then('I should see {string} in the comments', async ({ issuePage }, text: string) => {
  await issuePage.expectCommentVisible(text);
});

Then('I should not see {string} on the page', async ({ issuePage }, text: string) => {
  await issuePage.expectCommentNotVisible(text);
});
