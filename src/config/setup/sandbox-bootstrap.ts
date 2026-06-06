import { expect, type Page } from '@playwright/test';
import * as fs from 'fs';

const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
const SANDBOX_STATE_PATH = 'auth/sandbox-state.json';
const PERSISTENT_ISSUE_MARKER = '[persistent-test-issue]';
const TABLE_VIEW_NAME = 'Table Layout';

interface PersistentIssueData {
  number: number;
  title: string;
  nodeId: string;
  projectItemId: string;
}

interface SandboxState {
  persistentIssue: PersistentIssueData | null;
  tableViewNumber: number | null;
}

async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = process.env.GH_API_TOKEN;
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const body: unknown = await response.json();
  const { data, errors } = body as { data?: T; errors?: Array<{ message: string }> };
  if (errors) throw new Error(errors.map((e) => e.message).join('; '));
  return data as T;
}

async function rest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = process.env.GH_API_TOKEN;
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`REST ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

function readSandboxState(): SandboxState {
  if (!fs.existsSync(SANDBOX_STATE_PATH)) {
    return { persistentIssue: null, tableViewNumber: null };
  }
  try {
    return JSON.parse(fs.readFileSync(SANDBOX_STATE_PATH, 'utf-8'));
  } catch {
    return { persistentIssue: null, tableViewNumber: null };
  }
}

function writeSandboxState(state: SandboxState): void {
  fs.mkdirSync('auth', { recursive: true });
  fs.writeFileSync(SANDBOX_STATE_PATH, JSON.stringify(state, null, 2));
}

async function getProjectId(): Promise<string | null> {
  const owner = process.env.GH_TEST_REPO_OWNER;
  const projectNumber = parseInt(process.env.GH_PROJECT_SANDBOX_NUMBER || '1', 10);

  if (!owner) return null;

  const projData = await graphql<{ user: { projectV2: { id: string } | null } }>(
    `
      query ($owner: String!, $projectNumber: Int!) {
        user(login: $owner) {
          projectV2(number: $projectNumber) {
            id
          }
        }
      }
    `,
    { owner, projectNumber },
  );
  return projData.user?.projectV2?.id ?? null;
}

export async function ensureSandboxFields(): Promise<void> {
  const token = process.env.GH_API_TOKEN;
  const owner = process.env.GH_TEST_REPO_OWNER;
  const projectNumber = parseInt(process.env.GH_PROJECT_SANDBOX_NUMBER || '1', 10);

  if (!token || !owner) {
    console.log('  ⏭️  Sandbox check skipped — GH_API_TOKEN or GH_TEST_REPO_OWNER not set');
    return;
  }

  console.log(`\n🔧 Verifying sandbox project fields...`);

  try {
    const projectId = await getProjectId();
    if (!projectId) {
      console.warn(`  ⚠️  Sandbox project #${projectNumber} not found for "${owner}"`);
      return;
    }

    const fieldsData = await graphql<{
      node: { fields: { nodes: Array<{ __typename: string; name: string }> } };
    }>(
      `
        query ($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              fields(first: 20) {
                nodes {
                  __typename
                  name
                }
              }
            }
          }
        }
      `,
      { projectId },
    );

    const existingNames = new Set(fieldsData.node.fields.nodes.map((f) => f.name));

    if (existingNames.has('Iteration')) {
      console.log('  ✅ Iteration field exists');
    } else {
      console.log('  ➕ Creating Iteration field...');
      try {
        await graphql(
          `
            mutation ($projectId: ID!) {
              createProjectV2Field(
                input: {
                  projectId: $projectId
                  name: "Iteration"
                  dataType: ITERATION
                  iterationConfiguration: {
                    startDate: "2026-06-01"
                    duration: 14
                    iterations: [
                      { title: "Sprint 1", duration: 14, startDate: "2026-06-01" }
                      { title: "Sprint 2", duration: 14, startDate: "2026-06-15" }
                    ]
                  }
                }
              ) {
                projectV2Field {
                  ... on ProjectV2IterationField {
                    id
                  }
                }
              }
            }
          `,
          { projectId },
        );
        console.log('  ✅ Iteration field created');
      } catch (err) {
        console.warn(`  ⚠️  Could not create Iteration field: ${err}`);
      }
    }

    console.log('  ✅ Sandbox fields verified\n');
  } catch (err) {
    console.warn(`  ⚠️  Sandbox check failed (non-fatal): ${err}`);
  }
}

export async function ensureTableLayoutView(page?: Page): Promise<number | null> {
  const token = process.env.GH_API_TOKEN;

  if (!token) {
    console.log('  ⏭️  Table view check skipped — GH_API_TOKEN not set');
    return null;
  }

  console.log(`\n🔧 Verifying table layout view...`);

  try {
    const projectId = await getProjectId();
    if (!projectId) {
      console.warn('  ⚠️  Cannot verify table view — project not found');
      return null;
    }

    const viewsData = await graphql<{
      node: { views: { nodes: Array<{ id: string; name: string; number: number }> } };
    }>(
      `
        query ($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              views(first: 20) {
                nodes {
                  id
                  name
                  number
                }
              }
            }
          }
        }
      `,
      { projectId },
    );

    const tableView = viewsData.node.views.nodes.find((v) => v.name === TABLE_VIEW_NAME);

    if (tableView) {
      console.log(`  ✅ "${TABLE_VIEW_NAME}" view exists (views/${tableView.number})`);
      return tableView.number;
    }

    if (!page) {
      console.warn('  ⚠️  No browser page available — cannot create "Table Layout" view via UI');
      console.warn('  ⏭️  Tests will fall back to views/1 (no view isolation)');
      return null;
    }

    console.log(`  ➕ Creating "${TABLE_VIEW_NAME}" view via UI...`);

    const owner = process.env.GH_TEST_REPO_OWNER;
    const projectNumber = process.env.GH_PROJECT_SANDBOX_NUMBER;
    if (!owner || !projectNumber) {
      console.warn('  ⚠️  Missing owner or project number — cannot create view');
      return null;
    }

    await page.goto(`https://github.com/users/${owner}/projects/${projectNumber}?layout=table`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForURL(/\/(projects|users).*\d/);

    await page.getByRole('tab', { name: 'New view' }).click();
    await page.getByRole('menuitem', { name: 'Table' }).click();
    await page.waitForURL(/\/views\/\d+/);

    const urlMatch = page.url().match(/\/views\/(\d+)/);
    if (!urlMatch) {
      console.warn('  ⚠️  Could not determine new view number from URL');
      return null;
    }
    const viewNumber = parseInt(urlMatch[1], 10);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /View options for/ }).click();
    await page.getByRole('menuitem', { name: 'Rename view' }).click();

    const dialog = page.getByRole('dialog', { name: 'Rename view' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const textbox = dialog.getByRole('textbox', { name: 'View name' });
    await textbox.clear();
    await textbox.fill(TABLE_VIEW_NAME);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    console.log(`  ✅ "${TABLE_VIEW_NAME}" view created (views/${viewNumber})`);
    return viewNumber;
  } catch (err) {
    console.warn(`  ⚠️  Table view setup failed (non-fatal): ${err}`);
    return null;
  }
}

export async function ensurePersistentIssue(): Promise<void> {
  const token = process.env.GH_API_TOKEN;
  const owner = process.env.GH_TEST_REPO_OWNER;
  const repo = process.env.GH_TEST_REPO;

  if (!token || !owner || !repo) {
    console.log('  ⏭️  Persistent issue skipped — missing env vars');
    return;
  }

  console.log(`\n🔧 Verifying persistent test issue...`);

  const state = readSandboxState();

  try {
    if (state.persistentIssue) {
      const issue = await rest<{ state: string; title: string }>(
        `/repos/${repo}/issues/${state.persistentIssue.number}`,
      );
      if (issue.state === 'open' && issue.title.includes(PERSISTENT_ISSUE_MARKER)) {
        console.log(`  ✅ Persistent issue #${state.persistentIssue.number} exists and is open`);
        return;
      }
      console.log(
        `  ⚠️  Persistent issue #${state.persistentIssue.number} is closed or missing — recreating`,
      );
    }

    const projectId = await getProjectId();
    if (!projectId) {
      console.warn(`  ⚠️  Cannot create persistent issue — project not found`);
      return;
    }

    const title = `E2E Persistent Test Issue ${PERSISTENT_ISSUE_MARKER}`;
    const issue = await rest<{ number: number; node_id: string; title: string }>(
      `/repos/${repo}/issues`,
      {
        method: 'POST',
        body: JSON.stringify({
          title,
          body: '🤖 Persistent issue for read-only E2E tests (accessibility, visual). Do not delete.',
        }),
      },
    );
    console.log(`  ➕ Created persistent issue #${issue.number}`);

    const addItemResult = await graphql<{
      addProjectV2ItemById: { item: { id: string } };
    }>(
      `
        mutation ($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
            item {
              id
            }
          }
        }
      `,
      { projectId, contentId: issue.node_id },
    );

    const projectItemId = addItemResult.addProjectV2ItemById.item.id;

    const statusFieldData = await graphql<{
      node: {
        fields: {
          nodes: Array<{
            id: string;
            name: string;
            options?: Array<{ id: string; name: string }>;
          }>;
        };
      };
    }>(
      `
        query ($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              fields(first: 20) {
                nodes {
                  ... on ProjectV2SingleSelectField {
                    id
                    name
                    options {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { projectId },
    );

    const statusField = statusFieldData.node.fields.nodes.find((f) => f.name === 'Status');
    const backlogOption = statusField?.options?.find((o) => o.name === 'Backlog');

    if (statusField && backlogOption) {
      await graphql(
        `
          mutation ($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
            updateProjectV2ItemFieldValue(
              input: {
                projectId: $projectId
                itemId: $itemId
                fieldId: $fieldId
                value: { singleSelectOptionId: $optionId }
              }
            ) {
              projectV2Item {
                id
              }
            }
          }
        `,
        {
          projectId,
          itemId: projectItemId,
          fieldId: statusField.id,
          optionId: backlogOption.id,
        },
      );
    }

    state.persistentIssue = {
      number: issue.number,
      title: issue.title,
      nodeId: issue.node_id,
      projectItemId,
    };

    writeSandboxState(state);
    console.log(`  ✅ Persistent issue saved to ${SANDBOX_STATE_PATH}`);
  } catch (err) {
    console.warn(`  ⚠️  Persistent issue setup failed (non-fatal): ${err}`);
  }
}

export function getPersistentIssue(): PersistentIssueData | null {
  return readSandboxState().persistentIssue;
}

export function getTableViewNumber(): number | null {
  return readSandboxState().tableViewNumber;
}

export function saveTableViewNumber(viewNumber: number): void {
  const state = readSandboxState();
  state.tableViewNumber = viewNumber;
  writeSandboxState(state);
}
