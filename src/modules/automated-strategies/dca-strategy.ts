import { PublicKey } from '@solana/web3.js';
import { StrategyBase, StrategyConfig } from './strategy-base';

export interface DCAConfig extends StrategyConfig {
  targetTokenMint: string;
  targetTokenSymbol: string;
  baseTokenMint: string; // Usually USDC or SOL
  baseTokenSymbol: string;
  buyAmountUsd: number;
  intervalHours: number;
  maxTotalInvestment?: number;
  priceThresholds?: {
    minPrice?: number;
    maxPrice?: number;
  };
}

export class DCAStrategy extends StrategyBase {
  private dcaConfig: DCAConfig;
  private nextExecutionTime: Date;

  constructor(config: DCAConfig, userPublicKey: PublicKey) {
    super(config, userPublicKey);
    this.dcaConfig = config;
    this.nextExecutionTime = new Date(Date.now() + config.intervalHours * 60 * 60 * 1000);
  }

  public getStrategyType(): string {
    return 'DCA';
  }

  public getDescription(): string {
    return `DCA: Buy $${this.dcaConfig.buyAmountUsd} of ${this.dcaConfig.targetTokenSymbol} every ${this.dcaConfig.intervalHours}h`;
  }

  public validateConfig(): boolean {
    return (
      this.dcaConfig.buyAmountUsd > 0 &&
      this.dcaConfig.intervalHours > 0 &&
      this.dcaConfig.targetTokenMint.length > 0 &&
      this.dcaConfig.baseTokenMint.length > 0
    );
  }

  public async execute(): Promise<boolean> {
    try {
      if (!await this.shouldExecute()) {
        return false;
      }

      console.log(`🔄 Executing DCA Strategy: ${this.dcaConfig.name}`);

      // Check if it's time for next DCA buy
      if (Date.now() < this.nextExecutionTime.getTime()) {
        console.log(`⏳ Next DCA execution in ${Math.round((this.nextExecutionTime.getTime() - Date.now()) / (1000 * 60))} minutes`);
        return false;
      }

      // Check total investment limits
      if (this.dcaConfig.maxTotalInvestment) {
        const totalInvested = this.executions
          .filter(e => e.success && e.action === 'buy')
          .reduce((sum, e) => sum + (e.price * e.amount), 0);

        if (totalInvested >= this.dcaConfig.maxTotalInvestment) {
          console.log(`🛑 DCA limit reached: $${totalInvested} >= $${this.dcaConfig.maxTotalInvestment}`);
          return false;
        }
      }

      // Get current portfolio to check base token balance
      const portfolio = await this.getCurrentPortfolio();
      const baseTokenPosition = portfolio.find(p => p.tokenInfo.mint === this.dcaConfig.baseTokenMint);

      if (!baseTokenPosition) {
        console.log(`❌ No ${this.dcaConfig.baseTokenSymbol} balance found for DCA`);
        return false;
      }

      const currentPrice = baseTokenPosition.currentPrice || 0;
      const baseTokenValue = baseTokenPosition.balanceUiAmount * currentPrice;

      if (baseTokenValue < this.dcaConfig.buyAmountUsd) {
        console.log(`❌ Insufficient ${this.dcaConfig.baseTokenSymbol} balance: $${baseTokenValue.toFixed(2)} < $${this.dcaConfig.buyAmountUsd}`);
        return false;
      }

      // Get current price and check thresholds
      const jupiterTrader = this.tradingEngine.getJupiterTrader();
      const targetToken = await jupiterTrader.findTokenBySymbol(this.dcaConfig.targetTokenSymbol);

      if (!targetToken) {
        console.log(`❌ Target token ${this.dcaConfig.targetTokenSymbol} not found`);
        return false;
      }

      // Get quote for the DCA buy
      const buyAmountBaseUnits = (this.dcaConfig.buyAmountUsd / currentPrice) * Math.pow(10, baseTokenPosition.tokenInfo.decimals);

      const quote = await jupiterTrader.getSwapQuote(
        this.dcaConfig.baseTokenMint,
        this.dcaConfig.targetTokenMint,
        buyAmountBaseUnits,
        100 // 1% slippage
      );

      if (!quote) {
        console.log('❌ Failed to get swap quote for DCA');
        return false;
      }

      const outputAmount = parseInt(quote.otherAmountThreshold);
      const priceImpact = parseFloat(quote.priceImpactPct);
      const targetTokenAmount = outputAmount / Math.pow(10, targetToken.decimals);
      const effectivePrice = this.dcaConfig.buyAmountUsd / targetTokenAmount;

      // Check price thresholds
      if (this.dcaConfig.priceThresholds?.minPrice && effectivePrice < this.dcaConfig.priceThresholds.minPrice) {
        console.log(`⏳ Price below threshold: $${effectivePrice} < $${this.dcaConfig.priceThresholds.minPrice}`);
        this.nextExecutionTime = new Date(Date.now() + this.dcaConfig.intervalHours * 60 * 60 * 1000);
        return false;
      }

      if (this.dcaConfig.priceThresholds?.maxPrice && effectivePrice > this.dcaConfig.priceThresholds.maxPrice) {
        console.log(`⏳ Price above threshold: $${effectivePrice} > $${this.dcaConfig.priceThresholds.maxPrice}`);
        this.nextExecutionTime = new Date(Date.now() + this.dcaConfig.intervalHours * 60 * 60 * 1000);
        return false;
      }

      // Safety check: reject high price impact
      if (priceImpact > 2) {
        console.log(`❌ Price impact too high for DCA: ${priceImpact}%`);
        return false;
      }

      console.log(`✅ DCA Buy: $${this.dcaConfig.buyAmountUsd} → ${targetTokenAmount.toFixed(6)} ${this.dcaConfig.targetTokenSymbol}`);
      console.log(`📊 Price: $${effectivePrice.toFixed(6)} | Impact: ${priceImpact}%`);

      // Execute the trade (in DRY RUN mode by default)
      const swapResult = await jupiterTrader.executeSwap(
        this.dcaConfig.baseTokenMint,
        this.dcaConfig.targetTokenMint,
        buyAmountBaseUnits,
        this.userPublicKey,
        100,
        this.config.dryRun
      );

      // Record execution
      await this.recordExecution({
        strategyId: this.config.id,
        timestamp: new Date(),
        action: 'buy',
        tokenMint: this.dcaConfig.targetTokenMint,
        amount: targetTokenAmount,
        price: effectivePrice,
        success: swapResult.success,
        error: swapResult.error,
        dryRun: this.config.dryRun,
      });

      // Schedule next execution
      this.nextExecutionTime = new Date(Date.now() + this.dcaConfig.intervalHours * 60 * 60 * 1000);

      if (swapResult.success) {
        console.log(`✅ DCA execution completed${this.config.dryRun ? ' (DRY RUN)' : ''}`);
        console.log(`⏰ Next DCA: ${this.nextExecutionTime.toLocaleString()}`);
        return true;
      } else {
        console.log(`❌ DCA execution failed: ${swapResult.error}`);
        return false;
      }

    } catch (error) {
      console.error('❌ DCA Strategy execution error:', error);
      return false;
    }
  }

  public getNextExecutionTime(): Date {
    return this.nextExecutionTime;
  }

  public getDCAConfig(): DCAConfig {
    return { ...this.dcaConfig };
  }

  public updateConfig(updates: Partial<DCAConfig>): void {
    Object.assign(this.dcaConfig, updates);
    Object.assign(this.config, updates);
  }
}