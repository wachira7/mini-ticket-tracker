# Mini Ticket Tracker

A small support-ticket tracker: a REST API (Node.js, Express, Prisma, PostgreSQL) and a single-page React UI.

## Setup and run

Requirements: Node 20.6+, Yarn 1.x and Docker.

```bash
# 1. Database: starts Postgres 16 with a dev DB ("tickets") and a test DB ("tickets_test")
docker compose up -d

# 2. API
cd server
cp .env.example .env
cp .env.test.example .env.test
yarn
yarn db:deploy        # apply migrations to the dev DB
yarn dev              # http://localhost:3000

# 3. UI (second terminal)
cd client
yarn
yarn dev              # http://localhost:5173
```

The UI dev server proxies `/tickets` to the API on port 3000, so start the API first.

If you already had a `pgdata` volume from an earlier run, the test DB isn't created automatically:

```bash
docker compose exec db psql -U tickets -c "CREATE DATABASE tickets_test;"
```

## Tests

```bash
cd server
yarn test
```

Nine integration tests run against a real Postgres database (`tickets_test`) using Node's built-in test runner and Supertest. `yarn test` applies migrations to the test DB first.

## API

| Method | Path | Notes |
| ------ | ---- | ----- |
| POST | `/tickets` | Body: `title` (required, max 200), `description?`, `priority?` (default `medium`). New tickets start `open`. Optional `Idempotency-Key` header. Returns `201`, or `200` with the original ticket when a key is replayed. |
| GET | `/tickets` | Query: `status?`, `page` (default 1), `limit` (default 20, max 100). Newest first. Returns `{ data, page, limit, total, total_pages }`. |
| PATCH | `/tickets/:id` | Body: `status?` and/or `priority?`. `404` if the ticket doesn't exist. |
| GET | `/tickets/stats` | `{ open, in_progress, closed, total }`, zeros included. |

Errors share one shape: `{ "error": { "code", "message", "details?" } }`. Invalid input returns `400`.

Ticket fields: `id`, `title`, `description`, `status` (`open | in_progress | closed`), `priority` (`low | medium | high`), `created_at`, `updated_at`.

## Project layout

```
server/
  prisma/            schema and migrations
  src/app.js         Express app and central error handler
  src/routes/        ticket routes
  src/schemas.js     zod validation (single source of allowed values)
  src/db.js          Prisma client
  test/              integration tests
client/              Vite + React single page
docker-compose.yml   Postgres 16
```

## Decisions & Tradeoffs

- I used offset pagination because the brief asks for `page` and `limit` and the dataset here is small. It gets slow on deep pages and can skip or repeat a row if tickets are created while someone is paging; keyset/cursor pagination would be the next step for a large table.
- The list endpoint runs the page query and the count as two separate queries, so `total` can be off by one under concurrent writes. I accepted that rather than wrapping them in a transaction.
- Concurrent updates are last-write-wins. That is fine for status and priority, but I would add a `version` column and return `409` on conflict before allowing edits to title or description.
- The one thing I added beyond the brief is an optional `Idempotency-Key` on `POST /tickets`, backed by a unique index, so a retried or double-clicked submit cannot create a duplicate. Its limits: a reused key with a different body just returns the original ticket, and keys never expire.
- Any status can move to any other status. A real tracker would probably restrict transitions, for example requiring a reason to reopen a closed ticket.
- Tests hit a real Postgres database instead of mocks, because enums, the unique constraint and ordering are database behaviour. They are slower and need Docker running.
- Left out on purpose: authentication, deleting tickets, assignment, editing title or description, frontend tests and CI.
- The UI is plain React and CSS with no component library. It updates the list optimistically and then reloads from the server, which costs an extra request per change but keeps the counts correct.
- Configuration is a single `.env` file per environment and the dev database password is in `docker-compose.yml`; a real deployment would use managed secrets.

## AI assistance

I built this with AI assistance (Claude).
