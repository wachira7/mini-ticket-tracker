import { z } from 'zod';

// Single source of truth for allowed values. Must match the Prisma enums.
export const STATUSES = ['open', 'in_progress', 'closed'];
export const PRIORITIES = ['low', 'medium', 'high'];

export const createTicketBody = z
  .object({
    title: z.string().trim().min(1, 'title is required').max(200),
    description: z.string().trim().max(5000).optional(),
    priority: z.enum(PRIORITIES).default('medium'),
  })
  .strict(); // reject unknown fields instead of silently ignoring them

// At least one field, and only the two the spec allows to change.
export const patchTicketBody = z
  .object({
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
  })
  .strict()
  .refine((b) => b.status !== undefined || b.priority !== undefined, {
    message: 'provide status and/or priority',
  });

const PG_INT_MAX = 2147483647;

export const ticketIdParam = z.object({
  id: z.coerce.number().int().positive().max(PG_INT_MAX),
});

export const listQuery = z.object({
  status: z.enum(STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const idempotencyKey = z.string().min(1).max(255);
