import { PortfolioTracker } from '../portfolio-tracker';
import { TradingConfigManager } from './trading-config';
import { Position } from '../../types';
import { RateLimiter } from '../../utils/rate-limiter';
import { DustFilter } from '../../utils/dust-filter';

export interface MonitoringStats {
  lastCheck: Date;
  checksPerformed: number;
  tokensMonitored: number;
  profitOpportunities: number;
  uptime: number; // in milliseconds
}

export interface TradingOpportunity {
  token: Position;
  currentProfitPercent: number;
  triggerTarget: string;
  recommendedSellPercent: number;
  estimatedProceeds: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export class WalletMonitor {
  private static instance: WalletMonitor;
  private portfolioTracker: PortfolioTracker;
  private tradingConfig: TradingConfigManager;
  private rateLimiter: RateLimiter;

  private isRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private priceUpdateInterval: NodeJS.Timeout | null = null;

  private stats: MonitoringStats = {
    lastCheck: new Date(),
    checksPerformed: 0,
    tokensMonitored: 0,
    profitOpportunities: 0,
    uptime: 0
  };

  private startTime: Date = new Date();
  private currentOpportunities: TradingOpportunity[] = [];

  private constructor() {
    this.portfolioTracker = PortfolioTracker.getInstance();
    this.tradingConfig = TradingConfigManager.getInstance();
    // Ultra-conservative rate limiting for portfolio updates: 1 request per 2 minutes
    this.rateLimiter = new RateLimiter(1, 120000, 120000);
  }

  public static getInstance(): WalletMonitor {
    if (!WalletMonitor.instance) {
      WalletMonitor.instance = new WalletMonitor();
    }
    return WalletMonitor.instance;
  }

  public async startMonitoring(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Wallet monitor is already running');
      return;
    }

    const settings = this.tradingConfig.getSettings();

    if (!settings.profitTaking.enabled) {
      console.log('❌ Profit taking is disabled in settings. Enable it first.');
      return;
    }

    console.log('🚀 Starting wallet monitoring...');
    console.log(`📊 Mode: ${settings.execution.dryRun ? 'DRY RUN' : 'LIVE TRADING'}`);
    console.log(`⏰ Check interval: ${settings.monitoring.checkIntervalMs/1000}s`);
    console.log(`💰 Price updates: ${settings.monitoring.priceUpdateIntervalMs/1000}s`);

    this.isRunning = true;
    this.startTime = new Date();

    // Start monitoring loop
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performMonitoringCheck();
      } catch (error) {
        console.error('❌ Error in monitoring check:', error instanceof Error ? error.message : String(error));
      }
    }, settings.monitoring.checkIntervalMs);

    // Start price update loop (less frequent to avoid rate limits)
    this.priceUpdateInterval = setInterval(async () => {
      try {
        await this.updatePortfolioPrices();
      } catch (error) {
        console.error('❌ Error updating prices:', error instanceof Error ? error.message : String(error));
      }
    }, settings.monitoring.priceUpdateIntervalMs);

    // Perform initial check
    await this.performMonitoringCheck();

    console.log('✅ Wallet monitoring started successfully');
  }

  public stopMonitoring(): void {
    if (!this.isRunning) {
      console.log('⚠️ Wallet monitor is not running');
      return;
    }

    console.log('🛑 Stopping wallet monitoring...');

    this.isRunning = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      this.priceUpdateInterval = null;
    }

    console.log('✅ Wallet monitoring stopped');
  }

  private async performMonitoringCheck(): Promise<void> {
    if (!this.isRunning) return;

    try {
      console.log(`\n⏰ ${new Date().toISOString()} - Performing monitoring check...`);

      // Update portfolio (without prices to avoid rate limits)
      const portfolio = await this.portfolioTracker.updatePortfolioWithPrices();

      // Analyze positions for trading opportunities
      const opportunities = await this.analyzePositions(portfolio.positions);

      // Update stats
      this.stats.lastCheck = new Date();
      this.stats.checksPerformed++;
      this.stats.tokensMonitored = portfolio.positions.filter(p => p.balanceUiAmount > 0).length;
      this.stats.profitOpportunities = opportunities.length;
      this.stats.uptime = Date.now() - this.startTime.getTime();

      this.currentOpportunities = opportunities;

      // Log summary
      console.log(`📊 Check #${this.stats.checksPerformed} completed`);
      console.log(`💰 Monitoring ${this.stats.tokensMonitored} active positions`);
      console.log(`🎯 Found ${this.stats.profitOpportunities} profit opportunities`);

      // Report opportunities
      if (opportunities.length > 0) {
        this.reportOpportunities(opportunities);
      }

    } catch (error) {
      console.error('❌ Error in monitoring check:', error instanceof Error ? error.message : String(error));
    }
  }

  private async updatePortfolioPrices(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Rate limit price updates to prevent API limits
      await this.rateLimiter.waitIfNeeded();

      console.log(`💰 Updating portfolio prices...`);

      // Use smart pricing (conservative with rate limiting)
      await this.portfolioTracker.updatePortfolioWithPrices();

      console.log('✅ Portfolio prices updated');

    } catch (error) {
      console.warn('⚠️ Price update failed, continuing with cached prices:', error instanceof Error ? error.message : String(error));
    }
  }

  private async analyzePositions(positions: Position[]): Promise<TradingOpportunity[]> {
    const settings = this.tradingConfig.getSettings();
    const opportunities: TradingOpportunity[] = [];

    // Only analyze positions with balance > 0 and current price
    console.log(`🔍 Starting analysis with ${positions.length} total positions`);

    positions.forEach(p => {
      console.log(`📋 ${p.tokenInfo.symbol}: balance=${p.balanceUiAmount}, currentPrice=${p.currentPrice}, entryPrice=${p.entryPrice}`);
    });

    const activePositions = positions.filter(p =>
      p.balanceUiAmount > 0 &&
      p.currentPrice &&
      p.currentPrice > 0 &&
      p.entryPrice &&
      p.entryPrice > 0
    );

    // Filter out dust positions from trading analysis - nur echte Dust-Token unter $0.01 ausschließen
    const tradeablePositions = DustFilter.filterTradingOpportunities(activePositions, 0.01); // Minimum $0.01 for trading

    if (activePositions.length !== tradeablePositions.length) {
      console.log(`🗑️ Filtered out ${activePositions.length - tradeablePositions.length} dust positions from trading analysis`);
    }

    console.log(`🔍 WalletMonitor analyzing ${tradeablePositions.length} tradeable positions after dust filtering`);

    for (const position of tradeablePositions) {
      try {
        const profitPercent = ((position.currentPrice! - position.entryPrice!) / position.entryPrice!) * 100;

        console.log(`📊 ${position.tokenInfo.symbol}: ${profitPercent.toFixed(2)}% profit (${position.currentPrice} vs ${position.entryPrice})`);

        // Skip if profit is below minimum requirement
        if (profitPercent < settings.riskManagement.requireMinimumProfit) {
          console.log(`⏭️ ${position.tokenInfo.symbol}: Below minimum ${settings.riskManagement.requireMinimumProfit}%`);
          continue;
        }

        // Find matching profit targets
        const matchingTargets = settings.profitTaking.targets.filter(target =>
          target.enabled && profitPercent >= target.triggerPercent
        );

        if (matchingTargets.length > 0) {
          // Use the highest matching target
          const bestTarget = matchingTargets.sort((a, b) => b.triggerPercent - a.triggerPercent)[0];

          // Calculate estimated proceeds
          const sellAmount = (position.balanceUiAmount * bestTarget.sellPercent / 100);
          const estimatedProceeds = sellAmount * position.currentPrice!;

          // Determine priority based on profit level
          let priority: TradingOpportunity['priority'] = 'LOW';
          if (profitPercent >= 200) priority = 'URGENT';
          else if (profitPercent >= 100) priority = 'HIGH';
          else if (profitPercent >= 50) priority = 'MEDIUM';

          opportunities.push({
            token: position,
            currentProfitPercent: profitPercent,
            triggerTarget: bestTarget.name,
            recommendedSellPercent: bestTarget.sellPercent,
            estimatedProceeds,
            priority
          });
        }

      } catch (error) {
        console.warn(`⚠️ Error analyzing position ${position.tokenInfo.symbol}:`, error instanceof Error ? error.message : String(error));
      }
    }

    // Sort by priority and profit percentage
    return opportunities.sort((a, b) => {
      const priorityOrder = { 'URGENT': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      return b.currentProfitPercent - a.currentProfitPercent;
    });
  }

  private reportOpportunities(opportunities: TradingOpportunity[]): void {
    console.log('\n🎯 PROFIT TAKING OPPORTUNITIES DETECTED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    opportunities.forEach((opp, index) => {
      const priorityEmoji = {
        'URGENT': '🚨',
        'HIGH': '🔥',
        'MEDIUM': '📈',
        'LOW': '💡'
      }[opp.priority];

      console.log(`${index + 1}. ${priorityEmoji} ${opp.token.tokenInfo.symbol}`);
      console.log(`   Profit: +${opp.currentProfitPercent.toFixed(2)}% (${opp.triggerTarget})`);
      console.log(`   Price: $${opp.token.entryPrice!.toFixed(6)} → $${opp.token.currentPrice!.toFixed(6)}`);
      console.log(`   Recommendation: Sell ${opp.recommendedSellPercent}% (~$${opp.estimatedProceeds.toFixed(2)})`);
      console.log('');
    });

    const settings = this.tradingConfig.getSettings();
    if (settings.execution.dryRun) {
      console.log('🧪 DRY RUN MODE: No actual trades will be executed');
    } else {
      console.log('⚠️ LIVE MODE: Trades would be executed automatically!');
    }

    // Show next check time
    const nextCheckIn = settings.monitoring.checkIntervalMs / 1000;
    console.log(`⏰ Next check in ${nextCheckIn}s...`);
  }

  public getMonitoringStats(): MonitoringStats {
    return { ...this.stats };
  }

  public getCurrentOpportunities(): TradingOpportunity[] {
    return [...this.currentOpportunities];
  }

  public isMonitoringActive(): boolean {
    return this.isRunning;
  }

  public async getDetailedStatus(): Promise<{
    isRunning: boolean;
    stats: MonitoringStats;
    opportunities: TradingOpportunity[];
    settings: any;
    nextCheckIn?: number;
  }> {
    const settings = this.tradingConfig.getSettings();
    const status = {
      isRunning: this.isRunning,
      stats: this.getMonitoringStats(),
      opportunities: this.getCurrentOpportunities(),
      settings: {
        profitTakingEnabled: settings.profitTaking.enabled,
        activeTargets: settings.profitTaking.targets.filter(t => t.enabled).length,
        dryRunMode: settings.execution.dryRun,
        monitoringInterval: settings.monitoring.checkIntervalMs / 1000,
        priceUpdateInterval: settings.monitoring.priceUpdateIntervalMs / 1000
      }
    };

    // Calculate next check time if running
    if (this.isRunning && this.monitoringInterval) {
      const timeSinceLastCheck = Date.now() - this.stats.lastCheck.getTime();
      const nextCheckIn = Math.max(0, settings.monitoring.checkIntervalMs - timeSinceLastCheck);
      return { ...status, nextCheckIn: Math.floor(nextCheckIn / 1000) };
    }

    return status;
  }

  public printStatus(): void {
    console.log('\n🖥️ WALLET MONITOR STATUS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━');

    const settings = this.tradingConfig.getSettings();

    console.log(`Status: ${this.isRunning ? '🟢 RUNNING' : '🔴 STOPPED'}`);
    console.log(`Mode: ${settings.execution.dryRun ? '🧪 DRY RUN' : '🔴 LIVE TRADING'}`);

    if (this.isRunning) {
      const uptimeHours = (this.stats.uptime / (1000 * 60 * 60)).toFixed(1);
      console.log(`Uptime: ${uptimeHours} hours`);
      console.log(`Checks performed: ${this.stats.checksPerformed}`);
      console.log(`Last check: ${this.stats.lastCheck.toISOString()}`);
      console.log(`Tokens monitored: ${this.stats.tokensMonitored}`);
      console.log(`Current opportunities: ${this.stats.profitOpportunities}`);

      const nextCheckIn = settings.monitoring.checkIntervalMs / 1000;
      console.log(`Next check in: ~${nextCheckIn}s`);
    }

    console.log('\nSettings:');
    console.log(`  Monitoring interval: ${settings.monitoring.checkIntervalMs/1000}s`);
    console.log(`  Price updates: ${settings.monitoring.priceUpdateIntervalMs/1000}s`);
    console.log(`  Profit taking: ${settings.profitTaking.enabled ? '✅' : '❌'}`);
    console.log(`  Active targets: ${settings.profitTaking.targets.filter(t => t.enabled).length}`);
  }
}