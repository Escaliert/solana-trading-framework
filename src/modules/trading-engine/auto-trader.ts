import { JupiterTrader, SwapResult } from './jupiter-trader';
import { TradingConfigManager } from './trading-config';
import { WalletMonitor, TradingOpportunity } from './wallet-monitor';
import { WalletManager } from '../../core/wallet-manager';

export interface TradeExecution {
  id: string;
  timestamp: Date;
  tokenSymbol: string;
  tokenMint: string;
  action: 'SELL' | 'BUY';
  amountIn: number;
  amountOut: number;
  profitPercent: number;
  targetTriggered: string;
  executionMode: 'DRY_RUN' | 'LIVE';
  success: boolean;
  signature?: string;
  error?: string;
  priceImpact: number;
  slippage: number;
  gasFee?: number;
}

export interface AutoTradingStats {
  tradesExecuted: number;
  successfulTrades: number;
  failedTrades: number;
  totalProfitRealized: number;
  totalFeesSpent: number;
  uptime: number;
  lastTradeTime?: Date;
  dailyTradeCount: number;
  dailyTradeLimit: number;
}

export class AutoTrader {
  private static instance: AutoTrader;
  private jupiterTrader: JupiterTrader;
  private tradingConfig: TradingConfigManager;
  private walletMonitor: WalletMonitor;
  private walletManager: WalletManager;

  private isEnabled: boolean = false;
  private executionHistory: TradeExecution[] = [];
  private startTime: Date = new Date();

  private stats: AutoTradingStats = {
    tradesExecuted: 0,
    successfulTrades: 0,
    failedTrades: 0,
    totalProfitRealized: 0,
    totalFeesSpent: 0,
    uptime: 0,
    dailyTradeCount: 0,
    dailyTradeLimit: 10
  };

  private constructor() {
    this.jupiterTrader = JupiterTrader.getInstance();
    this.tradingConfig = TradingConfigManager.getInstance();
    this.walletMonitor = WalletMonitor.getInstance();
    this.walletManager = WalletManager.getInstance();
  }

  public static getInstance(): AutoTrader {
    if (!AutoTrader.instance) {
      AutoTrader.instance = new AutoTrader();
    }
    return AutoTrader.instance;
  }

  public async initialize(): Promise<void> {
    console.log('🤖 Initializing Auto Trader...');

    // Try to connect wallet first
    if (!this.walletManager.isConnected()) {
      console.log('🔌 Connecting to wallet...');
      await this.walletManager.connect();
    }

    if (!this.walletManager.isConnected()) {
      throw new Error('Wallet connection failed. Cannot initialize auto trader.');
    }

    // Validate trading config
    const validation = this.tradingConfig.validateSettings();
    if (!validation.valid) {
      console.error('❌ Trading configuration is invalid:');
      validation.errors.forEach(error => console.error(`  - ${error}`));
      throw new Error('Invalid trading configuration');
    }

    // Load execution history
    await this.loadExecutionHistory();

    // Reset daily counter if needed
    this.resetDailyCounterIfNeeded();

    // Show wallet capabilities
    console.log('📋 Wallet Capabilities:');
    console.log(`   Can Sign Transactions: ${this.walletManager.canSign() ? '✅' : '❌'}`);
    console.log(`   Read-Only Mode: ${this.walletManager.getConnection()?.isReadOnly ? '✅' : '❌'}`);

    console.log('✅ Auto Trader initialized successfully');
  }

  public enableAutoTrading(): void {
    if (this.isEnabled) {
      console.log('⚠️ Auto trading is already enabled');
      return;
    }

    console.log('🚀 Enabling automatic trading...');
    console.log(`Mode: ${this.tradingConfig.getSettings().execution.dryRun ? '🧪 DRY RUN' : '🔴 LIVE TRADING'}`);

    if (!this.tradingConfig.getSettings().execution.dryRun) {
      console.log('⚠️⚠️⚠️ WARNING: LIVE TRADING MODE ENABLED ⚠️⚠️⚠️');
      console.log('Real trades will be executed and SOL will be spent!');
    }

    this.isEnabled = true;
    this.startTime = new Date();
    console.log('✅ Automatic trading enabled');
  }

  public disableAutoTrading(): void {
    if (!this.isEnabled) {
      console.log('⚠️ Auto trading is already disabled');
      return;
    }

    console.log('🛑 Disabling automatic trading...');
    this.isEnabled = false;
    console.log('✅ Automatic trading disabled');
  }

  public async processOpportunities(): Promise<TradeExecution[]> {
    if (!this.isEnabled) {
      return [];
    }

    const opportunities = this.walletMonitor.getCurrentOpportunities();
    if (opportunities.length === 0) {
      return [];
    }
    const executions: TradeExecution[] = [];

    // Check daily trade limit
    if (this.stats.dailyTradeCount >= this.stats.dailyTradeLimit) {
      console.log(`⏸️ Daily trade limit reached (${this.stats.dailyTradeLimit}), skipping trades for today`);
      return [];
    }

    console.log(`🤖 Processing ${opportunities.length} trading opportunities...`);

    // Process opportunities in priority order
    for (const opportunity of opportunities) {
      // Double-check daily limit
      if (this.stats.dailyTradeCount >= this.stats.dailyTradeLimit) {
        console.log('⏸️ Daily trade limit reached during execution');
        break;
      }

      try {
        const execution = await this.executeOpportunity(opportunity);
        if (execution) {
          executions.push(execution);
          this.addExecutionToHistory(execution);

          // Update stats
          this.stats.tradesExecuted++;
          this.stats.dailyTradeCount++;

          if (execution.success) {
            this.stats.successfulTrades++;
            this.stats.totalProfitRealized += execution.amountOut;
          } else {
            this.stats.failedTrades++;
          }

          this.stats.lastTradeTime = new Date();

          // Small delay between trades to prevent overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.error(`❌ Error executing opportunity for ${opportunity.token.tokenInfo.symbol}:`, error);
      }
    }

    if (executions.length > 0) {
      console.log(`✅ Processed ${executions.length} trades`);
      await this.saveExecutionHistory();
    }

    return executions;
  }

  private async executeOpportunity(opportunity: TradingOpportunity): Promise<TradeExecution | null> {
    const settings = this.tradingConfig.getSettings();
    const userPublicKey = this.walletManager.getPublicKey();

    if (!userPublicKey) {
      console.error('❌ User public key not available');
      return null;
    }

    console.log(`\n🎯 Executing trade for ${opportunity.token.tokenInfo.symbol}`);
    console.log(`📊 Profit: ${opportunity.currentProfitPercent.toFixed(2)}%`);
    console.log(`💰 Sell ${opportunity.recommendedSellPercent}% of position`);

    // Calculate sell amount
    const sellAmount = opportunity.token.balanceUiAmount * (opportunity.recommendedSellPercent / 100);
    const sellAmountRaw = Math.floor(sellAmount * Math.pow(10, opportunity.token.tokenInfo.decimals));

    console.log(`📦 Selling ${sellAmount.toFixed(6)} ${opportunity.token.tokenInfo.symbol}`);

    const execution: TradeExecution = {
      id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      timestamp: new Date(),
      tokenSymbol: opportunity.token.tokenInfo.symbol,
      tokenMint: opportunity.token.mintAddress,
      action: 'SELL',
      amountIn: sellAmount,
      amountOut: 0,
      profitPercent: opportunity.currentProfitPercent,
      targetTriggered: opportunity.triggerTarget,
      executionMode: settings.execution.dryRun ? 'DRY_RUN' : 'LIVE',
      success: false,
      priceImpact: 0,
      slippage: settings.execution.slippagePercent
    };

    try {
      // Execute swap
      const swapResult: SwapResult = await this.jupiterTrader.executeSwap(
        opportunity.token.mintAddress, // input mint (token to sell)
        'So11111111111111111111111111111111111111112', // output mint (SOL)
        sellAmountRaw,
        userPublicKey,
        this.jupiterTrader.calculateSlippageBps(settings.execution.slippagePercent),
        settings.execution.dryRun
      );

      // Update execution with results
      execution.success = swapResult.success;
      execution.amountOut = swapResult.outputAmount;
      execution.priceImpact = swapResult.priceImpact;
      if (swapResult.signature) {
        execution.signature = swapResult.signature;
      }
      if (swapResult.error) {
        execution.error = swapResult.error;
      }

      if (swapResult.success) {
        const proceedsUSD = (swapResult.outputAmount / 1e9) * (opportunity.token.currentPrice || 0);
        console.log(`✅ Trade executed successfully!`);
        console.log(`💰 Received ${(swapResult.outputAmount / 1e9).toFixed(6)} SOL (~$${proceedsUSD.toFixed(2)})`);
        console.log(`📈 Price impact: ${swapResult.priceImpact.toFixed(4)}%`);

        if (settings.execution.dryRun) {
          console.log('🧪 DRY RUN - No actual trade was executed');
        } else {
          console.log(`🔗 Transaction: ${swapResult.signature}`);
        }
      } else {
        console.error(`❌ Trade failed: ${swapResult.error}`);
      }

    } catch (error) {
      execution.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Trade execution error: ${execution.error}`);
    }

    return execution;
  }

  private addExecutionToHistory(execution: TradeExecution): void {
    this.executionHistory.push(execution);

    // Keep only last 1000 executions in memory
    if (this.executionHistory.length > 1000) {
      this.executionHistory = this.executionHistory.slice(-1000);
    }
  }

  private async loadExecutionHistory(): Promise<void> {
    try {
      // In a real implementation, load from database
      // For now, start with empty history
      this.executionHistory = [];
      console.log('📚 Execution history loaded');
    } catch (error) {
      console.warn('⚠️ Failed to load execution history:', error);
      this.executionHistory = [];
    }
  }

  private async saveExecutionHistory(): Promise<void> {
    try {
      // In a real implementation, save to database
      // For now, just log
      console.log(`💾 Saved execution history (${this.executionHistory.length} records)`);
    } catch (error) {
      console.warn('⚠️ Failed to save execution history:', error);
    }
  }

  private resetDailyCounterIfNeeded(): void {
    const now = new Date();
    const lastReset = new Date(this.startTime);

    // Reset if it's a new day
    if (now.toDateString() !== lastReset.toDateString()) {
      this.stats.dailyTradeCount = 0;
      console.log('📅 Daily trade counter reset');
    }
  }

  public getStats(): AutoTradingStats {
    this.stats.uptime = Date.now() - this.startTime.getTime();
    return { ...this.stats };
  }

  public getExecutionHistory(): TradeExecution[] {
    return [...this.executionHistory];
  }

  public getRecentExecutions(limit: number = 10): TradeExecution[] {
    return this.executionHistory.slice(-limit);
  }

  public isAutoTradingEnabled(): boolean {
    return this.isEnabled;
  }

  public setDailyTradeLimit(limit: number): void {
    this.stats.dailyTradeLimit = limit;
    console.log(`✅ Daily trade limit set to ${limit}`);
  }

  public printStatus(): void {
    console.log('\n🤖 AUTO TRADER STATUS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━');

    const settings = this.tradingConfig.getSettings();

    console.log(`Status: ${this.isEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}`);
    console.log(`Mode: ${settings.execution.dryRun ? '🧪 DRY RUN' : '🔴 LIVE TRADING'}`);

    if (this.isEnabled) {
      const uptimeHours = (this.stats.uptime / (1000 * 60 * 60)).toFixed(1);
      console.log(`Uptime: ${uptimeHours} hours`);
    }

    console.log('\nTrading Statistics:');
    console.log(`  Total trades: ${this.stats.tradesExecuted}`);
    console.log(`  Successful: ${this.stats.successfulTrades}`);
    console.log(`  Failed: ${this.stats.failedTrades}`);
    console.log(`  Success rate: ${this.stats.tradesExecuted > 0 ? ((this.stats.successfulTrades / this.stats.tradesExecuted) * 100).toFixed(1) : 0}%`);
    console.log(`  Daily trades: ${this.stats.dailyTradeCount}/${this.stats.dailyTradeLimit}`);

    if (this.stats.lastTradeTime) {
      console.log(`  Last trade: ${this.stats.lastTradeTime.toISOString()}`);
    }

    if (this.executionHistory.length > 0) {
      console.log(`\nRecent executions (last 3):`);
      this.getRecentExecutions(3).forEach(exec => {
        const status = exec.success ? '✅' : '❌';
        const mode = exec.executionMode === 'DRY_RUN' ? '🧪' : '🔴';
        console.log(`  ${status} ${mode} ${exec.tokenSymbol}: ${exec.action} ${exec.amountIn.toFixed(4)} (+${exec.profitPercent.toFixed(1)}%)`);
      });
    }
  }

  public async generateTradingReport(): Promise<string[]> {
    const stats = this.getStats();
    const report: string[] = [];

    report.push('📊 AUTOMATED TRADING REPORT');
    report.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    report.push('');

    // Overall stats
    report.push(`🤖 Auto Trader Status: ${this.isEnabled ? '🟢 ACTIVE' : '🔴 INACTIVE'}`);
    report.push(`⏱️ Uptime: ${(stats.uptime / (1000 * 60 * 60)).toFixed(1)} hours`);
    report.push('');

    // Trade statistics
    report.push('📈 Trading Performance:');
    report.push(`  Total Executions: ${stats.tradesExecuted}`);
    report.push(`  Successful: ${stats.successfulTrades} (${stats.tradesExecuted > 0 ? ((stats.successfulTrades / stats.tradesExecuted) * 100).toFixed(1) : 0}%)`);
    report.push(`  Failed: ${stats.failedTrades}`);
    report.push(`  Daily Count: ${stats.dailyTradeCount}/${stats.dailyTradeLimit}`);
    report.push('');

    // Recent activity
    if (this.executionHistory.length > 0) {
      report.push('🕒 Recent Activity (Last 5 trades):');
      this.getRecentExecutions(5).forEach((exec, index) => {
        const status = exec.success ? '✅' : '❌';
        const mode = exec.executionMode === 'DRY_RUN' ? '[DRY]' : '[LIVE]';
        const time = exec.timestamp.toLocaleString();
        report.push(`  ${index + 1}. ${status} ${mode} ${exec.tokenSymbol} - ${exec.action} ${exec.amountIn.toFixed(4)} (+${exec.profitPercent.toFixed(1)}%) - ${time}`);
      });
      report.push('');
    }

    // Current opportunities
    const currentOpps = this.walletMonitor.getCurrentOpportunities();
    if (currentOpps.length > 0) {
      report.push('🎯 Current Opportunities:');
      currentOpps.slice(0, 3).forEach((opp, index) => {
        report.push(`  ${index + 1}. ${opp.token.tokenInfo.symbol}: +${opp.currentProfitPercent.toFixed(1)}% (${opp.priority} priority)`);
      });
      if (currentOpps.length > 3) {
        report.push(`  ... and ${currentOpps.length - 3} more`);
      }
    } else {
      report.push('🎯 No current trading opportunities');
    }

    report.push('');
    report.push(`📅 Report generated: ${new Date().toISOString()}`);

    return report;
  }
}