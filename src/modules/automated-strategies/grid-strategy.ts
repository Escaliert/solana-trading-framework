import { PublicKey } from '@solana/web3.js';
import { StrategyBase, StrategyConfig } from './strategy-base';

export interface GridLevel {
  price: number;
  buyAmount: number;
  sellAmount: number;
  filled: boolean;
  side: 'buy' | 'sell';
  orderId?: string;
}

export interface GridConfig extends StrategyConfig {
  baseTokenMint: string;
  baseTokenSymbol: string;
  quoteTokenMint: string;
  quoteTokenSymbol: string;
  gridLevels: number;
  priceRange: {
    min: number;
    max: number;
  };
  investmentAmount: number; // Total amount to use for grid
  rebalanceOnFill: boolean;
  stopLossPercent?: number;
  takeProfitPercent?: number;
}

export class GridStrategy extends StrategyBase {
  private gridConfig: GridConfig;
  private gridLevels: GridLevel[] = [];
  private currentPrice: number = 0;

  constructor(config: GridConfig, userPublicKey: PublicKey) {
    super(config, userPublicKey);
    this.gridConfig = config;
    this.initializeGrid();
  }

  public getStrategyType(): string {
    return 'GRID';
  }

  public getDescription(): string {
    return `Grid: ${this.gridConfig.gridLevels} levels between $${this.gridConfig.priceRange.min}-$${this.gridConfig.priceRange.max} for ${this.gridConfig.baseTokenSymbol}/${this.gridConfig.quoteTokenSymbol}`;
  }

  public validateConfig(): boolean {
    return (
      this.gridConfig.gridLevels > 2 &&
      this.gridConfig.priceRange.min > 0 &&
      this.gridConfig.priceRange.max > this.gridConfig.priceRange.min &&
      this.gridConfig.investmentAmount > 0 &&
      this.gridConfig.baseTokenMint.length > 0 &&
      this.gridConfig.quoteTokenMint.length > 0
    );
  }

  private initializeGrid(): void {
    const priceStep = (this.gridConfig.priceRange.max - this.gridConfig.priceRange.min) / (this.gridConfig.gridLevels - 1);
    const amountPerLevel = this.gridConfig.investmentAmount / this.gridConfig.gridLevels;

    this.gridLevels = [];

    for (let i = 0; i < this.gridConfig.gridLevels; i++) {
      const price = this.gridConfig.priceRange.min + (i * priceStep);

      // Create buy and sell levels
      this.gridLevels.push({
        price: price * 0.99, // Buy slightly below
        buyAmount: amountPerLevel / (price * 0.99),
        sellAmount: 0,
        filled: false,
        side: 'buy',
      });

      this.gridLevels.push({
        price: price * 1.01, // Sell slightly above
        buyAmount: 0,
        sellAmount: amountPerLevel / (price * 1.01),
        filled: false,
        side: 'sell',
      });
    }

    // Sort by price
    this.gridLevels.sort((a, b) => a.price - b.price);

    console.log(`🔲 Grid initialized with ${this.gridLevels.length} levels`);
  }

  private async updateCurrentPrice(): Promise<boolean> {
    try {
      const jupiterTrader = this.tradingEngine.getJupiterTrader();

      // Get a small quote to determine current price
      const testAmount = 1000000; // 1 token worth in base units
      const quote = await jupiterTrader.getSwapQuote(
        this.gridConfig.baseTokenMint,
        this.gridConfig.quoteTokenMint,
        testAmount,
        100
      );

      if (!quote) {
        return false;
      }

      const outputAmount = parseInt(quote.otherAmountThreshold);
      this.currentPrice = outputAmount / testAmount;

      return true;
    } catch (error) {
      console.error('Error updating price for grid:', error);
      return false;
    }
  }

  private getActiveGridLevels(): GridLevel[] {
    // Return levels that should be active based on current price
    const tolerance = 0.05; // 5% tolerance
    return this.gridLevels.filter(level => {
      const priceDistance = Math.abs(level.price - this.currentPrice) / this.currentPrice;
      return priceDistance <= tolerance && !level.filled;
    });
  }

  private async executeBuyLevel(level: GridLevel): Promise<boolean> {
    try {
      console.log(`💰 Grid Buy: ${level.buyAmount.toFixed(6)} ${this.gridConfig.baseTokenSymbol} at $${level.price.toFixed(4)}`);

      const jupiterTrader = this.tradingEngine.getJupiterTrader();

      const swapResult = await jupiterTrader.executeSwap(
        this.gridConfig.quoteTokenMint,
        this.gridConfig.baseTokenMint,
        level.price * level.buyAmount * Math.pow(10, 6), // Quote amount
        this.userPublicKey,
        100,
        this.config.dryRun
      );

      await this.recordExecution({
        strategyId: this.config.id,
        timestamp: new Date(),
        action: 'buy',
        tokenMint: this.gridConfig.baseTokenMint,
        amount: level.buyAmount,
        price: level.price,
        success: swapResult.success,
        error: swapResult.error,
        dryRun: this.config.dryRun,
      });

      if (swapResult.success) {
        level.filled = true;
        console.log(`✅ Grid buy level filled at $${level.price.toFixed(4)}`);

        // Create corresponding sell level if rebalancing is enabled
        if (this.gridConfig.rebalanceOnFill) {
          this.createSellLevel(level);
        }
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error executing grid buy level:', error);
      return false;
    }
  }

  private async executeSellLevel(level: GridLevel): Promise<boolean> {
    try {
      console.log(`💰 Grid Sell: ${level.sellAmount.toFixed(6)} ${this.gridConfig.baseTokenSymbol} at $${level.price.toFixed(4)}`);

      const jupiterTrader = this.tradingEngine.getJupiterTrader();
      const sellAmountBaseUnits = level.sellAmount * Math.pow(10, 6); // Assuming 6 decimals

      const swapResult = await jupiterTrader.executeSwap(
        this.gridConfig.baseTokenMint,
        this.gridConfig.quoteTokenMint,
        sellAmountBaseUnits,
        this.userPublicKey,
        100,
        this.config.dryRun
      );

      await this.recordExecution({
        strategyId: this.config.id,
        timestamp: new Date(),
        action: 'sell',
        tokenMint: this.gridConfig.baseTokenMint,
        amount: level.sellAmount,
        price: level.price,
        success: swapResult.success,
        error: swapResult.error,
        dryRun: this.config.dryRun,
      });

      if (swapResult.success) {
        level.filled = true;
        console.log(`✅ Grid sell level filled at $${level.price.toFixed(4)}`);

        // Create corresponding buy level if rebalancing is enabled
        if (this.gridConfig.rebalanceOnFill) {
          this.createBuyLevel(level);
        }
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error executing grid sell level:', error);
      return false;
    }
  }

  private createSellLevel(filledBuyLevel: GridLevel): void {
    const sellPrice = filledBuyLevel.price * 1.02; // 2% profit target
    const newSellLevel: GridLevel = {
      price: sellPrice,
      buyAmount: 0,
      sellAmount: filledBuyLevel.buyAmount,
      filled: false,
      side: 'sell',
    };

    this.gridLevels.push(newSellLevel);
    console.log(`🔲 Created sell level at $${sellPrice.toFixed(4)}`);
  }

  private createBuyLevel(filledSellLevel: GridLevel): void {
    const buyPrice = filledSellLevel.price * 0.98; // 2% discount
    const newBuyLevel: GridLevel = {
      price: buyPrice,
      buyAmount: filledSellLevel.sellAmount,
      sellAmount: 0,
      filled: false,
      side: 'buy',
    };

    this.gridLevels.push(newBuyLevel);
    console.log(`🔲 Created buy level at $${buyPrice.toFixed(4)}`);
  }

  private checkStopLoss(): boolean {
    if (!this.gridConfig.stopLossPercent || this.currentPrice === 0) {
      return false;
    }

    const centerPrice = (this.gridConfig.priceRange.min + this.gridConfig.priceRange.max) / 2;
    const lossPercent = ((centerPrice - this.currentPrice) / centerPrice) * 100;

    if (lossPercent >= this.gridConfig.stopLossPercent) {
      console.log(`🛑 Grid stop loss triggered: ${lossPercent.toFixed(2)}% loss`);
      return true;
    }

    return false;
  }

  private checkTakeProfit(): boolean {
    if (!this.gridConfig.takeProfitPercent) {
      return false;
    }

    const metrics = this.getMetrics();
    const profitPercent = (metrics.totalProfit / this.gridConfig.investmentAmount) * 100;

    if (profitPercent >= this.gridConfig.takeProfitPercent) {
      console.log(`🎯 Grid take profit triggered: ${profitPercent.toFixed(2)}% profit`);
      return true;
    }

    return false;
  }

  public async execute(): Promise<boolean> {
    try {
      if (!await this.shouldExecute()) {
        return false;
      }

      console.log(`🔲 Executing Grid Strategy: ${this.gridConfig.name}`);

      // Update current price
      if (!await this.updateCurrentPrice()) {
        console.log('❌ Failed to update price for grid strategy');
        return false;
      }

      console.log(`📊 Current price: $${this.currentPrice.toFixed(4)}`);

      // Check stop loss and take profit
      if (this.checkStopLoss() || this.checkTakeProfit()) {
        this.config.enabled = false;
        console.log('🛑 Grid strategy stopped due to risk management');
        return false;
      }

      // Get active grid levels
      const activeLevels = this.getActiveGridLevels();
      console.log(`🔲 ${activeLevels.length} active grid levels`);

      let executedAny = false;

      // Execute buy levels
      const buyLevels = activeLevels.filter(l => l.side === 'buy' && this.currentPrice <= l.price);
      for (const level of buyLevels) {
        if (await this.executeBuyLevel(level)) {
          executedAny = true;
          break; // Execute one at a time
        }
      }

      // Execute sell levels
      const sellLevels = activeLevels.filter(l => l.side === 'sell' && this.currentPrice >= l.price);
      for (const level of sellLevels) {
        if (await this.executeSellLevel(level)) {
          executedAny = true;
          break; // Execute one at a time
        }
      }

      if (!executedAny) {
        console.log('⏳ No grid levels triggered at current price');
      }

      return executedAny;

    } catch (error) {
      console.error('❌ Grid Strategy execution error:', error);
      return false;
    }
  }

  public getGridLevels(): GridLevel[] {
    return [...this.gridLevels];
  }

  public getCurrentPrice(): number {
    return this.currentPrice;
  }

  public getGridConfig(): GridConfig {
    return { ...this.gridConfig };
  }

  public resetGrid(): void {
    this.initializeGrid();
    console.log('🔄 Grid levels reset');
  }

  public updateConfig(updates: Partial<GridConfig>): void {
    Object.assign(this.gridConfig, updates);
    Object.assign(this.config, updates);

    // Reinitialize grid if price range or levels changed
    if (updates.priceRange || updates.gridLevels || updates.investmentAmount) {
      this.initializeGrid();
    }
  }
}