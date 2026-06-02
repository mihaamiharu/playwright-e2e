import type { CreateIssueParams } from '../api/github-rest';

let seq = 0;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${++seq}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createTestIssueTitle(prefix: string, suffix?: string): string {
  const base = `e2e-${uid(prefix)}`;
  return suffix ? `${base} ${suffix}` : base;
}

export function createTestIssue(overrides: Partial<CreateIssueParams> = {}): CreateIssueParams {
  const title = overrides.title ?? createTestIssueTitle('ISSUE');
  return {
    title,
    body: overrides.body ?? `e2e-auto — ${title}`,
    labels: overrides.labels,
    assignees: overrides.assignees,
    milestone: overrides.milestone,
  };
}

export function createTestMilestone(
  overrides: Partial<{ title: string; description?: string; due_on?: string }> = {},
) {
  const title = overrides.title ?? createTestIssueTitle('MIL');
  return {
    title,
    due_on: overrides.due_on ?? new Date(Date.now() + 7 * 86400000).toISOString(),
    ...overrides,
  };
}
