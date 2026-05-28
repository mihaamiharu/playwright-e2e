const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';

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
    const projectId = projData.user?.projectV2?.id;
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
