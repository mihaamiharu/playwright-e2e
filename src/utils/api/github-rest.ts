import { test, type APIRequestContext } from '@playwright/test';
import { z } from 'zod';
import {
  GitHubIssueSchema,
  GitHubLabelSchema,
  GitHubCommentSchema,
  GitHubMilestoneSchema,
  CreateIssueParamsSchema,
  UpdateIssueParamsSchema,
} from './schemas/rest';

export type CreateIssueParams = z.infer<typeof CreateIssueParamsSchema>;
export type UpdateIssueParams = z.infer<typeof UpdateIssueParamsSchema>;
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;
export type GitHubLabel = z.infer<typeof GitHubLabelSchema>;
export type GitHubComment = z.infer<typeof GitHubCommentSchema>;
export type GitHubMilestone = z.infer<typeof GitHubMilestoneSchema>;

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

  async createIssue(repo: string, params: CreateIssueParams): Promise<GitHubIssue> {
    return test.step(`GitHub REST: create issue "${params.title}"`, async () => {
      const valid = CreateIssueParamsSchema.parse(params);

      const response = await this.request.post(`${this.baseUrl}/repos/${repo}/issues`, {
        headers: this.authHeaders(),
        data: {
          title: valid.title,
          body: valid.body || 'Created by Playwright E2E test',
          labels: valid.labels || [],
          assignees: valid.assignees || [],
          ...(valid.milestone ? { milestone: valid.milestone } : {}),
        },
      });

      if (!response.ok()) {
        throw new Error(`Failed to create issue: ${response.status()} ${await response.text()}`);
      }

      const issue = GitHubIssueSchema.parse(await response.json());

      test.info().annotations.push({
        type: 'Resource Link',
        description: `Issue #${issue.number}: ${issue.html_url}`,
      });

      await test.info().attach('api-response', {
        body: JSON.stringify(issue, null, 2),
        contentType: 'application/json',
      });

      return issue;
    });
  }

  async updateIssue(
    repo: string,
    issueNumber: number,
    params: UpdateIssueParams,
  ): Promise<GitHubIssue> {
    return test.step(`GitHub REST: update issue #${issueNumber}`, async () => {
      const valid = UpdateIssueParamsSchema.parse(params);

      const response = await this.request.patch(
        `${this.baseUrl}/repos/${repo}/issues/${issueNumber}`,
        { headers: this.authHeaders(), data: valid },
      );

      if (!response.ok()) {
        throw new Error(
          `Failed to update issue #${issueNumber}: ${response.status()} ${await response.text()}`,
        );
      }

      return GitHubIssueSchema.parse(await response.json());
    });
  }

  async closeIssue(repo: string, issueNumber: number): Promise<void> {
    return test.step(`GitHub REST: close issue #${issueNumber}`, async () => {
      const response = await this.request.patch(
        `${this.baseUrl}/repos/${repo}/issues/${issueNumber}`,
        { headers: this.authHeaders(), data: { state: 'closed' } },
      );

      if (!response.ok()) {
        throw new Error(
          `Failed to close issue #${issueNumber}: ${response.status()} ${await response.text()}`,
        );
      }
    });
  }

  async getIssue(repo: string, issueNumber: number): Promise<GitHubIssue> {
    return test.step(`GitHub REST: get issue #${issueNumber}`, async () => {
      const response = await this.request.get(
        `${this.baseUrl}/repos/${repo}/issues/${issueNumber}`,
        { headers: this.authHeaders() },
      );

      if (!response.ok()) {
        throw new Error(
          `Failed to get issue #${issueNumber}: ${response.status()} ${await response.text()}`,
        );
      }

      return GitHubIssueSchema.parse(await response.json());
    });
  }

  async listIssues(repo: string, state: 'open' | 'closed' = 'open'): Promise<GitHubIssue[]> {
    return test.step(`GitHub REST: list ${state} issues`, async () => {
      const response = await this.request.get(
        `${this.baseUrl}/repos/${repo}/issues?state=${state}&per_page=10`,
        { headers: this.authHeaders() },
      );

      if (!response.ok()) {
        throw new Error(`Failed to list issues: ${response.status()} ${await response.text()}`);
      }

      return z.array(GitHubIssueSchema).parse(await response.json());
    });
  }

  async addLabels(repo: string, issueNumber: number, labels: string[]): Promise<GitHubLabel[]> {
    return test.step(`GitHub REST: add labels [${labels.join(', ')}] to issue #${issueNumber}`, async () => {
      const response = await this.request.post(
        `${this.baseUrl}/repos/${repo}/issues/${issueNumber}/labels`,
        { headers: this.authHeaders(), data: { labels } },
      );

      if (!response.ok()) {
        throw new Error(
          `Failed to add labels to issue #${issueNumber}: ${response.status()} ${await response.text()}`,
        );
      }

      return z.array(GitHubLabelSchema).parse(await response.json());
    });
  }

  async removeLabel(repo: string, issueNumber: number, label: string): Promise<void> {
    return test.step(`GitHub REST: remove label "${label}" from issue #${issueNumber}`, async () => {
      const response = await this.request.delete(
        `${this.baseUrl}/repos/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
        { headers: this.authHeaders() },
      );

      if (!response.ok()) {
        console.warn(
          `Failed to remove label "${label}" from issue #${issueNumber}: ${response.status()}`,
        );
      }
    });
  }

  async addComment(repo: string, issueNumber: number, body: string): Promise<GitHubComment> {
    return test.step(`GitHub REST: add comment to issue #${issueNumber}`, async () => {
      const response = await this.request.post(
        `${this.baseUrl}/repos/${repo}/issues/${issueNumber}/comments`,
        { headers: this.authHeaders(), data: { body } },
      );

      if (!response.ok()) {
        throw new Error(
          `Failed to add comment to issue #${issueNumber}: ${response.status()} ${await response.text()}`,
        );
      }

      const comment = GitHubCommentSchema.parse(await response.json());

      test.info().annotations.push({
        type: 'Resource Link',
        description: `Comment #${comment.id}: ${comment.html_url}`,
      });

      await test.info().attach('api-response', {
        body: JSON.stringify(comment, null, 2),
        contentType: 'application/json',
      });

      return comment;
    });
  }

  async createMilestone(
    repo: string,
    params: { title: string; description?: string; due_on?: string },
  ): Promise<GitHubMilestone> {
    return test.step(`GitHub REST: create milestone "${params.title}"`, async () => {
      const response = await this.request.post(`${this.baseUrl}/repos/${repo}/milestones`, {
        headers: this.authHeaders(),
        data: params,
      });

      if (!response.ok()) {
        throw new Error(
          `Failed to create milestone: ${response.status()} ${await response.text()}`,
        );
      }

      const milestone = GitHubMilestoneSchema.parse(await response.json());

      test.info().annotations.push({
        type: 'Resource Link',
        description: `Milestone #${milestone.number}: ${milestone.html_url}`,
      });

      await test.info().attach('api-response', {
        body: JSON.stringify(milestone, null, 2),
        contentType: 'application/json',
      });

      return milestone;
    });
  }

  async getMilestone(repo: string, milestoneNumber: number): Promise<GitHubMilestone> {
    return test.step(`GitHub REST: get milestone #${milestoneNumber}`, async () => {
      const response = await this.request.get(
        `${this.baseUrl}/repos/${repo}/milestones/${milestoneNumber}`,
        { headers: this.authHeaders() },
      );

      if (!response.ok()) {
        throw new Error(
          `Failed to get milestone #${milestoneNumber}: ${response.status()} ${await response.text()}`,
        );
      }

      return GitHubMilestoneSchema.parse(await response.json());
    });
  }

  async deleteMilestone(repo: string, milestoneNumber: number): Promise<void> {
    return test.step(`GitHub REST: delete milestone #${milestoneNumber}`, async () => {
      const response = await this.request.delete(
        `${this.baseUrl}/repos/${repo}/milestones/${milestoneNumber}`,
        { headers: this.authHeaders() },
      );

      if (!response.ok()) {
        console.warn(
          `Failed to delete milestone #${milestoneNumber}: ${response.status()} ${await response.text()}`,
        );
      }
    });
  }

  async updateMilestone(
    repo: string,
    milestoneNumber: number,
    params: { title?: string; description?: string; due_on?: string; state?: 'open' | 'closed' },
  ): Promise<GitHubMilestone> {
    return test.step(`GitHub REST: update milestone #${milestoneNumber}`, async () => {
      const response = await this.request.patch(
        `${this.baseUrl}/repos/${repo}/milestones/${milestoneNumber}`,
        { headers: this.authHeaders(), data: params },
      );

      if (!response.ok()) {
        throw new Error(
          `Failed to update milestone #${milestoneNumber}: ${response.status()} ${await response.text()}`,
        );
      }

      return GitHubMilestoneSchema.parse(await response.json());
    });
  }

  async updateComment(repo: string, commentId: number, body: string): Promise<GitHubComment> {
    return test.step(`GitHub REST: update comment #${commentId}`, async () => {
      const response = await this.request.patch(
        `${this.baseUrl}/repos/${repo}/issues/comments/${commentId}`,
        { headers: this.authHeaders(), data: { body } },
      );

      if (!response.ok()) {
        throw new Error(
          `Failed to update comment #${commentId}: ${response.status()} ${await response.text()}`,
        );
      }

      return GitHubCommentSchema.parse(await response.json());
    });
  }
}
