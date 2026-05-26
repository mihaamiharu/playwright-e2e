import type { APIRequestContext } from '@playwright/test';

/**
 * GraphQL client for GitHub Projects V2.
 * Uses Playwright's `request` fixture to POST to the GraphQL endpoint.
 *
 * GitHub Projects V2 has NO REST API — everything is GraphQL.
 * This client abstracts the GraphQL boilerplate behind typed methods.
 */

// ── Types ─────────────────────────────────────────────────

export interface ProjectField {
  id: string;
  name: string;
  type: 'Status' | 'Text' | 'Number' | 'Date' | 'SingleSelect' | 'Iteration';
  options?: ProjectFieldOption[];
}

export interface ProjectFieldOption {
  id: string;
  name: string;
}

export interface ProjectItem {
  /** Project item node ID (for mutations) */
  id: string;
  /** Content type (Issue, DraftIssue, PullRequest) */
  type: string;
  /** Issue number (only for Issues) */
  issueNumber?: number;
  /** Issue title */
  title?: string;
  /** Current status option name */
  status?: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

// ── Client ────────────────────────────────────────────────

export class GitHubProjectsAPI {
  private endpoint = 'https://api.github.com/graphql';

  constructor(
    private request: APIRequestContext,
    private token: string,
  ) {}

  /** Execute a GraphQL query/mutation. Throws on errors. */
  private async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await this.request.post(this.endpoint, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      data: { query, variables },
    });

    if (!response.ok()) {
      throw new Error(`GraphQL request failed: ${response.status()} ${await response.text()}`);
    }

    const body: GraphQLResponse<T> = await response.json();

    if (body.errors?.length) {
      throw new Error(`GraphQL errors: ${body.errors.map((e) => e.message).join('; ')}`);
    }

    if (!body.data) {
      throw new Error(`GraphQL returned no data`);
    }

    return body.data;
  }

  // ── Project queries ─────────────────────────────────

  /**
   * Get the project node ID for a personal user account.
   */
  async getProjectId(owner: string, projectNumber: number): Promise<string> {
    const data = await this.graphql<{
      user: { projectV2: { id: string } | null } | null;
    }>(
      `query($owner: String!, $projectNumber: Int!) {
        user(login: $owner) {
          projectV2(number: $projectNumber) { id }
        }
      }`,
      { owner, projectNumber },
    );

    const projectId = data.user?.projectV2?.id;

    if (!projectId) {
      throw new Error(
        `Project #${projectNumber} not found for user "${owner}"`,
      );
    }

    return projectId;
  }

  /**
   * Get the Status field and its option IDs for a project.
   * Returns the field ID and a map of option name → option ID.
   */
  async getStatusField(
    projectId: string,
  ): Promise<{ fieldId: string; options: Map<string, string> }> {
    const query = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            fields(first: 20) {
              nodes {
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options { id name }
                }
                ... on ProjectV2Field { id name }
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      node: {
        fields: {
          nodes: Array<{
            id: string;
            name: string;
            options?: Array<{ id: string; name: string }>;
          }>;
        };
      };
    }>(query, { projectId });

    const statusField = data.node.fields.nodes.find((f) => f.name === 'Status');

    if (!statusField || !statusField.options) {
      throw new Error('Status field not found in project');
    }

    const options = new Map<string, string>();
    for (const opt of statusField.options) {
      options.set(opt.name, opt.id);
    }

    return { fieldId: statusField.id, options };
  }

  /** List all project fields (Status, custom fields, etc.). */
  async getFields(projectId: string): Promise<ProjectField[]> {
    const query = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            fields(first: 20) {
              nodes {
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options { id name }
                }
                ... on ProjectV2Field { id name }
                ... on ProjectV2IterationField { id name }
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      node: { fields: { nodes: Array<Record<string, unknown>> } };
    }>(query, { projectId });

    return data.node.fields.nodes.map((f: Record<string, unknown>) => ({
      id: f.id as string,
      name: f.name as string,
      type: (f.options ? 'Status' : 'Text') as ProjectField['type'],
      options: f.options
        ? (f.options as Array<{ id: string; name: string }>).map((o) => ({
            id: o.id,
            name: o.name,
          }))
        : undefined,
    }));
  }

  /** Get all items in a project with their current status. */
  async getItems(projectId: string): Promise<ProjectItem[]> {
    const query = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 50) {
              nodes {
                id
                type
                content {
                  ... on Issue { number title }
                }
                status: fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue { name }
                }
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      node: {
        items: {
          nodes: Array<{
            id: string;
            type: string;
            content: { number: number; title: string } | null;
            status: { name: string } | null;
          }>;
        };
      };
    }>(query, { projectId });

    return data.node.items.nodes.map((item) => ({
      id: item.id,
      type: item.type,
      issueNumber: item.content?.number,
      title: item.content?.title,
      status: item.status?.name,
    }));
  }

  // ── Item mutations ──────────────────────────────────

  /** Add an issue to a project. `contentId` is the issue's node_id from REST API. */
  async addIssueToProject(projectId: string, contentId: string): Promise<string> {
    const query = `
      mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
          item { id }
        }
      }
    `;

    const data = await this.graphql<{
      addProjectV2ItemById: { item: { id: string } };
    }>(query, { projectId, contentId });

    return data.addProjectV2ItemById.item.id;
  }

  /**
   * Move an item to a different status column.
   * `fieldId` and `optionId` come from getStatusField().
   */
  async moveItemToStatus(
    projectId: string,
    itemId: string,
    fieldId: string,
    optionId: string,
  ): Promise<void> {
    const query = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $optionId }
        }) {
          projectV2Item { id }
        }
      }
    `;

    await this.graphql(query, { projectId, itemId, fieldId, optionId });
  }

  /** Remove an item from a project. Requires both projectId and itemId per GitHub's schema. */
  async removeItemFromProject(projectId: string, itemId: string): Promise<void> {
    const query = `
      mutation($projectId: ID!, $itemId: ID!) {
        deleteProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
          deletedItemId
        }
      }
    `;

    await this.graphql(query, { projectId, itemId });
  }

  // ── Convenience ─────────────────────────────────────

  /**
   * Full project setup: resolve project ID, status field, and option map.
   * Cached per test via fixture — call once, reuse the result.
   */
  async resolveProject(owner: string, projectNumber: number) {
    const projectId = await this.getProjectId(owner, projectNumber);
    const { fieldId, options } = await this.getStatusField(projectId);
    return { projectId, statusFieldId: fieldId, statusOptions: options };
  }
}
