import { z } from 'zod';

export const ProjectFieldOptionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .passthrough();

export const ProjectFieldIterationSchema = z
  .object({
    id: z.string(),
    title: z.string(),
  })
  .passthrough();

export const ProjectFieldTypeSchema = z.enum([
  'Status',
  'Text',
  'Number',
  'Date',
  'SingleSelect',
  'Iteration',
]);

export const ProjectFieldSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: ProjectFieldTypeSchema,
    options: z.array(ProjectFieldOptionSchema).optional(),
    iterations: z.array(ProjectFieldIterationSchema).optional(),
  })
  .passthrough();

export const ProjectItemSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    issueNumber: z.number().optional(),
    title: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();

export const ProjectViewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    number: z.number(),
  })
  .passthrough();

export const DraftConversionResultSchema = z
  .object({
    issueNumber: z.number(),
    issueNodeId: z.string(),
  })
  .passthrough();
