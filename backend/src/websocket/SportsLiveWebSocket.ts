/**
 * Sports live feed — OBSERVED game status from Polymarket Sports WebSocket.
 * Endpoint: wss://sports-api.polymarket.com/ws
 * Used only to mark markets as in-play (LIVE). Never as a trading signal alone.
 */
import WebSocket from 'ws';
import { config } from '../config/index.js';
import { logEvent, logger } from '../utils/logger.js';

export interface LiveGameState {
  gameId?: string;
  slug?: string;
  status?: string;
  ended?: boolean;
  score?: string;
  updatedAt: string;
}

const IN_PLAY = new Set([
  'inprogress',
  'in_progress',
  'live',
  '1h',
  '2h',
  'ht',
  'break',
  '1q',
  '2q',
  '3q',
  '4q',
  'ot',
  'end 1',
  'end 2',
]);

export function isInPlayStatus(status: string | null | undefined, ended?: boolean): boolean {
  if (ended === true) return false;
  if (!status) return false;
  const s = status.toLowerCase().trim();
  if (s === 'final' || s === 'ft' || s === 'canceled' || s === 'cancelled' || s === 'scheduled') {
    return false;
  }
  if (IN_PLAY.has(s)) return true;
  if (s.includes('progress') || s.includes('live')) return true;
  return false;
}

/**
 * Heuristic when Sports WS has no match: event already started and not finished.
 * Window: started within last 4 hours (typical sports match length + buffer).
 */
export function isLiveByStartTime(startTime: string | null, now = Date.now()): boolean {
  if (!startTime) return false;
  const t = Date.parse(startTime);
  if (!Number.isFinite(t)) return false;
  const ageMs = now - t;
  // started, and within last 4h
  return ageMs >= 0 && ageMs <= 4 * 60 * 60 * 1000;
}

export class SportsLiveWebSocket {
  private ws: WebSocket | null = null;
  private games = new Map<string, LiveGameState>();
  private intentionalClose = false;

  getGame(slugOrId: string): LiveGameState | undefined {
    return this.games.get(slugOrId);
  }

  isLiveSlug(slug: string | null | undefined): boolean | null {
    if (!slug) return null;
    const g =
      this.games.get(slug) ??
      [...this.games.values()].find((x) => x.slug === slug || x.gameId === slug);
    if (!g) return null;
    return isInPlayStatus(g.status, g.ended);
  }

  connect(): void {
    this.intentionalClose = false;
    this.ws = new WebSocket(config.sportsWsUrl);

    this.ws.on('open', () => {
      logEvent('websocket', 'Sports live WS connected');
    });

    this.ws.on('message', (data) => {
      const text = data.toString();
      if (text === 'ping') {
        this.ws?.send('pong');
        return;
      }
      try {
        const msg = JSON.parse(text) as Record<string, unknown>;
        const slug = String(msg.slug ?? msg.gameId ?? msg.id ?? '');
        if (!slug) return;
        const state: LiveGameState = {
          gameId: msg.gameId ? String(msg.gameId) : undefined,
          slug: msg.slug ? String(msg.slug) : slug,
          status: msg.status ? String(msg.status) : msg.period ? String(msg.period) : undefined,
          ended: Boolean(msg.ended),
          score: msg.score ? String(msg.score) : undefined,
          updatedAt: new Date().toISOString(),
        };
        this.games.set(slug, state);
        if (state.gameId) this.games.set(state.gameId, state);
      } catch (err) {
        logger.warn({ err }, 'Sports WS parse error');
      }
    });

    this.ws.on('close', () => {
      logEvent('websocket', 'Sports live WS closed');
      if (!this.intentionalClose) {
        setTimeout(() => this.connect(), 5_000);
      }
    });

    this.ws.on('error', (err) => {
      logger.error({ err }, 'Sports WS error');
    });
  }

  stop(): void {
    this.intentionalClose = true;
    this.ws?.close();
  }
}
