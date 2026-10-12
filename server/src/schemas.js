import { z } from 'zod';

// Single source of truth for allowed values. Must match the Prisma enums.
export const PRIORITIES = ['low', 'medium', 'high'];

export const createTicketBody = z
  .object({
    title: z.string().trim().min(1, 'title is required').max(200),
    description: z.string().trim().max(5000).optional(),
    priority: z.enum(PRIORITIES).default('medium'),
  })
  .strict(); // reject unknown fields instead of silently ignoring them

export const idempotencyKey = z.string().min(1).max(255);
