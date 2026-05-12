import { test as base } from 'playwright-bdd';
import { DataManager } from '../utils/data-manager';
import { GitHubAPI, type GitHubIssue } from '../utils/api-client';
import { GitHubProjectsAPI } from '../utils/github-projects-api';
import { env } from '../config/env.config';

/**
 * GitHub Project Management fixtures.
 *
 * Extends playwright-bdd's test with:
 * - Authenticated API clients (REST + GraphQL)
 * - Sandbox project context (project ID, status field, option map)
 * - Seeded project issues with auto-cleanup via DataManager
 */

export type ProjectFixtures = {
  /** Guaranteed cleanup queue — all enqueued tasks run after test, even on failure */
  dataManager: DataManager;

  /** GitHub REST API client (authenticated with token) */
  githubAPI: GitHubAPI;

  /** GitHub Projects V2 GraphQL client */
  projectsAPI: GitHubProjectsAPI;

  /**
   * Resolved sandbox project context.
   * Includes the project's GraphQL node ID, Status field ID,
   * and a map of status name → option ID (e.g. "Todo" → "abc123").
   */
  sandbox: {
    projectId: string;
    statusFieldId: string;
    statusOptions: Map<string, string>;
  };

  /**
   * Seeds an issue, adds it to the sandbox project, and auto-cleans up.
   * Cleanup: removes from project → closes issue.
   *
   * Use uniqueIssueName to avoid collisions in parallel tests.
   */
  seededProjectIssue: GitHubIssue & { projectItemId: string };
};

/** Throw early if sandbox config is missing. */
function requireSandbox() {
  if (!env.hasSandboxProject) {
    throw new Error(
      'Project fixtures require GITHUB_API_TOKEN, GITHUB_TEST_REPO, and GITHUB_PROJECT_SANDBOX in .env',
    );
  }
}

export const test = base.extend<ProjectFixtures>({
  // ── DataManager ─────────────────────────────────────

  dataManager: async ({}, use) => {
    const dm = new DataManager();
    await use(dm);
    // Runs AFTER the test — always, even if test throws
    await dm.cleanupAll();
  },

  // ── API Clients ─────────────────────────────────────

  githubAPI: async ({ request }, use) => {
    requireSandbox();
    const api = new GitHubAPI(request, env.github.token);
    await use(api);
  },

  projectsAPI: async ({ request }, use) => {
    requireSandbox();
    const api = new GitHubProjectsAPI(request, env.github.token);
    await use(api);
  },

  // ── Sandbox context ─────────────────────────────────

  sandbox: async ({ projectsAPI }, use) => {
    requireSandbox();

    const { projectId, statusFieldId, statusOptions } = await projectsAPI.resolveProject(
      env.github.testRepoOwner,
      env.github.sandboxProjectNumber,
    );

    // eslint-disable-next-line no-console
    console.log(
      `[sandbox] Resolved project "${env.github.sandboxProject}" (${projectId}), ` +
        `statuses: ${[...statusOptions.keys()].join(', ')}`,
    );

    await use({ projectId, statusFieldId, statusOptions });
  },

  // ── Seeded issue ────────────────────────────────────

  seededProjectIssue: async ({ githubAPI, projectsAPI, sandbox, dataManager }, use) => {
    requireSandbox();

    // 1. Create issue via REST
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const title = `e2e-${uniqueId}`;
    const issue = await githubAPI.createIssue(env.github.testRepo, {
      title,
      body: `🤖 Seeded by Playwright E2E test. Auto-cleaned. Run: ${uniqueId}`,
    });

    // 2. Add to sandbox project via GraphQL
    const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

    // 3. Enqueue cleanup (LIFO: project removal first, then close)
    dataManager.enqueue(async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId);
    });
    dataManager.enqueue(async () => {
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
    });

    await use({ ...issue, projectItemId });
  },
});

export { expect } from '@playwright/test';
