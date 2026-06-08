import dotenv from 'dotenv';

dotenv.config();

export const env = {
  /** GitHub test account credentials (optional — only needed for authenticated tests) */
  github: {
    username: process.env.GH_USERNAME || '',
    password: process.env.GH_PASSWORD || '',
    /** Personal access token for REST + GraphQL API calls */
    token: process.env.GH_API_TOKEN || '',
    /** Repo where test issues are created, e.g. 'mihaamiharu/github-projects-e2e' */
    testRepo: process.env.GH_TEST_REPO || '',
    /** Owner of the test repo (org or username) */
    testRepoOwner: process.env.GH_TEST_REPO_OWNER || '',
    /** Name of the test repo (without owner/) */
    testRepoName: process.env.GH_TEST_REPO_NAME || '',
    /** Persistent sandbox project for all tests */
    sandboxProject: process.env.GH_PROJECT_SANDBOX || 'kanban-board',
    /** Sandbox project number (URL slug, e.g. '1' from /projects/1) */
    sandboxProjectNumber: parseInt(process.env.GH_PROJECT_SANDBOX_NUMBER || '1', 10),
  },

  /** True when running in CI */
  ci: process.env.CI === 'true',

  /** Base URL for the primary test target (default: GitHub) */
  baseUrl: process.env.BASE_URL || 'https://github.com',

  /** Test mode: 'read-only' = safe for CI, 'full' = authenticated + write ops */
  testMode: (process.env.TEST_MODE || 'read-only') as 'read-only' | 'full',

  /** Run browser headed (visible) instead of headless */
  headed: process.env.HEADED === 'true',

  /** True when GitHub credentials are available */
  get hasGitHubAuth(): boolean {
    return !!(this.github.username && this.github.password);
  },

  /** True when GitHub API token is available */
  get hasGitHubToken(): boolean {
    return !!this.github.token;
  },

  /** True when sandbox project is fully configured */
  get hasSandboxProject(): boolean {
    return this.hasGitHubToken && !!(this.github.testRepo && this.github.sandboxProject);
  },
};

const REQUIRED_VARS = ['GH_USERNAME', 'GH_PASSWORD', 'GH_API_TOKEN', 'GH_TEST_REPO'] as const;

export function validateEnv() {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (env.testMode === 'full' && missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}\nSee .env.example`);
  }
}
