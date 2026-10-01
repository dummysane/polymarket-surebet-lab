export type DataKind = 'OBSERVED' | 'SIMULATED' | 'ESTIMATED' | 'REALIZED';
export type RunMode = 'LIVE' | 'PAPER' | 'BACKTEST' | 'SIMULATION';

export type SportKey =
  | 'soccer'
  | 'football'
  | 'basketball'
  | 'nba'
  | 'nfl'
  | 'mlb'
  | 'nhl'
  | 'tennis'
  | 'baseball'
  | 'hockey'
  | 'other';

export type MarketType =
  | 'moneyline'
  | 'winner'
  | '1x2'
  | 'over_under'
  | 'team_total'
  | 'player_prop'
  | 'spread'
  | 'future'
  | 'binary'
  | 'other';

export type TradeSide = 'YES' | 'NO';

export type TradeStatus =
  | 'PENDING_EXECUTION'
  | 'FIRST_LEG_OPENED'
  | 'TARGET_REACHED'
  | 'HEDGE_SIMULATED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'SETTLED'
  | 'NO_EXECUTION'
  | 'PARTIAL_FILL'
  | 'NO_FILL';

export type TradeEventType =
  | 'FIRST_LEG_OPENED'
  | 'TARGET_REACHED'
  | 'HEDGE_SIMULATED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'SETTLED'
  | 'NO_EXECUTION'
  | 'PARTIAL_FILL'
  | 'NO_FILL'
  | 'PRICE_SNAPSHOT'
  | 'SIGNAL'
  | 'SLIPPAGE_APPLIED'
  | 'LATENCY_WAIT';

export type StrategyVerdict =
  | 'INSUFFICIENT_SAMPLE'
  | 'PROMISING'
  | 'STATISTICALLY_SIGNIFICANT'
  | 'NEGATIVE_EXPECTANCY';

export type AlertType =
  | 'OPPORTUNITY'
  | 'TARGET_NEAR'
  | 'TARGET_REACHED'
  | 'EXECUTION_SIMULATED'
  | 'TRADE_CLOSED'
  | 'DRAWDOWN_EXCEEDED'
  | 'STRATEGY_DEGRADATION'
  | 'STALE_DATA'
  | 'DATA_QUALITY';

export interface OutcomeQuote {
  outcome: TradeSide;
  tokenId: string;
  price: number;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  volume: number | null;
  liquidity: number | null;
}

export interface Market {
  id: string;
  eventId: string;
  conditionId: string | null;
  slug: string | null;
  question: string;
  sport: SportKey;
  competition: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  startTime: string | null;
  /** True when the underlying sports event is in-play (OBSERVED / inferred) */
  isLive: boolean;
  liveStatus: string | null;
  marketType: MarketType;
  active: boolean;
  closed: boolean;
  resolved: boolean;
  winningOutcome: TradeSide | null;
  umaResolutionStatus: string | null;
  yes: OutcomeQuote;
  no: OutcomeQuote;
  volume: number | null;
  liquidity: number | null;
  timestamp: string;
  dataKind: DataKind;
  mode: RunMode;
}

export interface MarketSnapshot {
  id?: string;
  timestamp: string;
  marketId: string;
  eventId: string;
  tokenId: string;
  question: string;
  outcome: TradeSide;
  price: number;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  volume: number | null;
  liquidity: number | null;
  dataKind: DataKind;
}

export type ArbPhase =
  | 'F0_SCAN_LIVE'
  | 'F1_OPEN_FAVORITE'
  | 'F2_WAIT_UNDERDOG'
  | 'F3_COMPLETE_SUREBET'
  | 'F4_LOCKED';

export type ArbAction =
  | 'NONE'
  | 'OPEN_FIRST_LEG'
  | 'MONITOR_UNDERDOG'
  | 'COMPLETE_SECOND_LEG';

export interface MarketContext {
  market: Market;
  snapshots: MarketSnapshot[];
  now: string;
  mode: RunMode;
  /** If a paper first-leg is already open on this market */
  openFirstLeg?: {
    entryOdds: number;
    entrySide: TradeSide;
    targetOdds: number;
    targetPrice: number;
    tradeId: string;
  } | null;
}

export interface StrategySignal {
  marketId: string;
  eventId: string;
  timestamp: string;
  side: TradeSide;
  hedgeSide: TradeSide;
  entryPrice: number;
  entryOdds: number;
  expectedPrice: number;
  targetOdds: number;
  underdogOddsNow: number;
  underdogPriceNow: number;
  surebetSum: number;
  surebetProfitPct: number | null;
  arbPhase: ArbPhase;
  action: ArbAction;
  edge: number;
  confidence: number;
  recommendedStake: number;
  reason: string;
  strategyName: string;
  distanceToTarget: number;
  dataKind: 'ESTIMATED';
  mode: RunMode;
}

export interface PaperTrade {
  tradeId: string;
  strategyName: string;
  marketId: string;
  eventId: string;
  timestamp: string;
  bankrollBefore: number;
  stake: number;
  entryPrice: number;
  entryOdds: number;
  entrySide: TradeSide;
  targetPrice: number;
  targetOdds: number;
  hedgeStake: number | null;
  hedgePrice: number | null;
  hedgeOdds: number | null;
  potentialProfit: number | null;
  potentialLoss: number | null;
  status: TradeStatus;
  bankrollAfter: number | null;
  pnl: number | null;
  grossProfit: number | null;
  commission: number | null;
  netProfit: number | null;
  roi: number | null;
  totalVolume: number | null;
  slippage: number | null;
  executionDelayMs: number | null;
  fillRatio: number;
  maxPriceReached: number | null;
  timeToTargetMs: number | null;
  closeReason: string | null;
  dataKind: 'SIMULATED' | 'REALIZED';
  mode: RunMode;
}

export interface PaperTradeEvent {
  id?: string;
  tradeId: string;
  timestamp: string;
  type: TradeEventType;
  payload: Record<string, unknown>;
  dataKind: DataKind;
}

export interface StrategyConfig {
  name: string;
  minOdds: number;
  maxOdds: number;
  targetProfit: number;
  stakePercentage: number;
  commission: number;
  executionDelayMs: number;
  maxSlippage: number;
  minLiquidity: number;
  executionProbability: number;
  allowPartialFills: boolean;
  enabled: boolean;
}

export interface PortfolioState {
  initialBankroll: number;
  currentBankroll: number;
  availableCapital: number;
  exposedCapital: number;
  totalPnl: number;
  roi: number;
  dataKind: 'SIMULATED';
  mode: 'PAPER' | 'BACKTEST' | 'SIMULATION';
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  level: number;
}

export interface StrategyStats {
  strategyName: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  averagePnl: number;
  medianPnl: number;
  stdPnl: number;
  profitFactor: number;
  roi: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  expectancy: number;
  ci95: ConfidenceInterval;
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  targetHitRate: number;
  targetHitCi95: ConfidenceInterval;
  breakEvenP: number;
  observedP: number;
  estimatedEdgePp: number;
  realized: StrategyStatsSlice;
  unrealized: StrategyStatsSlice;
  verdict: StrategyVerdict;
  dataKind: 'ESTIMATED' | 'REALIZED';
}

export interface StrategyStatsSlice {
  trades: number;
  pnl: number;
  roi: number;
}

export interface MonteCarloParams {
  matches: number;
  simulations: number;
  initialBankroll: number;
  stakePercentage: number;
  commission: number;
  houseMargin: number;
  slippage: number;
  executionDelayMs: number;
  targetProfit: number;
  pTargetReached: number;
  executionProbability: number;
  seed: number;
}

export interface MonteCarloResult {
  params: MonteCarloParams;
  finalBankroll: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
    mean: number;
  };
  totalPnl: { mean: number; median: number };
  roi: { mean: number; median: number };
  maxDrawdown: { mean: number; median: number };
  probabilityBankrollBelow50: number;
  probabilityBankrollBelow25: number;
  probabilityOfLosingMoney: number;
  cagrApprox: number;
  trajectories: number[][];
  meanCurve: number[];
  medianCurve: number[];
  p5Curve: number[];
  p25Curve: number[];
  p75Curve: number[];
  p95Curve: number[];
  dataKind: 'SIMULATED';
  mode: 'SIMULATION';
}

export interface DataQualityReport {
  marketId: string;
  timestamp: string;
  valid: boolean;
  stale: boolean;
  issues: string[];
  feedLatencyMs: number | null;
  dataKind: 'OBSERVED';
}

export interface PredictionOutput {
  estimatedProbability: number;
  confidence: number;
  fairPrice: number;
  dataKind: 'ESTIMATED';
  source: string;
}
