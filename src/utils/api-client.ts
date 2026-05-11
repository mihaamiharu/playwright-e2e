import type { APIRequestContext } from '@playwright/test';

/**
 * Typed wrapper around GitHub's REST API for test data lifecycle.
 * Uses Playwright's built-in `request` fixture — no extra dependencies.
 */

// ── Types ─────────────────────────────────────────────────

export interface CreateIssueParams {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export interface UpdateIssueParams {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  labels?: string[];
  assignees?: string[];
  milestone?: number;
}

export interface GitHubIssue {
  number: number;
  node_id: string;
  html_url: string;
  title: string;
  body: string;
  state: string;
  labels: GitHubLabel[];
}

export interface GitHubLabel {
  name: string;
  color: string;
  description?: string;
}

export interface GitHubComment {
  id: number;
  node_id: string;
  body: string;
  html_url: string;
}

// ── Client ────────────────────────────────────────────────

export class GitHubAPI {
  private baseUrl = 'https://api.github.com';

  constructor(
    private request: APIRequestContext,
    private token?: string,
  ) {}

  private authHeaders(): Record<string, string> {
    if (!this.token) return {};
    return { Authorization: `Bearer ${this.token}` };
  }

  // ── Issues ──────────────────────────────────────────

  /** Create an issue in the given repo. Returns the created issue (includes node_id). */
  async createIssue(repo: string, params: CreateIssueParams): Promise<GitHubIssue> {
    const response = await this.request.post(`${this.baseUrl}/repos/${repo}/issues`, {
      headers: this.authHeaders(),
      data: {
        title: params.title,
        body: params.body || 'Created by Playwright E2E test',
        labels: params.labels || [],
        assignees: params.assignees || [],
      },
    });

    if (!response.ok()) {
      throw new Error(`Failed to create issue: ${response.status()} ${await response.text()}`);
    }

    return response.json();
  }

  /** Update an issue's title, body, state, labels, or assignees. */
  async updateIssue(repo: string, issueNumber: number, params: UpdateIssueParams): Promise<GitHubIssue> {
    const response = await this.request.patch(
      `${this.baseUrl}/repos/${repo}/issues/${issueNumber}`,
      {
        headers: this.authHeaders(),
        data: params,
      },
    );

    if (!response.ok()) {
      throw new Error(
        `Failed to update issue #${issueNumber}: ${response.status()} ${await response.text()}`,
      );
    }

    return response.json();
  }

  /** Close an issue (soft-delete — GitHub doesn't allow true deletion via REST). */
  async closeIssue(repo: string, issueNumber: number): Promise<void> {
    const response = await this.request.patch(
      `${this.baseUrl}/repos/${repo}/issues/${issueNumber}`,
      {
        headers: this.authHeaders(),
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
    const response = await this.request.get(
      `${this.baseUrl}/repos/${repo}/issues/${issueNumber}`,
      { headers: this.authHeaders() },
    );

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
      { headers: this.authHeaders() },
    );

    if (!response.ok()) {
      throw new Error(`Failed to list issues: ${response.status()} ${await response.text()}`);
    }

    return response.json();
  }

  // ── Labels ──────────────────────────────────────────

  /** Add one or more labels to an issue. Returns the full label list. */
  async addLabels(repo: string, issueNumber: number, labels: string[]): Promise<GitHubLabel[]> {
    const response = await this.request.post(
      `${this.baseUrl}/repos/${repo}/issues/${issueNumber}/labels`,
      {
        headers: this.authHeaders(),
        data: { labels },
      },
    );

    if (!response.ok()) {
      throw new Error(
        `Failed to add labels to issue #${issueNumber}: ${response.status()} ${await response.text()}`,
      );
    }

    return response.json();
  }

  /** Remove a label from an issue. */
  async removeLabel(repo: string, issueNumber: number, label: string): Promise<void> {
    const response = await this.request.delete(
      `${this.baseUrl}/repos/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
      { headers: this.authHeaders() },
    );

    if (!response.ok()) {
      // eslint-disable-next-line no-console
      console.warn(
        `Failed to remove label "${label}" from issue #${issueNumber}: ${response.status()}`,
      );
    }
  }

  // ── Comments ────────────────────────────────────────

  /** Add a comment to an issue. */
  async addComment(repo: string, issueNumber: number, body: string): Promise<GitHubComment> {
    const response = await this.request.post(
      `${this.baseUrl}/repos/${repo}/issues/${issueNumber}/comments`,
      {
        headers: this.authHeaders(),
        data: { body },
      },
    );

    if (!response.ok()) {
      throw new Error(
        `Failed to add comment to issue #${issueNumber}: ${response.status()} ${await response.text()}`,
      );
    }

    return response.json();
  }

  /** Update an existing comment. */
  async updateComment(
    repo: string,
    commentId: number,
    body: string,
  ): Promise<GitHubComment> {
    const response = await this.request.patch(
      `${this.baseUrl}/repos/${repo}/issues/comments/${commentId}`,
      {
        headers: this.authHeaders(),
        data: { body },
      },
    );

    if (!response.ok()) {
      throw new Error(
        `Failed to update comment #${commentId}: ${response.status()} ${await response.text()}`,
      );
    }

    return response.json();
  }
}
