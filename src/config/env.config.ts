import dotenv from 'dotenv';

dotenv.config();

export const env = {
  /** GitHub test account credentials (optional — only needed for authenticated tests) */
  github: {
    username: process.env.GITHUB_USERNAME || '',
    password: process.env.GITHUB_PASSWORD || '',
    token: process.env.GITHUB_API_TOKEN || '',
    testRepo: process.env.GITHUB_TEST_REPO || '',
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
};
