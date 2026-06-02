import type { CreateIssueParams } from '../api/github-rest';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
}

export function uniqueTestTitle(prefix: string, suffix?: string): string {
  const base = `e2e-${uid(prefix)}`;
  return suffix ? `${base} ${suffix}` : base;
}

export function buildIssueParams(overrides: Partial<CreateIssueParams> = {}): CreateIssueParams {
  const title = overrides.title ?? uniqueTestTitle('ISSUE');
  return {
    title,
    body: overrides.body ?? `e2e-auto — ${title}`,
    labels: overrides.labels,
    assignees: overrides.assignees,
    milestone: overrides.milestone,
  };
}

export function buildMilestoneParams(
  overrides: Partial<{ title: string; description?: string; due_on?: string }> = {},
) {
  const title = overrides.title ?? uniqueTestTitle('MIL');
  return {
    title,
    due_on: overrides.due_on ?? new Date(Date.now() + 7 * 86400000).toISOString(),
    description: overrides.description,
  };
}
