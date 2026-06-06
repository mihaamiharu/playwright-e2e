import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { uniqueTestTitle } from '../../src/utils/testing/factories';
import { seedAdditionalIssue } from '../../src/utils/testing/issue-seeder';

const { When, Then } = createBdd(test);

let draftTitle = '';
let draftItemId = '';
let issueTitle = '';

When(
  'I create a draft issue with title {string} via the API',
  async ({ projectsAPI, sandbox, dataManager }, title: string) => {
    draftTitle = uniqueTestTitle('draft', title);
    draftItemId = await projectsAPI.addDraftIssue(sandbox.projectId, draftTitle);

    dataManager.enqueue(`remove draft ${draftTitle} from project`, async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, draftItemId);
    });
  },
);

Then(
  'the draft issue should be visible on the board without an issue number',
  async ({ page }) => {
    const ghToken = process.env.GH_API_TOKEN || '';

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
    issueTitle = `${uniqueTestTitle('draft-convert', 'Converted issue')} [${scenarioId}]`;

    await seedAdditionalIssue(githubAPI, projectsAPI, sandbox, dataManager, scenarioContext, {
      title: issueTitle,
      body: 'Converted from draft',
    });
  },
);

Then(
  'the issue should be visible with an issue number on the board',
  async ({ page }) => {
    const card = page.getByRole('button', {
      name: new RegExp(issueTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    });
    await expect(card.first()).toBeVisible({ timeout: 20_000 });

    const cardText = await card.first().textContent();
    const hasIssueNumber = /#\d+/.test(cardText || '');
    expect(hasIssueNumber).toBe(true);
  },
);
