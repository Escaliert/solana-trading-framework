import { PublicKey } from '@solana/web3.js';
import { TradingEngine } from '../trading-engine';
import { PortfolioTracker } from '../portfolio-tracker';
import { Position } from '../../types';

export interface StrategyConfig {
  id: string;
  name: string;
  enabled: boolean;
  dryRun: boolean;
  created: Date;
  lastExecution?: Date;
  executionCount: number;
  totalProfit: number;
  maxDrawdown: number;
}

export interface StrategyExecution {
  id: string;
  strategyId: string;
  timestamp: Date;
  action: 'buy' | 'sell' | 'rebalance';
  tokenMint: string;
  amount: number;
  price: number;
  success: boolean;
  error?: string | undefined;
  dryRun: boolean;
}

export interface StrategyMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  totalProfit: number;
  totalLoss: number;
  maxDrawdown: number;
  sharpeRatio?: number;
  winRate: number;
  averageReturn: number;
}

export abstract class StrategyBase {
  protected config: StrategyConfig;
  protected tradingEngine: TradingEngine;
  protected portfolioTracker: PortfolioTracker;
  protected userPublicKey: PublicKey;
  protected executions: StrategyExecution[] = [];

  constructor(
    config: StrategyConfig,
    userPublicKey: PublicKey
  ) {
    this.config = config;
    this.userPublicKey = userPublicKey;
    this.tradingEngine = TradingEngine.getInstance();
    this.portfolioTracker = PortfolioTracker.getInstance();
  }

  public getConfig(): StrategyConfig {
    return { ...this.config };
  }

  public getExecutions(): StrategyExecution[] {
    return [...this.executions];
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  public isDryRun(): boolean {
    return this.config.dryRun;
  }

  public setDryRun(dryRun: boolean): void {
    this.config.dryRun = dryRun;
  }

  public getMetrics(): StrategyMetrics {
    const successfulExecutions = this.executions.filter(e => e.success).length;
    const profits = this.executions.filter(e => e.success && e.action === 'sell');
    const losses = this.executions.filter(e => e.success && e.action === 'sell');

    const totalProfit = profits.reduce((sum, e) => sum + (e.price * e.amount), 0);
    const totalLoss = losses.reduce((sum, e) => sum + (e.price * e.amount), 0);

    return {
      totalExecutions: this.executions.length,
      successfulExecutions,
      totalProfit,
      totalLoss,
      maxDrawdown: this.config.maxDrawdown,
      winRate: this.executions.length > 0 ? successfulExecutions / this.executions.length : 0,
      averageReturn: this.config.totalProfit,
    };
  }

  protected async recordExecution(execution: Omit<StrategyExecution, 'id'>): Promise<void> {
    const fullExecution: StrategyExecution = {
      ...execution,
      id: `${execution.strategyId}_${Date.now()}`,
    };

    this.executions.push(fullExecution);
    this.config.executionCount++;
    this.config.lastExecution = execution.timestamp;

    if (execution.success && execution.action === 'sell') {
      // Update profit/loss tracking
      const profit = execution.price * execution.amount;
      this.config.totalProfit += profit;
    }

    console.log(`📋 Strategy execution recorded: ${execution.action} ${execution.amount} ${execution.tokenMint}`);
  }

  protected async getCurrentPortfolio(): Promise<Position[]> {
    const portfolio = await this.portfolioTracker.updatePortfolio();
    return portfolio.positions;
  }

  protected async shouldExecute(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    // Implement cooldown logic
    if (this.config.lastExecution) {
      const timeSinceLastExecution = Date.now() - this.config.lastExecution.getTime();
      const minInterval = 60000; // 1 minute minimum between executions

      if (timeSinceLastExecution < minInterval) {
        return false;
      }
    }

    return true;
  }

  // Abstract methods that each strategy must implement
  public abstract execute(): Promise<boolean>;
  public abstract validateConfig(): boolean;
  public abstract getStrategyType(): string;
  public abstract getDescription(): string;
}