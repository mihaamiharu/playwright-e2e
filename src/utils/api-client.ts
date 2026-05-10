import type { APIRequestContext } from '@playwright/test';

/**
 * Typed wrapper around GitHub's REST API for test data lifecycle.
 * Uses Playwright's built-in `request` fixture — no extra dependencies.
 */

export interface CreateIssueParams {
  title: string;
  body?: string;
  labels?: string[];
}

export interface GitHubIssue {
  number: number;
  html_url: string;
  title: string;
  state: string;
}

export class GitHubAPI {
  private baseUrl = 'https://api.github.com';

  constructor(private request: APIRequestContext) {}

  /** Create an issue in the given repo. Returns the created issue. */
  async createIssue(repo: string, params: CreateIssueParams): Promise<GitHubIssue> {
    const response = await this.request.post(`${this.baseUrl}/repos/${repo}/issues`, {
      data: {
        title: params.title,
        body: params.body || 'Created by Playwright E2E test',
        labels: params.labels || [],
      },
    });

    if (!response.ok()) {
      throw new Error(`Failed to create issue: ${response.status()} ${await response.text()}`);
    }

    return response.json();
  }

  /** Close an issue (soft-delete — GitHub doesn't allow true deletion via API). */
  async closeIssue(repo: string, issueNumber: number): Promise<void> {
    const response = await this.request.patch(
      `${this.baseUrl}/repos/${repo}/issues/${issueNumber}`,
      {
        data: { state: 'closed' },
      },
    );

    if (!response.ok()) {
      // eslint-disable-next-line no-console
      console.warn(
        `Failed to close issue #${issueNumber}: ${response.status()} ${await response.text()}`,
      );
    }
  }

  /** Get an issue by number. */
  async getIssue(repo: string, issueNumber: number): Promise<GitHubIssue> {
    const response = await this.request.get(`${this.baseUrl}/repos/${repo}/issues/${issueNumber}`);

    if (!response.ok()) {
      throw new Error(
        `Failed to get issue #${issueNumber}: ${response.status()} ${await response.text()}`,
      );
    }

    return response.json();
  }

  /** List open issues for a repo. */
  async listIssues(repo: string, state: 'open' | 'closed' = 'open'): Promise<GitHubIssue[]> {
    const response = await this.request.get(
      `${this.baseUrl}/repos/${repo}/issues?state=${state}&per_page=10`,
    );

    if (!response.ok()) {
      throw new Error(`Failed to list issues: ${response.status()} ${await response.text()}`);
    }

    return response.json();
  }
}
