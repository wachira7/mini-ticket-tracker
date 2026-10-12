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

test('GET /tickets filters by status and paginates newest first', async () => {
  for (let i = 1; i <= 5; i++) await create({ title: `t${i}` });
  const all = (await request(app).get('/tickets?limit=100')).body.data;
  assert.deepEqual(all.map((t) => t.title), ['t5', 't4', 't3', 't2', 't1']);
  assert.ok(all.every((t) => !('idempotency_key' in t)));

  // Close t1 and t2 directly in the DB; this test is about reading, not updating.
  await prisma.ticket.updateMany({ where: { title: { in: ['t1', 't2'] } }, data: { status: 'closed' } });

  const closed = await request(app).get('/tickets?status=closed');
  assert.equal(closed.body.total, 2);
  assert.ok(closed.body.data.every((t) => t.status === 'closed'));

  const page2 = await request(app).get('/tickets?page=2&limit=2');
  assert.equal(page2.body.page, 2);
  assert.equal(page2.body.total, 5);
  assert.equal(page2.body.total_pages, 3);
  assert.deepEqual(page2.body.data.map((t) => t.title), ['t3', 't2']);
});

test('GET /tickets rejects invalid query parameters with 400', async () => {
  assert.equal((await request(app).get('/tickets?status=done')).status, 400);
  assert.equal((await request(app).get('/tickets?limit=1000')).status, 400);
  assert.equal((await request(app).get('/tickets?page=0')).status, 400);
});
