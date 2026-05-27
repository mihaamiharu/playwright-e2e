/**
 * Sandbox setup script — ensures all required fields exist.
 *
 * Usage:
 *   npx tsx src/scripts/setup-sandbox.ts
 *
 * The sandbox project must already exist. This script creates any
 * missing fields that the tests depend on.
 */

import { env } from '../config/env.config';

const ENDPOINT = 'https://api.github.com/graphql';

interface FieldNode {
  __typename: string;
  id: string;
  name: string;
  options?: Array<{ id: string; name: string }>;
}

const REQUIRED_FIELDS: Array<{
  name: string;
  type: string;
}> = [
  { name: 'Priority', type: 'SINGLE_SELECT' },
  { name: 'Size', type: 'SINGLE_SELECT' },
  { name: 'Estimate', type: 'NUMBER' },
  { name: 'Target date', type: 'DATE' },
  { name: 'Iteration', type: 'ITERATION' },
];

async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = env.github.token;
  const response = await fetch(ENDPOINT, {
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

async function main() {
  if (!env.github.token) {
    console.error('❌ GITHUB_API_TOKEN not set');
    process.exit(1);
  }

  const { testRepoOwner, sandboxProjectNumber, sandboxProject } = env.github;
  console.log(`\n🔧 Sandbox Setup — ${testRepoOwner}/${sandboxProject}\n`);

  // 1. Get project ID
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
    { owner: testRepoOwner, projectNumber: sandboxProjectNumber },
  );

  const projectId = projData.user?.projectV2?.id;
  if (!projectId) {
    console.error(`❌ Project #${sandboxProjectNumber} not found`);
    process.exit(1);
  }
  console.log(`📋 Project ID: ${projectId}\n`);

  // 2. Get existing fields
  const fieldsData = await graphql<{ node: { fields: { nodes: FieldNode[] } } }>(
    `
      query ($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            fields(first: 20) {
              nodes {
                __typename
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options {
                    id
                    name
                  }
                }
                ... on ProjectV2Field {
                  id
                  name
                }
                ... on ProjectV2IterationField {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `,
    { projectId },
  );

  const existingFields = fieldsData.node.fields.nodes;
  const existingNames = new Set(existingFields.map((f) => f.name));
  console.log(`📦 ${existingFields.length} fields currently exist\n`);

  // 3. Check / create each required field
  for (const required of REQUIRED_FIELDS) {
    if (existingNames.has(required.name)) {
      const field = existingFields.find((f) => f.name === required.name)!;
      const typename = field.__typename;
      if (field.options) {
        const opts = field.options.map((o) => o.name).join(', ');
        console.log(`  ✅ "${required.name}" (${typename}) — options: [${opts}]`);
      } else {
        console.log(`  ✅ "${required.name}" (${typename})`);
      }
      continue;
    }

    console.log(`  ➕ Creating "${required.name}" (${required.type})...`);
    try {
      if (required.type === 'ITERATION') {
        const result = await graphql<{ createProjectV2Field: { projectV2Field: { id: string } } }>(
          `mutation($projectId: ID!) {
            createProjectV2Field(input: {
              projectId: $projectId
              name: "${required.name}"
              dataType: ITERATION
              iterationConfiguration: {
                startDate: "2026-06-01"
                duration: 14
                iterations: [
                  { title: "Sprint 1", duration: 14, startDate: "2026-06-01" }
                  { title: "Sprint 2", duration: 14, startDate: "2026-06-15" }
                ]
              }
            }) {
              projectV2Field { ... on ProjectV2IterationField { id } }
            }
          }`,
          { projectId },
        );
        console.log(`  ✅ Created — ID: ${result.createProjectV2Field.projectV2Field.id}`);
      } else {
        const result = await graphql<{ createProjectV2Field: { projectV2Field: { id: string } } }>(
          `
            mutation ($projectId: ID!, $name: String!, $dataType: ProjectV2CustomFieldType!) {
              createProjectV2Field(
                input: { projectId: $projectId, name: $name, dataType: $dataType }
              ) {
                projectV2Field {
                  ... on ProjectV2Field {
                    id
                  }
                  ... on ProjectV2SingleSelectField {
                    id
                  }
                }
              }
            }
          `,
          { projectId, name: required.name, dataType: required.type },
        );
        console.log(`  ✅ Created — ID: ${result.createProjectV2Field.projectV2Field.id}`);
      }
    } catch (err) {
      console.warn(`  ⚠️  Could not create: ${err}`);
    }
  }

  // 4. Check workflows
  console.log(`\n📋 Checking workflows...`);
  const wfData = await graphql<{
    node: { workflows: { nodes: Array<{ id: string; name: string; enabled: boolean }> } };
  }>(
    `
      query ($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            workflows(first: 20) {
              nodes {
                id
                name
                enabled
              }
            }
          }
        }
      }
    `,
    { projectId },
  );
  for (const wf of wfData.node?.workflows?.nodes || []) {
    console.log(
      `  ${wf.enabled ? '✅' : '⏸️'} "${wf.name}" — ${wf.enabled ? 'enabled' : 'disabled'}`,
    );
  }

  console.log(`\n✅ Sandbox setup complete\n`);
}

main().catch(console.error);
