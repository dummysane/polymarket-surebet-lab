import type { PortfolioState } from '@paperlab/shared';
import { stakeFromBankroll } from '@paperlab/shared';
import { config } from '../config/index.js';
import { logEvent } from '../utils/logger.js';

export class PortfolioManager {
  private initial: number;
  private bankroll: number;
  private exposed = 0;
  private stakePercentage: number;
  private equityCurve: number[] = [];
  private mode: 'PAPER' | 'BACKTEST' | 'SIMULATION' = 'PAPER';

  constructor(initialBankroll = config.initialBankroll, stakePercentage = config.stakePercentage) {
    this.initial = initialBankroll;
    this.bankroll = initialBankroll;
    this.stakePercentage = stakePercentage;
    this.equityCurve.push(initialBankroll);
  }

  setStakePercentage(pct: number): void {
    this.stakePercentage = pct;
  }

  setMode(mode: 'PAPER' | 'BACKTEST' | 'SIMULATION'): void {
    this.mode = mode;
  }

  reset(initial = config.initialBankroll): void {
    this.initial = initial;
    this.bankroll = initial;
    this.exposed = 0;
    this.equityCurve = [initial];
  }

  getState(): PortfolioState {
    return {
      initialBankroll: this.initial,
      currentBankroll: this.bankroll,
      availableCapital: Math.max(0, this.bankroll - this.exposed),
      exposedCapital: this.exposed,
      totalPnl: this.bankroll - this.initial,
      roi: this.initial > 0 ? (this.bankroll - this.initial) / this.initial : 0,
      dataKind: 'SIMULATED',
      mode: this.mode,
    };
  }

  recommendedStake(): number {
    return stakeFromBankroll(this.bankroll, this.stakePercentage);
  }

  reserve(stake: number): { bankrollBefore: number; ok: boolean } {
    const bankrollBefore = this.bankroll;
    const available = this.bankroll - this.exposed;
    if (stake > available) {
      return { bankrollBefore, ok: false };
    }
    this.exposed += stake;
    logEvent('paper', 'Capital reserved', { stake, exposed: this.exposed, dataKind: 'SIMULATED' });
    return { bankrollBefore, ok: true };
  }

  release(stake: number): void {
    this.exposed = Math.max(0, this.exposed - stake);
  }

  applyPnl(pnl: number, releaseStake: number): number {
    this.release(releaseStake);
    this.bankroll += pnl;
    this.equityCurve.push(this.bankroll);
    logEvent('paper', 'Bankroll updated', {
      pnl,
      bankroll: this.bankroll,
      dataKind: 'SIMULATED',
    });
    return this.bankroll;
  }

  getEquityCurve(): number[] {
    return [...this.equityCurve];
  }
}
