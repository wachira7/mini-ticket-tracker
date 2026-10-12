import express from 'express';
import { ZodError } from 'zod';
import { ticketsRouter } from './routes/tickets.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/tickets', ticketsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'route not found' } });
  });

  // Central error handler: one consistent error shape for the client.
  app.use((err, _req, res, _next) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: 'validation_error',
          message: 'invalid request',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'bad_json', message: 'malformed JSON body' } });
    }
    console.error(err);
    res.status(500).json({ error: { code: 'internal_error', message: 'something went wrong' } });
  });

  return app;
}
