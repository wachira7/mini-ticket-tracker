import { PrismaClient } from '@prisma/client';

// One client per process: it owns the connection pool.
// idempotency_key is internal bookkeeping, so it is never returned in query results.
export const prisma = new PrismaClient({
  omit: { ticket: { idempotency_key: true } },
});
