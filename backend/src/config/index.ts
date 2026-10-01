import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { DEFAULTS } from '@paperlab/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export const config = {
  port: num(process.env.PORT, 3001),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  databaseUrl: process.env.DATABASE_URL ?? '',
  seed: num(process.env.SEED, DEFAULTS.seed),
  initialBankroll: num(process.env.INITIAL_BANKROLL, DEFAULTS.initialBankroll),
  stakePercentage: num(process.env.STAKE_PERCENTAGE, DEFAULTS.stakePercentage),
  commission: num(process.env.COMMISSION, DEFAULTS.commission),
  targetProfit: num(process.env.TARGET_PROFIT, DEFAULTS.targetProfit),
  minOdds: num(process.env.MIN_ODDS, DEFAULTS.minOdds),
  maxOdds: num(process.env.MAX_ODDS, DEFAULTS.maxOdds),
  liveOnly: bool(process.env.LIVE_ONLY, true),
  executionDelayMs: num(process.env.EXECUTION_DELAY_MS, DEFAULTS.executionDelayMs),
  maxSlippage: num(process.env.MAX_SLIPPAGE, DEFAULTS.maxSlippage),
  executionProbability: num(process.env.EXECUTION_PROBABILITY, DEFAULTS.executionProbability),
  allowPartialFills: bool(process.env.ALLOW_PARTIAL_FILLS, DEFAULTS.allowPartialFills),
  staleDataMs: num(process.env.STALE_DATA_MS, DEFAULTS.staleDataMs),
  minLiquidity: num(process.env.MIN_LIQUIDITY, DEFAULTS.minLiquidity),
  enabledSports: (process.env.ENABLED_SPORTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  marketDataMode: (process.env.MARKET_DATA_MODE ?? 'live') as 'live' | 'mock',
  /** HARD OFF — real execution must never run in this lab */
  realExecutionEnabled: false,
  gammaBaseUrl: 'https://gamma-api.polymarket.com',
  clobBaseUrl: 'https://clob.polymarket.com',
  clobWsUrl: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
  sportsWsUrl: 'wss://sports-api.polymarket.com/ws',
  dataApiBaseUrl: 'https://data-api.polymarket.com',
  minimumTrades: num(process.env.MINIMUM_TRADES, DEFAULTS.minimumTrades),
  confidenceLevel: num(process.env.CONFIDENCE_LEVEL, DEFAULTS.confidenceLevel),
};

export type AppConfig = typeof config;
