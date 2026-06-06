import 'dotenv/config';

const API_TOKEN = process.env.GH_API_TOKEN || '';
const OWNER = process.env.GH_TEST_REPO_OWNER || '';
const PROJECT_NUMBER = parseInt(process.env.GH_PROJECT_SANDBOX_NUMBER || '1', 10);
const TEST_REPO = process.env.GH_TEST_REPO || '';

const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const ageDaysIdx = args.indexOf('--age-days');
const AGE_DAYS = ageDaysIdx !== -1 ? parseInt(args[ageDaysIdx + 1], 10) || 0 : 0;

if (!API_TOKEN || !OWNER || !TEST_REPO) {
  console.error('Missing required env vars: GH_API_TOKEN, GH_TEST_REPO_OWNER, GH_TEST_REPO');
  process.exit(1);
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors?.length) {
    throw new Error(`GraphQL errors: ${body.errors.map((e) => e.message).join('; ')}`);
  }
  return body.data!;
}

async function rest(path: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    },
    ...options,
  });
  if (!res.ok)
    throw new Error(`REST ${options?.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`);
  return res;
}

function isE2eItem(title: string): boolean {
  return /^e2e-/.test(title) || /^[AB]-e2e-/.test(title);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function main() {
  const ageLabel = AGE_DAYS > 0 ? `older than ${AGE_DAYS} days` : 'all e2e-* items';
  console.log(
    `${DRY_RUN ? '🔍 DRY RUN' : '🧹 PURGING'} sandbox project #${PROJECT_NUMBER} (owner: ${OWNER})`,
  );
  console.log(`Scope: ${ageLabel}\n`);

  const { user } = await gql<{
    user: { projectV2: { id: string } | null } | null;
  }>(
    `query($owner: String!, $num: Int!) {
      user(login: $owner) { projectV2(number: $num) { id } }
    }`,
    { owner: OWNER, num: PROJECT_NUMBER },
  );

  const projectId = user?.projectV2?.id;
  if (!projectId) throw new Error(`Project #${PROJECT_NUMBER} not found for owner "${OWNER}"`);
  console.log(`Project ID: ${projectId}`);

  const { node } = await gql<{
    node: {
      items: {
        nodes: Array<{
          id: string;
          type: string;
          content: { number: number; title: string; createdAt: string } | null;
        }>;
      };
    };
  }>(
    `query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          items(first: 100) {
            nodes {
              id
              type
              content {
                ... on Issue { number title createdAt }
                ... on DraftIssue { title }
              }
            }
          }
        }
      }
    }`,
    { projectId },
  );

  const allItems = node.items.nodes;
  const cutoff = AGE_DAYS > 0 ? new Date(Date.now() - AGE_DAYS * 24 * 60 * 60 * 1000) : null;

  const toPurge = allItems.filter((item) => {
    const title = item.content?.title;
    if (!title || !isE2eItem(title)) return false;
    if (cutoff && item.type === 'ISSUE' && item.content?.createdAt) {
      return new Date(item.content.createdAt) < cutoff;
    }
    return true;
  });

  console.log(`Total items in project: ${allItems.length}`);
  console.log(`e2e items to purge: ${toPurge.length}`);

  const drafts = toPurge.filter((i) => i.type === 'DRAFT_ISSUE');
  const issues = toPurge.filter((i) => i.type === 'ISSUE');

  if (drafts.length > 0) console.log(`  Drafts: ${drafts.length}`);
  if (issues.length > 0) console.log(`  Issues: ${issues.length}`);
  console.log();

  if (toPurge.length === 0) {
    console.log('Nothing to purge.');
    return;
  }

  let removed = 0;
  let closed = 0;
  const BATCH_SIZE = 10;

  if (DRY_RUN) {
    for (const item of toPurge) {
      const info = item.type === 'ISSUE' ? `issue #${item.content!.number}` : 'draft (no issue)';
      console.log(`  "${item.content?.title}" (${info})`);
    }
  } else {
    const deleteChunks = chunk(toPurge, BATCH_SIZE);
    const successfullyRemoved: Array<{ type: string; number?: number; title?: string }> = [];

    for (let i = 0; i < deleteChunks.length; i++) {
      const batch = deleteChunks[i];
      const aliases = batch
        .map((item, idx) => `d${idx}: deleteProjectV2Item(input: { projectId: $projectId, itemId: $itemId${idx} }) { deletedItemId }`)
        .join('\n        ');
      const variables: Record<string, unknown> = { projectId };
      batch.forEach((item, idx) => {
        variables[`itemId${idx}`] = item.id;
      });

      try {
        await gql(
          `mutation($projectId: ID!, ${batch.map((_, idx) => `$itemId${idx}: ID!`).join(', ')}) {
            ${aliases}
          }`,
          variables,
        );
        successfullyRemoved.push(...batch.map((item) => ({ type: item.type, number: item.content?.number, title: item.content?.title })));
        removed += batch.length;
        console.log(`  [batch ${i + 1}/${deleteChunks.length}] deleted ${batch.length} items from project`);
      } catch (err) {
        console.error(`  [batch ${i + 1}/${deleteChunks.length}] ✗ batch delete failed: ${(err as Error).message}`);
      }

      if (i < deleteChunks.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const issuesToClose = successfullyRemoved.filter((item) => item.type === 'ISSUE' && item.number);
    if (issuesToClose.length > 0) {
      const closeChunks = chunk(issuesToClose, BATCH_SIZE);
      for (let i = 0; i < closeChunks.length; i++) {
        const batch = closeChunks[i];
        const results = await Promise.allSettled(
          batch.map((item) =>
            rest(`/repos/${TEST_REPO}/issues/${item.number}`, {
              method: 'PATCH',
              body: JSON.stringify({ state: 'closed' }),
            }),
          ),
        );

        const batchClosed = results.filter((r) => r.status === 'fulfilled').length;
        closed += batchClosed;

        results.forEach((result, idx) => {
          if (result.status === 'rejected') {
            console.error(`    ✗ close #${batch[idx].number} failed: ${(result.reason as Error).message}`);
          }
        });

        console.log(`  [batch ${i + 1}/${closeChunks.length}] closed ${batchClosed}/${batch.length} issues`);

        if (i < closeChunks.length - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
  }

  if (DRY_RUN) {
    console.log(`\n[dry-run] Would have removed ${toPurge.length} items.`);
  } else {
    console.log(`\nDone. Removed ${removed} from project, closed ${closed} issues.`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
