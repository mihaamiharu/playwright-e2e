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

  for (const item of toPurge) {
    const info = item.type === 'ISSUE' ? `issue #${item.content!.number}` : 'draft (no issue)';
    console.log(`  "${item.content?.title}" (${info})`);

    if (DRY_RUN) continue;

    try {
      await gql(
        `mutation($projectId: ID!, $itemId: ID!) {
          deleteProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
            deletedItemId
          }
        }`,
        { projectId, itemId: item.id },
      );
      removed++;
    } catch (err) {
      console.error(`    ✗ remove failed: ${(err as Error).message}`);
      continue;
    }

    if (item.type === 'ISSUE' && item.content?.number) {
      try {
        await rest(`/repos/${TEST_REPO}/issues/${item.content.number}`, {
          method: 'PATCH',
          body: JSON.stringify({ state: 'closed' }),
        });
        closed++;
      } catch (err) {
        console.error(`    ✗ close failed: ${(err as Error).message}`);
      }
    }

    await new Promise((r) => setTimeout(r, 500));
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
