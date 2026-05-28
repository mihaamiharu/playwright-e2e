import type { APIRequestContext } from '@playwright/test';
import { retry } from '../testing/retry';

/**
 * GraphQL client for GitHub Projects V2.
 * Uses Playwright's `request` fixture to POST to the GraphQL endpoint.
 *
 * GitHub Projects V2 has NO REST API — everything is GraphQL.
 * This client abstracts the GraphQL boilerplate behind typed methods.
 */

// ── Types ─────────────────────────────────────────────────

export type ProjectFieldType = 'Status' | 'Text' | 'Number' | 'Date' | 'SingleSelect' | 'Iteration';

export interface ProjectField {
  id: string;
  name: string;
  type: ProjectFieldType;
  options?: ProjectFieldOption[];
  iterations?: ProjectFieldIteration[];
}

export interface ProjectFieldIteration {
  id: string;
  title: string;
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

/** Union of value shapes accepted by `updateProjectV2ItemFieldValue`. */
export type ItemFieldValue =
  | { singleSelectOptionId: string }
  | { text: string }
  | { number: number }
  | { date: string }
  | { iterationId: string };

/** Result of converting a draft item to an issue. */
export interface DraftConversionResult {
  issueNumber: number;
  issueNodeId: string;
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
    const response = await retry(
      () =>
        this.request.post(this.endpoint, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          data: { query, variables },
        }),
      {
        retryable: (err) => /TIMEDOUT|ETIMEDOUT|socket hang up/i.test(err.message),
        onRetry: (err, attempt, max) =>
          console.warn(`[retry] GraphQL timeout (${attempt}/${max}) — ${err.message}`),
      },
    );

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
      throw new Error(`Project #${projectNumber} not found for user "${owner}"`);
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
                __typename
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  dataType
                  options { id name }
                }
                ... on ProjectV2Field {
                  id
                  name
                  dataType
                }
                ... on ProjectV2IterationField { id name configuration { iterations { id title } } }
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      node: { fields: { nodes: Array<Record<string, unknown>> } };
    }>(query, { projectId });

    return data.node.fields.nodes.map((f: Record<string, unknown>) => {
      const typename = f.__typename as string;
      const dataType = f.dataType as string | undefined;
      let type: ProjectFieldType;

      if (typename === 'ProjectV2SingleSelectField') {
        type = dataType === 'SINGLE_SELECT' ? 'SingleSelect' : 'Status';
      } else if (typename === 'ProjectV2IterationField') {
        type = 'Iteration';
      } else if (dataType === 'DATE') {
        type = 'Date';
      } else if (dataType === 'NUMBER') {
        type = 'Number';
      } else {
        type = 'Text';
      }

      const config = f.configuration as Record<string, unknown> | undefined;
      const iterations = config?.iterations as Array<{ id: string; title: string }> | undefined;

      return {
        id: f.id as string,
        name: f.name as string,
        type,
        options: f.options
          ? (f.options as Array<{ id: string; name: string }>).map((o) => ({
              id: o.id,
              name: o.name,
            }))
          : undefined,
        iterations: iterations ? iterations.map((i) => ({ id: i.id, title: i.title })) : undefined,
      };
    });
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

  /**
   * Set any field value on a project item.
   * Use the appropriate value shape for the field type:
   * - SingleSelect: `{ singleSelectOptionId: "..." }`
   * - Text:         `{ text: "..." }`
   * - Number:       `{ number: 42 }`
   * - Date:         `{ date: "2026-06-01" }`
   * - Iteration:    `{ iterationId: "..." }`
   */
  async setFieldValue(
    projectId: string,
    itemId: string,
    fieldId: string,
    value: ItemFieldValue,
  ): Promise<void> {
    const query = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: $value
        }) {
          projectV2Item { id }
        }
      }
    `;

    await this.graphql(query, { projectId, itemId, fieldId, value });
  }

  /** Archive a project item (hides from active views). */
  async archiveItem(projectId: string, itemId: string): Promise<void> {
    const query = `
      mutation($projectId: ID!, $itemId: ID!) {
        archiveProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
          item { id }
        }
      }
    `;

    await this.graphql(query, { projectId, itemId });
  }

  /** Restore an archived project item to active views. */
  async unarchiveItem(projectId: string, itemId: string): Promise<void> {
    const query = `
      mutation($projectId: ID!, $itemId: ID!) {
        unarchiveProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
          item { id }
        }
      }
    `;

    await this.graphql(query, { projectId, itemId });
  }

  /**
   * Create a draft issue (a project item not backed by a GitHub issue).
   * Returns the new project item ID.
   */
  async addDraftIssue(projectId: string, title: string, body?: string): Promise<string> {
    const query = `
      mutation($projectId: ID!, $title: String!, $body: String) {
        addProjectV2DraftIssue(input: {
          projectId: $projectId
          title: $title
          body: $body
        }) {
          projectItem { id }
        }
      }
    `;

    const data = await this.graphql<{
      addProjectV2DraftIssue: { projectItem: { id: string } };
    }>(query, { projectId, title, body: body || null });

    return data.addProjectV2DraftIssue.projectItem.id;
  }

  /**
   * Convert a draft project item into a full GitHub issue.
   * Requires the repository node ID (obtain via `getRepositoryId`).
   * Returns the resulting issue number and node ID.
   */
  async convertDraftToIssue(
    projectId: string,
    itemId: string,
    repositoryId: string,
  ): Promise<DraftConversionResult> {
    const query = `
      mutation($projectId: ID!, $itemId: ID!, $repositoryId: ID!) {
        convertProjectV2DraftIssueItemToIssue(input: {
          projectId: $projectId
          itemId: $itemId
          repositoryId: $repositoryId
        }) {
          issue { number id }
        }
      }
    `;

    const data = await this.graphql<{
      convertProjectV2DraftIssueItemToIssue: { issue: { number: number; id: string } };
    }>(query, { projectId, itemId, repositoryId });

    return {
      issueNumber: data.convertProjectV2DraftIssueItemToIssue.issue.number,
      issueNodeId: data.convertProjectV2DraftIssueItemToIssue.issue.id,
    };
  }

  /** Get the GraphQL node ID for a repository. */
  async getRepositoryId(owner: string, repoName: string): Promise<string> {
    const data = await this.graphql<{
      repository: { id: string } | null;
    }>(
      `query($owner: String!, $repoName: String!) {
        repository(owner: $owner, name: $repoName) { id }
      }`,
      { owner, repoName },
    );

    if (!data.repository) {
      throw new Error(`Repository "${owner}/${repoName}" not found`);
    }

    return data.repository.id;
  }

  /**
   * Read back the display value of a specific field on a project item.
   * Returns the value as a string, or null if not set / field not found.
   */
  async getItemFieldValue(itemId: string, fieldName: string): Promise<string | null> {
    const query = `
      query($itemId: ID!, $fieldName: String!) {
        node(id: $itemId) {
          ... on ProjectV2Item {
            fieldValueByName(name: $fieldName) {
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue { name }
              ... on ProjectV2ItemFieldTextValue { text }
              ... on ProjectV2ItemFieldNumberValue { number }
              ... on ProjectV2ItemFieldDateValue { date }
              ... on ProjectV2ItemFieldIterationValue { title }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      node: {
        fieldValueByName: Record<string, unknown> | null;
      } | null;
    }>(query, { itemId, fieldName });

    const fv = data.node?.fieldValueByName;
    if (!fv) return null;

    return (fv.name ??
      fv.text ??
      (fv.number as number | undefined)?.toString() ??
      fv.date ??
      fv.title) as string | null;
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
