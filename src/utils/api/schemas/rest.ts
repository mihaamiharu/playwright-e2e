import { z } from 'zod';

export const GitHubLabelSchema = z
  .object({
    name: z.string(),
    color: z.string(),
    description: z.string().optional(),
  })
  .passthrough();

export const GitHubIssueSchema = z
  .object({
    number: z.number(),
    node_id: z.string(),
    html_url: z.string().url(),
    title: z.string(),
    body: z.string().nullable(),
    state: z.string(),
    labels: z.array(GitHubLabelSchema),
  })
  .passthrough();

export const GitHubCommentSchema = z
  .object({
    id: z.number(),
    node_id: z.string(),
    body: z.string(),
    html_url: z.string().url(),
  })
  .passthrough();

export const GitHubMilestoneSchema = z
  .object({
    number: z.number(),
    title: z.string(),
    description: z.string().nullable(),
    due_on: z.string().nullable(),
    open_issues: z.number(),
    closed_issues: z.number(),
    state: z.enum(['open', 'closed']),
    html_url: z.string().url(),
  })
  .passthrough();

export const CreateIssueParamsSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  milestone: z.number().optional(),
});

export const UpdateIssueParamsSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  state: z.enum(['open', 'closed']).optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  milestone: z.number().optional(),
});
