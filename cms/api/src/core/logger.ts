import pino from 'pino';
import { config } from './config/index.js';

export const logger = pino({
  level: config.isProd ? 'info' : 'debug',
  transport: config.isDev
    ? { target: 'pino/file', options: { destination: 1 } }
    : undefined,
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash'],
});
