import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { config } from './config/index.js';
import { registerRoutes } from './api/routes.js';
import { lab } from './services/LabService.js';
import { logEvent, logger } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await app.register(websocket);

  await registerRoutes(app);

  app.get('/ws', { websocket: true }, (socket) => {
    const timer = setInterval(() => {
      socket.send(
        JSON.stringify({
          type: 'tick',
          timestamp: new Date().toISOString(),
          portfolio: lab.portfolio.getState(),
          opportunities: lab.opportunities.slice(0, 20),
          markets: [...lab.store.markets.values()].filter((m) => m.isLive).slice(0, 50),
          alerts: lab.alerts.list(5),
          strategy: 'LiveSurebetArb',
        }),
      );
    }, 2_000);

    socket.on('close', () => clearInterval(timer));
  });

  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    await app.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.sendFile('index.html');
    });
  }

  await lab.start();

  const port = Number(process.env.PORT) || config.port;
  await app.listen({ port, host: config.host });
  logEvent('server', `Live Surebet Paper Lab on http://${config.host}:${port}`, {
    realExecutionEnabled: false,
    strategy: 'LiveSurebetArb',
    liveOnly: config.liveOnly,
  });
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
