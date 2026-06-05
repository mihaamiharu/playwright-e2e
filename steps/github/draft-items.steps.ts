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
    const ghToken = process.env.GH_API_TOKEN || '';

    // The Priority board view doesn't render draft items as buttons.
    // Verify via GraphQL API using Playwright's page-level request context.
    const query = `query($projectId:ID!){node(id:$projectId){...on ProjectV2{items(first:50){nodes{id type content{...on DraftIssue{title}...on Issue{number title}}}}}}}`;

    interface DraftNode {
      id: string;
      type: string;
      content: { title: string; number?: number };
    }

    await expect(async () => {
      const res = await page.request.post('https://api.github.com/graphql', {
        headers: { Authorization: `Bearer ${ghToken}`, 'Content-Type': 'application/json' },
        data: { query, variables: { projectId: 'PVT_kwHOAuZFts4BXfFn' } },
      });
      const json = (await res.json()) as { data: { node: { items: { nodes: DraftNode[] } } } };
      const nodes: DraftNode[] = json?.data?.node?.items?.nodes ?? [];
      expect(nodes.length).toBeGreaterThan(0);
      const draft = nodes.find((n) => n.content?.title === draftTitle);
      expect(draft).toBeDefined();
      expect(draft!.type).toBe('DRAFT_ISSUE');
      expect(draft!.content?.number).toBeUndefined();
    }).toPass({ timeout: 20_000 });
  },
);

When(
  'I create a full issue with the same title via the API',
  async ({ githubAPI, projectsAPI, sandbox, dataManager, scenarioContext, scenarioId }) => {
    const issueTitle = `${uniqueTestTitle('draft-convert', 'Converted issue')} [${scenarioId}]`;

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
    const card = page.getByRole('button', {
      name: new RegExp(issueTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    });
    await expect(card.first()).toBeVisible({ timeout: 20_000 });

    const cardText = await card.first().textContent();
    const hasIssueNumber = /#\d+/.test(cardText || '');
    expect(hasIssueNumber).toBe(true);
  },
);
