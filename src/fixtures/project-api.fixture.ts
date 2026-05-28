import { test as base } from 'playwright-bdd';
import { GitHubAPI } from '../utils/api/github-rest';
import { GitHubProjectsAPI } from '../utils/api/github-graphql';
import { env } from '../config/env.config';

export type ProjectAPIFixtures = {
  githubAPI: GitHubAPI;
  projectsAPI: GitHubProjectsAPI;
};

export function requireSandbox() {
  if (env.testMode === 'read-only') {
    test.skip(true, 'Skipping sandbox-dependent test in read-only mode');
  }
  if (!env.hasSandboxProject) {
    throw new Error(
      'Project fixtures require GH_API_TOKEN, GH_TEST_REPO, and GH_PROJECT_SANDBOX in .env',
    );
  }
}

export const test = base.extend<ProjectAPIFixtures>({
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
});
