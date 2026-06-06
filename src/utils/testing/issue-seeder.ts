import type { GitHubAPI, GitHubIssue } from '../api/github-rest';
import type { GitHubProjectsAPI } from '../api/github-graphql';
import type { DataManager } from './data-manager';
import type { ScenarioContext } from './scenario-context';
import { buildIssueParams } from './factories';
import { env } from '../../config/env.config';

export interface SeededIssue extends GitHubIssue {
  projectItemId: string;
}

export interface SandboxConfig {
  projectId: string;
  statusFieldId: string;
  statusOptions: Map<string, string>;
}

export interface SeedOptions {
  title?: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number;
  status?: string;
  scenarioId?: string;
}

export async function seedProjectIssue(
  githubAPI: GitHubAPI,
  projectsAPI: GitHubProjectsAPI,
  sandbox: SandboxConfig,
  dataManager: DataManager,
  scenarioContext: ScenarioContext,
  options: SeedOptions = {},
): Promise<SeededIssue> {
  const params = buildIssueParams({
    title: options.title,
    body: options.body,
    labels: options.labels,
    assignees: options.assignees,
    milestone: options.milestone,
  });

  if (options.scenarioId) {
    params.title = `${params.title} [${options.scenarioId}]`;
  }

  params.body =
    params.body || `🤖 Seeded by Playwright E2E test. Auto-cleaned. Run: ${params.title}`;

  const issue = await githubAPI.createIssue(env.github.testRepo, params);
  console.log(`[seeder] Created issue #${issue.number}: "${params.title}"`);

  dataManager.enqueue(`close issue #${issue.number}`, () =>
    githubAPI.closeIssue(env.github.testRepo, issue.number),
  );

  const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);
  console.log(`[seeder] Added issue #${issue.number} to project ${sandbox.projectId}`);

  const statusName = options.status || 'Backlog';
  const statusOptionId = sandbox.statusOptions.get(statusName);
  if (statusOptionId) {
    await projectsAPI.setFieldValue(sandbox.projectId, projectItemId, sandbox.statusFieldId, {
      singleSelectOptionId: statusOptionId,
    });
  }

  dataManager.enqueue(`remove issue #${issue.number} from project`, () =>
    projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId),
  );

  const seededIssue: SeededIssue = { ...issue, projectItemId };
  scenarioContext.set('seededIssue', seededIssue);

  return seededIssue;
}

export async function seedAdditionalIssue(
  githubAPI: GitHubAPI,
  projectsAPI: GitHubProjectsAPI,
  sandbox: SandboxConfig,
  dataManager: DataManager,
  options: SeedOptions = {},
): Promise<SeededIssue> {
  const params = buildIssueParams({
    title: options.title,
    body: options.body,
    labels: options.labels,
    assignees: options.assignees,
    milestone: options.milestone,
  });

  if (options.scenarioId) {
    params.title = `${params.title} [${options.scenarioId}]`;
  }

  params.body =
    params.body || `🤖 Seeded by Playwright E2E test. Auto-cleaned. Run: ${params.title}`;

  const issue = await githubAPI.createIssue(env.github.testRepo, params);
  console.log(`[seeder] Created additional issue #${issue.number}: "${params.title}"`);

  dataManager.enqueue(`close issue #${issue.number}`, () =>
    githubAPI.closeIssue(env.github.testRepo, issue.number),
  );

  const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);
  console.log(`[seeder] Added issue #${issue.number} to project ${sandbox.projectId}`);

  const statusName = options.status;
  if (statusName) {
    const statusOptionId = sandbox.statusOptions.get(statusName);
    if (statusOptionId) {
      await projectsAPI.setFieldValue(sandbox.projectId, projectItemId, sandbox.statusFieldId, {
        singleSelectOptionId: statusOptionId,
      });
    }
  }

  dataManager.enqueue(`remove issue #${issue.number} from project`, () =>
    projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId),
  );

  return { ...issue, projectItemId };
}
