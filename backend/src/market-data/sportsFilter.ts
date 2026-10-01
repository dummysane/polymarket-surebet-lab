import type { MarketType, SportKey } from '@paperlab/shared';

const SPORT_ALIASES: Record<string, SportKey> = {
  soccer: 'soccer',
  football: 'football',
  soccerfootball: 'soccer',
  nba: 'nba',
  basketball: 'basketball',
  nfl: 'nfl',
  mlb: 'mlb',
  baseball: 'baseball',
  nhl: 'nhl',
  hockey: 'hockey',
  tennis: 'tennis',
  epl: 'soccer',
  ucl: 'soccer',
  mls: 'soccer',
  la: 'soccer',
  cbb: 'basketball',
  cfb: 'football',
  atp: 'tennis',
  wta: 'tennis',
};

export function normalizeSport(raw: string | null | undefined): SportKey {
  if (!raw) return 'other';
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SPORT_ALIASES[key] ?? 'other';
}

export function isSportEnabled(sport: SportKey, enabledSports: string[]): boolean {
  if (enabledSports.length === 0) return true;
  const set = new Set(enabledSports.map((s) => s.toLowerCase()));
  if (set.has(sport)) return true;
  if (sport === 'soccer' && (set.has('football') || set.has('soccer'))) return true;
  if (sport === 'basketball' && set.has('nba')) return true;
  if (sport === 'football' && set.has('nfl')) return true;
  if (sport === 'baseball' && set.has('mlb')) return true;
  if (sport === 'hockey' && set.has('nhl')) return true;
  return false;
}

export function inferMarketType(question: string, sportsMarketType?: string | null): MarketType {
  const t = (sportsMarketType ?? '').toLowerCase();
  if (t.includes('moneyline')) return 'moneyline';
  if (t.includes('spread')) return 'spread';
  if (t.includes('total')) return 'over_under';
  if (t.includes('prop')) return 'player_prop';
  if (t.includes('future')) return 'future';
  if (t.includes('draw')) return '1x2';

  const q = question.toLowerCase();
  if (q.includes('o/u') || q.includes('over') || q.includes('under')) return 'over_under';
  if (q.includes('spread') || q.includes('handicap')) return 'spread';
  if (q.includes('win') || q.includes('winner') || q.includes('beat')) return 'winner';
  if (q.includes('draw') || q.includes('1x2')) return '1x2';
  return 'binary';
}

export function isBinaryMarket(outcomes: unknown): boolean {
  if (Array.isArray(outcomes) && outcomes.length === 2) return true;
  if (typeof outcomes === 'string') {
    try {
      const parsed = JSON.parse(outcomes) as unknown;
      return Array.isArray(parsed) && parsed.length === 2;
    } catch {
      return outcomes.toLowerCase().includes('yes') && outcomes.toLowerCase().includes('no');
    }
  }
  return false;
}

export interface SportsMetadata {
  sport: string;
  tags?: string;
  image?: string;
  resolution?: string;
  ordering?: string;
}

export function parseTagIds(tagsField: string | undefined): number[] {
  if (!tagsField) return [];
  return tagsField
    .split(',')
    .map((t) => Number(t.trim()))
    .filter((n) => Number.isFinite(n));
}
