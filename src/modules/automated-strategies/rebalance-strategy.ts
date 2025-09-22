import { PublicKey } from '@solana/web3.js';
import { StrategyBase, StrategyConfig } from './strategy-base';
import { Position } from '../../types';

export interface AllocationTarget {
  tokenMint: string;
  tokenSymbol: string;
  targetPercent: number;
  minPercent?: number;
  maxPercent?: number;
  rebalanceThreshold: number; // Percentage deviation that triggers rebalancing
}

export interface RebalanceConfig extends StrategyConfig {
  allocationTargets: AllocationTarget[];
  rebalanceThreshold: number; // Overall threshold for triggering rebalance
  minRebalanceInterval: number; // Hours between rebalances
  maxSlippage: number;
  minTradeSize: number; // Minimum USD value for trades
  emergencyRebalance?: {
    enabled: boolean;
    maxDeviationPercent: number;
  };
}

export interface RebalanceAction {
  tokenMint: string;
  tokenSymbol: string;
  currentPercent: number;
  targetPercent: number;
  deviation: number;
  action: 'buy' | 'sell' | 'hold';
  tradeAmount: number;
  tradeValue: number;
}

export class RebalanceStrategy extends StrategyBase {
  private rebalanceConfig: RebalanceConfig;
  private lastRebalanceTime: Date | null = null;

  constructor(config: RebalanceConfig, userPublicKey: PublicKey) {
    super(config, userPublicKey);
    this.rebalanceConfig = config;
  }

  public getStrategyType(): string {
    return 'REBALANCE';
  }

  public getDescription(): string {
    const targets = this.rebalanceConfig.allocationTargets
      .map(t => `${t.tokenSymbol}: ${t.targetPercent}%`)
      .join(', ');
    return `Rebalance: ${targets}`;
  }

  public validateConfig(): boolean {
    const totalPercent = this.rebalanceConfig.allocationTargets
      .reduce((sum, target) => sum + target.targetPercent, 0);

    return (
      Math.abs(totalPercent - 100) < 0.01 && // Allow small rounding errors
      this.rebalanceConfig.allocationTargets.length > 1 &&
      this.rebalanceConfig.rebalanceThreshold > 0 &&
      this.rebalanceConfig.minRebalanceInterval > 0 &&
      this.rebalanceConfig.maxSlippage > 0 &&
      this.rebalanceConfig.minTradeSize > 0
    );
  }

  private async calculateCurrentAllocations(): Promise<Map<string, number>> {
    const portfolio = await this.getCurrentPortfolio();
    const totalValue = portfolio.reduce((sum, pos) => sum + (pos.balanceUiAmount * (pos.currentPrice || 0)), 0);

    const allocations = new Map<string, number>();

    for (const position of portfolio) {
      const positionValue = position.balanceUiAmount * (position.currentPrice || 0);
      const percent = totalValue > 0 ? (positionValue / totalValue) * 100 : 0;
      allocations.set(position.tokenInfo.mint, percent);
    }

    return allocations;
  }

  private calculateRebalanceActions(
    currentAllocations: Map<string, number>,
    portfolioValue: number
  ): RebalanceAction[] {
    const actions: RebalanceAction[] = [];

    for (const target of this.rebalanceConfig.allocationTargets) {
      const currentPercent = currentAllocations.get(target.tokenMint) || 0;
      const deviation = Math.abs(currentPercent - target.targetPercent);

      let action: 'buy' | 'sell' | 'hold' = 'hold';
      let tradeAmount = 0;

      if (deviation >= target.rebalanceThreshold) {
        if (currentPercent < target.targetPercent) {
          action = 'buy';
          tradeAmount = ((target.targetPercent - currentPercent) / 100) * portfolioValue;
        } else {
          action = 'sell';
          tradeAmount = ((currentPercent - target.targetPercent) / 100) * portfolioValue;
        }
      }

      actions.push({
        tokenMint: target.tokenMint,
        tokenSymbol: target.tokenSymbol,
        currentPercent,
        targetPercent: target.targetPercent,
        deviation,
        action,
        tradeAmount: Math.abs(tradeAmount),
        tradeValue: Math.abs(tradeAmount),
      });
    }

    return actions.filter(action => action.tradeValue >= this.rebalanceConfig.minTradeSize);
  }

  private async executeRebalanceAction(action: RebalanceAction, portfolio: Position[]): Promise<boolean> {
    try {
      const jupiterTrader = this.tradingEngine.getJupiterTrader();

      // Find the position for this token
      const position = portfolio.find(p => p.tokenInfo.mint === action.tokenMint);

      if (!position && action.action === 'sell') {
        console.log(`❌ Cannot sell ${action.tokenSymbol}: position not found`);
        return false;
      }

      let fromMint: string;
      let toMint: string;
      let tradeAmountBaseUnits: number;

      if (action.action === 'buy') {
        // We need to buy this token, so we sell other tokens or use a base currency
        // For simplicity, we'll assume we're buying with the first available position
        const sourcePosition = portfolio.find(p =>
          p.tokenInfo.mint !== action.tokenMint &&
          p.balanceUiAmount * (p.currentPrice || 0) >= action.tradeValue
        );

        if (!sourcePosition) {
          console.log(`❌ No suitable source token found for buying ${action.tokenSymbol}`);
          return false;
        }

        fromMint = sourcePosition.tokenInfo.mint;
        toMint = action.tokenMint;
        tradeAmountBaseUnits = (action.tradeValue / (sourcePosition.currentPrice || 1)) * Math.pow(10, sourcePosition.tokenInfo.decimals);

        console.log(`💰 Rebalance Buy: $${action.tradeValue.toFixed(2)} of ${action.tokenSymbol} (from ${sourcePosition.tokenInfo.symbol})`);

      } else { // sell
        fromMint = action.tokenMint;
        // For simplicity, sell to USDC if available, otherwise to SOL
        const usdcPosition = portfolio.find(p => p.tokenInfo.symbol === 'USDC');
        const solPosition = portfolio.find(p => p.tokenInfo.symbol === 'SOL');

        toMint = usdcPosition?.tokenInfo.mint || solPosition?.tokenInfo.mint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC fallback

        tradeAmountBaseUnits = (action.tradeValue / (position?.currentPrice || 1)) * Math.pow(10, (position?.tokenInfo.decimals || 0));

        console.log(`💰 Rebalance Sell: $${action.tradeValue.toFixed(2)} of ${action.tokenSymbol}`);
      }

      // Execute the swap
      const swapResult = await jupiterTrader.executeSwap(
        fromMint,
        toMint,
        tradeAmountBaseUnits,
        this.userPublicKey,
        this.rebalanceConfig.maxSlippage * 100, // Convert to basis points
        this.config.dryRun
      );

      // Record execution
      await this.recordExecution({
        strategyId: this.config.id,
        timestamp: new Date(),
        action: 'rebalance',
        tokenMint: action.tokenMint,
        amount: action.tradeAmount,
        price: (position?.currentPrice || 0),
        success: swapResult.success,
        error: swapResult.error,
        dryRun: this.config.dryRun,
      });

      if (swapResult.success) {
        console.log(`✅ Rebalance ${action.action} completed${this.config.dryRun ? ' (DRY RUN)' : ''}`);
        return true;
      } else {
        console.log(`❌ Rebalance ${action.action} failed: ${swapResult.error}`);
        return false;
      }

    } catch (error) {
      console.error(`Error executing rebalance action for ${action.tokenSymbol}:`, error);
      return false;
    }
  }

  private shouldTriggerEmergencyRebalance(actions: RebalanceAction[]): boolean {
    if (!this.rebalanceConfig.emergencyRebalance?.enabled) {
      return false;
    }

    const maxDeviation = Math.max(...actions.map(a => a.deviation));

    if (maxDeviation >= this.rebalanceConfig.emergencyRebalance.maxDeviationPercent) {
      console.log(`🚨 Emergency rebalance triggered: ${maxDeviation.toFixed(2)}% deviation`);
      return true;
    }

    return false;
  }

  public async execute(): Promise<boolean> {
    try {
      if (!await this.shouldExecute()) {
        return false;
      }

      console.log(`⚖️ Executing Rebalance Strategy: ${this.rebalanceConfig.name}`);

      // Check minimum rebalance interval (unless emergency)
      if (this.lastRebalanceTime) {
        const timeSinceLastRebalance = Date.now() - this.lastRebalanceTime.getTime();
        const minIntervalMs = this.rebalanceConfig.minRebalanceInterval * 60 * 60 * 1000;

        if (timeSinceLastRebalance < minIntervalMs) {
          console.log(`⏳ Rebalance interval not met: ${Math.round((minIntervalMs - timeSinceLastRebalance) / (1000 * 60))} minutes remaining`);
          return false;
        }
      }

      // Get current portfolio and calculate allocations
      const portfolio = await this.getCurrentPortfolio();
      const portfolioValue = portfolio.reduce((sum, pos) => sum + (pos.balanceUiAmount * (pos.currentPrice || 0)), 0);

      if (portfolioValue < this.rebalanceConfig.minTradeSize) {
        console.log(`❌ Portfolio value too small for rebalancing: $${portfolioValue.toFixed(2)}`);
        return false;
      }

      const currentAllocations = await this.calculateCurrentAllocations();

      // Calculate rebalance actions
      const actions = this.calculateRebalanceActions(currentAllocations, portfolioValue);

      if (actions.length === 0) {
        console.log('✅ Portfolio is already balanced');
        return false;
      }

      // Check if rebalance is needed
      const maxDeviation = Math.max(...actions.map(a => a.deviation));
      const shouldRebalance = maxDeviation >= this.rebalanceConfig.rebalanceThreshold ||
                             this.shouldTriggerEmergencyRebalance(actions);

      if (!shouldRebalance) {
        console.log(`⏳ Rebalance threshold not met: ${maxDeviation.toFixed(2)}% < ${this.rebalanceConfig.rebalanceThreshold}%`);
        return false;
      }

      console.log(`📊 Rebalancing needed - Max deviation: ${maxDeviation.toFixed(2)}%`);

      // Display current vs target allocations
      console.log('\n📈 Current vs Target Allocations:');
      for (const action of actions) {
        const status = action.action === 'hold' ? '✅' : action.action === 'buy' ? '🔼' : '🔽';
        console.log(`${status} ${action.tokenSymbol}: ${action.currentPercent.toFixed(1)}% → ${action.targetPercent}% (${action.action})`);
      }

      // Execute rebalance actions
      let successfulActions = 0;
      const significantActions = actions.filter(a => a.action !== 'hold');

      for (const action of significantActions) {
        if (await this.executeRebalanceAction(action, portfolio)) {
          successfulActions++;
        }
      }

      this.lastRebalanceTime = new Date();

      if (successfulActions > 0) {
        console.log(`✅ Rebalance completed: ${successfulActions}/${significantActions.length} actions successful${this.config.dryRun ? ' (DRY RUN)' : ''}`);
        return true;
      } else {
        console.log('❌ Rebalance failed: no actions were successful');
        return false;
      }

    } catch (error) {
      console.error('❌ Rebalance Strategy execution error:', error);
      return false;
    }
  }

  public getLastRebalanceTime(): Date | null {
    return this.lastRebalanceTime;
  }

  public async getCurrentDeviations(): Promise<RebalanceAction[]> {
    const portfolio = await this.getCurrentPortfolio();
    const portfolioValue = portfolio.reduce((sum, pos) => sum + (pos.balanceUiAmount * (pos.currentPrice || 0)), 0);
    const currentAllocations = await this.calculateCurrentAllocations();

    return this.calculateRebalanceActions(currentAllocations, portfolioValue);
  }

  public getRebalanceConfig(): RebalanceConfig {
    return { ...this.rebalanceConfig };
  }

  public updateConfig(updates: Partial<RebalanceConfig>): void {
    Object.assign(this.rebalanceConfig, updates);
    Object.assign(this.config, updates);
  }

  public addAllocationTarget(target: AllocationTarget): void {
    this.rebalanceConfig.allocationTargets.push(target);
  }

  public removeAllocationTarget(tokenMint: string): void {
    this.rebalanceConfig.allocationTargets = this.rebalanceConfig.allocationTargets
      .filter(target => target.tokenMint !== tokenMint);
  }

  public updateAllocationTarget(tokenMint: string, updates: Partial<AllocationTarget>): void {
    const target = this.rebalanceConfig.allocationTargets.find(t => t.tokenMint === tokenMint);
    if (target) {
      Object.assign(target, updates);
    }
  }
}