import { test, type APIRequestContext } from '@playwright/test';
import { z } from 'zod';
import { retry } from '../testing/retry';
import {
  ProjectFieldSchema,
  ProjectFieldIterationSchema,
  ProjectFieldOptionSchema,
  ProjectItemSchema,
  ProjectViewSchema,
  DraftConversionResultSchema,
} from './schemas/graphql';

export type ProjectFieldType = z.infer<typeof ProjectFieldSchema>['type'];
export type ProjectField = z.infer<typeof ProjectFieldSchema>;
export type ProjectFieldIteration = z.infer<typeof ProjectFieldIterationSchema>;
export type ProjectFieldOption = z.infer<typeof ProjectFieldOptionSchema>;
export type ProjectItem = z.infer<typeof ProjectItemSchema>;
export type ProjectView = z.infer<typeof ProjectViewSchema>;
export type DraftConversionResult = z.infer<typeof DraftConversionResultSchema>;

export type ItemFieldValue =
  | { singleSelectOptionId: string }
  | { text: string }
  | { number: number }
  | { date: string }
  | { iterationId: string };

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export class GitHubProjectsAPI {
  private endpoint = 'https://api.github.com/graphql';

  constructor(
    private request: APIRequestContext,
    private token: string,
  ) {}

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
        retryable: (err) =>
          /TIMEDOUT|ETIMEDOUT|socket hang up|rate limit|RATE_LIMITED|retry after/i.test(
            err.message,
          ),
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

  async getProjectId(owner: string, projectNumber: number): Promise<string> {
    return test.step(`GitHub GraphQL: get project ID for #${projectNumber}`, async () => {
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
    });
  }

  async getStatusField(
    projectId: string,
  ): Promise<{ fieldId: string; options: Map<string, string> }> {
    return test.step('GitHub GraphQL: get status field', async () => {
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
    });
  }

  async getFields(projectId: string): Promise<ProjectField[]> {
    return test.step('GitHub GraphQL: get all fields', async () => {
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

      const mapped = data.node.fields.nodes.map((f: Record<string, unknown>) => {
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
          iterations: iterations
            ? iterations.map((i) => ({ id: i.id, title: i.title }))
            : undefined,
        };
      });

      return z.array(ProjectFieldSchema).parse(mapped);
    });
  }

  async getItems(projectId: string): Promise<ProjectItem[]> {
    return test.step('GitHub GraphQL: get all items', async () => {
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

      const mapped = data.node.items.nodes.map((item) => ({
        id: item.id,
        type: item.type,
        issueNumber: item.content?.number,
        title: item.content?.title,
        status: item.status?.name,
      }));

      return z.array(ProjectItemSchema).parse(mapped);
    });
  }

  async getProjectViews(projectId: string): Promise<ProjectView[]> {
    return test.step('GitHub GraphQL: get project views', async () => {
      const query = `
        query($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              views(first: 20) {
                nodes { id name number }
              }
            }
          }
        }
      `;

      const data = await this.graphql<{
        node: {
          views: {
            nodes: Array<{ id: string; name: string; number: number }>;
          };
        };
      }>(query, { projectId });

      return z.array(ProjectViewSchema).parse(data.node.views.nodes);
    });
  }

  async addIssueToProject(projectId: string, contentId: string): Promise<string> {
    return test.step('GitHub GraphQL: add issue to project', async () => {
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
    });
  }

  async moveItemToStatus(
    projectId: string,
    itemId: string,
    fieldId: string,
    optionId: string,
  ): Promise<void> {
    return test.step('GitHub GraphQL: move item to status', async () => {
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
    });
  }

  async removeItemFromProject(projectId: string, itemId: string): Promise<void> {
    return test.step('GitHub GraphQL: remove item from project', async () => {
      const query = `
        mutation($projectId: ID!, $itemId: ID!) {
          deleteProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
            deletedItemId
          }
        }
      `;

      await this.graphql(query, { projectId, itemId });
    });
  }

  async setFieldValue(
    projectId: string,
    itemId: string,
    fieldId: string,
    value: ItemFieldValue,
  ): Promise<void> {
    return test.step('GitHub GraphQL: set field value', async () => {
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
    });
  }

  async archiveItem(projectId: string, itemId: string): Promise<void> {
    return test.step('GitHub GraphQL: archive item', async () => {
      const query = `
        mutation($projectId: ID!, $itemId: ID!) {
          archiveProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
            item { id }
          }
        }
      `;

      await this.graphql(query, { projectId, itemId });
    });
  }

  async unarchiveItem(projectId: string, itemId: string): Promise<void> {
    return test.step('GitHub GraphQL: unarchive item', async () => {
      const query = `
        mutation($projectId: ID!, $itemId: ID!) {
          unarchiveProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
            item { id }
          }
        }
      `;

      await this.graphql(query, { projectId, itemId });
    });
  }

  async addDraftIssue(projectId: string, title: string, body?: string): Promise<string> {
    return test.step(`GitHub GraphQL: add draft issue "${title}"`, async () => {
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
    });
  }

  async convertDraftToIssue(
    projectId: string,
    itemId: string,
    repositoryId: string,
  ): Promise<DraftConversionResult> {
    return test.step('GitHub GraphQL: convert draft to issue', async () => {
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

      const result = DraftConversionResultSchema.parse({
        issueNumber: data.convertProjectV2DraftIssueItemToIssue.issue.number,
        issueNodeId: data.convertProjectV2DraftIssueItemToIssue.issue.id,
      });

      test.info().annotations.push({
        type: 'Resource Link',
        description: `Issue #${result.issueNumber} (converted from draft)`,
      });

      await test.info().attach('api-response', {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      });

      return result;
    });
  }

  /** @deprecated GitHub has not shipped this mutation yet. */
  async deleteView(viewId: string): Promise<void> {
    return test.step('GitHub GraphQL: delete view', async () => {
      const query = `
        mutation($viewId: ID!) {
          deleteProjectV2View(input: { projectV2ViewId: $viewId }) {
            projectV2View { id }
          }
        }
      `;

      await this.graphql(query, { viewId });
    });
  }

  async getRepositoryId(owner: string, repoName: string): Promise<string> {
    return test.step('GitHub GraphQL: get repository ID', async () => {
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
    });
  }

  async getItemFieldValue(itemId: string, fieldName: string): Promise<string | null> {
    return test.step(`GitHub GraphQL: get field value "${fieldName}"`, async () => {
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
    });
  }

  async resolveProject(owner: string, projectNumber: number) {
    const projectId = await this.getProjectId(owner, projectNumber);
    const { fieldId, options } = await this.getStatusField(projectId);
    return { projectId, statusFieldId: fieldId, statusOptions: options };
  }
}
