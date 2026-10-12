import { Router } from 'express';
import { prisma } from '../db.js';
import { createTicketBody, listQuery, idempotencyKey } from '../schemas.js';

export const ticketsRouter = Router();

// Express 4 doesn't catch rejected promises; wrap handlers so errors reach the error middleware.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// POST /tickets
ticketsRouter.post(
  '/',
  wrap(async (req, res) => {
    const body = createTicketBody.parse(req.body);

    const rawKey = req.get('Idempotency-Key');
    const key = rawKey === undefined ? null : idempotencyKey.parse(rawKey);

    if (key) {
      const existing = await prisma.ticket.findUnique({ where: { idempotency_key: key } });
      if (existing) return res.set('Idempotent-Replayed', 'true').status(200).json(existing);
    }

    try {
      const ticket = await prisma.ticket.create({ data: { ...body, idempotency_key: key } });
      return res.status(201).json(ticket);
    } catch (err) {
      // Two identical requests raced past the lookup above; the unique index decides the winner.
      if (err.code === 'P2002' && key) {
        const existing = await prisma.ticket.findUnique({ where: { idempotency_key: key } });
        return res.set('Idempotent-Replayed', 'true').status(200).json(existing);
      }
      throw err;
    }
  }),
);

// GET /tickets?status=&page=&limit=
ticketsRouter.get(
  '/',
  wrap(async (req, res) => {
    const { status, page, limit } = listQuery.parse(req.query);
    const where = status ? { status } : {};

    // Stable order: created_at alone can tie, so id breaks ties and pages never overlap.
    const [data, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.ticket.count({ where }),
    ]);

    res.json({ data, page, limit, total, total_pages: Math.ceil(total / limit) });
  }),
);
