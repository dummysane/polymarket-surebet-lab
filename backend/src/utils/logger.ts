import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.logLevel,
  transport:
    config.nodeEnv === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
});

export function logEvent(
  category: string,
  message: string,
  payload?: Record<string, unknown>,
): void {
  logger.info({ category, ts: new Date().toISOString(), ...payload }, message);
}
