import { createApp } from './app.js';
import { prisma } from './db.js';

const port = Number(process.env.PORT) || 3000;
const server = createApp().listen(port, () => console.log(`API listening on :${port}`));

// Finish in-flight requests and release DB connections on deploy/restart.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}
