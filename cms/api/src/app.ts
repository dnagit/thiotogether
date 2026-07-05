import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { pinoHttp } from 'pino-http';
import { Router } from 'express';

import { config } from './core/config/index.js';
import { logger } from './core/logger.js';
import { apiLimiter } from './core/middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './core/errors/errorHandler.js';
import { registerModules } from './core/modules.js';
import { modules } from './modules/index.js';

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: [config.WEBSITE_URL, config.ADMIN_URL],
      credentials: true, // refresh token travels in an httpOnly cookie
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(pinoHttp({ logger, autoLogging: config.isProd }));

  // Local storage driver serves uploads statically (immutable filenames → long cache).
  if (config.STORAGE_DRIVER === 'local') {
    app.use(
      '/uploads',
      express.static(path.resolve(process.cwd(), config.UPLOAD_DIR), {
        maxAge: '30d',
        immutable: true,
        setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
      }),
    );
  }

  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  const api = Router();
  api.use(apiLimiter);
  registerModules(api, modules);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
