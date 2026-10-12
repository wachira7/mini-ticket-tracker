import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

// Runs against the real Postgres test database (see .env.test), not mocks:
// enums, unique constraints and ordering are the behaviour we want to verify.
const app = createApp();

beforeEach(async () => {
  await prisma.ticket.deleteMany();
});

after(async () => {
  await prisma.$disconnect();
});

const create = (body = {}, headers = {}) =>
  request(app)
    .post('/tickets')
    .set(headers)
    .send({ title: 'Printer on fire', ...body });

test('POST /tickets creates a ticket with defaults', async () => {
  const res = await create({ description: 'smoke everywhere' });

  assert.equal(res.status, 201);
  assert.equal(res.body.title, 'Printer on fire');
  assert.equal(res.body.status, 'open');
  assert.equal(res.body.priority, 'medium');
  assert.ok(Number.isInteger(res.body.id));
  assert.ok(!Number.isNaN(Date.parse(res.body.created_at)));
});

test('POST /tickets rejects invalid input with 400', async () => {
  assert.equal((await create({ title: '   ' })).status, 400);
  assert.equal((await create({ priority: 'urgent' })).status, 400);
  assert.equal((await create({ status: 'closed' })).status, 400); // unknown field on create
  assert.equal(await prisma.ticket.count(), 0);
});

test('POST /tickets with the same Idempotency-Key creates only one ticket', async () => {
  const headers = { 'Idempotency-Key': 'abc-123' };
  const first = await create({}, headers);
  const retry = await create({}, headers);

  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.id, first.body.id);
  assert.equal(await prisma.ticket.count(), 1);

  // The key is internal: it must not leak into either response.
  assert.ok(!('idempotency_key' in first.body));
  assert.ok(!('idempotency_key' in retry.body));
});

test('concurrent POSTs with the same Idempotency-Key still create one ticket', async () => {
  const headers = { 'Idempotency-Key': 'race-1' };
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => create({}, headers)));

  assert.ok(results.every((r) => r.status === 200 || r.status === 201));
  assert.equal(new Set(results.map((r) => r.body.id)).size, 1);
  assert.equal(await prisma.ticket.count(), 1);
});
