import { createApp } from './app.js';
import { config } from './core/config/index.js';
import { logger } from './core/logger.js';
import { rawPrisma } from './core/database/prisma.js';

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info(`🚀 API listening on ${config.APP_URL} (env: ${config.NODE_ENV})`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await rawPrisma.$disconnect();
    process.exit(0);
  });
  // Force-exit if connections refuse to drain.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
