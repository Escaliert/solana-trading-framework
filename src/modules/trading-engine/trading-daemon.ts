import { AutoTrader } from './auto-trader';
import { WalletMonitor } from './wallet-monitor';
import { TradingConfigManager } from './trading-config';
import { PortfolioTracker } from '../portfolio-tracker';

export interface DaemonStatus {
  isRunning: boolean;
  startTime: Date;
  uptime: number;
  autoTraderEnabled: boolean;
  walletMonitorEnabled: boolean;
  lastActivity: Date;
  cyclesCompleted: number;
  errorsEncountered: number;
  nextCycleIn: number;
}

export class TradingDaemon {
  private static instance: TradingDaemon;
  private autoTrader: AutoTrader;
  private walletMonitor: WalletMonitor;
  private tradingConfig: TradingConfigManager;
  private portfolioTracker: PortfolioTracker;

  private isRunning: boolean = false;
  private daemonInterval: NodeJS.Timeout | null = null;
  private startTime: Date = new Date();
  private lastActivity: Date = new Date();
  private cyclesCompleted: number = 0;
  private errorsEncountered: number = 0;

  private constructor() {
    this.autoTrader = AutoTrader.getInstance();
    this.walletMonitor = WalletMonitor.getInstance();
    this.tradingConfig = TradingConfigManager.getInstance();
    this.portfolioTracker = PortfolioTracker.getInstance();

    // Handle graceful shutdown
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
    process.on('SIGQUIT', () => this.handleShutdown('SIGQUIT'));
  }

  public static getInstance(): TradingDaemon {
    if (!TradingDaemon.instance) {
      TradingDaemon.instance = new TradingDaemon();
    }
    return TradingDaemon.instance;
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Trading daemon is already running');
      return;
    }

    console.log('🚀 Starting Trading Daemon...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // Initialize all components
      await this.initialize();

      // Start the daemon
      this.isRunning = true;
      this.startTime = new Date();
      this.lastActivity = new Date();
      this.cyclesCompleted = 0;
      this.errorsEncountered = 0;

      // Start monitoring
      await this.walletMonitor.startMonitoring();

      // Enable auto trading if configured
      const settings = this.tradingConfig.getSettings();
      if (settings.profitTaking.enabled) {
        this.autoTrader.enableAutoTrading();
      }

      // Start main daemon loop
      const cycleInterval = Math.min(
        settings.monitoring.checkIntervalMs,
        30000 // Max 30 seconds between cycles
      );

      this.daemonInterval = setInterval(async () => {
        await this.runCycle();
      }, cycleInterval);

      console.log('✅ Trading Daemon started successfully');
      console.log(`🔄 Cycle interval: ${cycleInterval/1000}s`);
      console.log(`📊 Mode: ${settings.execution.dryRun ? '🧪 DRY RUN' : '🔴 LIVE TRADING'}`);

      // Print initial status
      this.printStatus();

      // Run first cycle immediately
      await this.runCycle();

    } catch (error) {
      console.error('❌ Failed to start trading daemon:', error);
      await this.stop();
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚠️ Trading daemon is not running');
      return;
    }

    console.log('🛑 Stopping Trading Daemon...');

    this.isRunning = false;

    // Stop daemon loop
    if (this.daemonInterval) {
      clearInterval(this.daemonInterval);
      this.daemonInterval = null;
    }

    // Stop components
    this.autoTrader.disableAutoTrading();
    this.walletMonitor.stopMonitoring();

    console.log('✅ Trading Daemon stopped successfully');

    // Print final stats
    this.printFinalStats();
  }

  private async initialize(): Promise<void> {
    console.log('🏗️ Initializing daemon components...');

    // Initialize portfolio tracker database
    await this.portfolioTracker.initializeDatabase();

    // Initialize auto trader
    await this.autoTrader.initialize();

    // Validate trading configuration
    const validation = this.tradingConfig.validateSettings();
    if (!validation.valid) {
      console.error('❌ Trading configuration validation failed:');
      validation.errors.forEach(error => console.error(`  - ${error}`));
      throw new Error('Invalid trading configuration');
    }

    console.log('✅ All components initialized');
  }

  private async runCycle(): Promise<void> {
    if (!this.isRunning) return;

    try {
      this.lastActivity = new Date();
      const cycleStart = Date.now();

      console.log(`\n⚡ Daemon Cycle #${this.cyclesCompleted + 1} - ${new Date().toISOString()}`);

      // Process any trading opportunities
      if (this.autoTrader.isAutoTradingEnabled()) {
        const executions = await this.autoTrader.processOpportunities();
        if (executions.length > 0) {
          console.log(`🎯 Executed ${executions.length} trades this cycle`);
        }
      }

      // Update cycle stats
      this.cyclesCompleted++;
      const cycleTime = Date.now() - cycleStart;

      console.log(`✅ Cycle completed in ${cycleTime}ms`);

      // Log periodic status (every 10 cycles)
      if (this.cyclesCompleted % 10 === 0) {
        this.printPeriodicStatus();
      }

    } catch (error) {
      this.errorsEncountered++;
      console.error(`❌ Error in daemon cycle #${this.cyclesCompleted + 1}:`, error);

      // If we have too many consecutive errors, consider stopping
      if (this.errorsEncountered > 10) {
        console.error('❌ Too many consecutive errors, stopping daemon');
        await this.stop();
      }
    }
  }

  private async handleShutdown(signal: string): Promise<void> {
    console.log(`\n⚠️ Received ${signal} signal, shutting down gracefully...`);

    try {
      await this.stop();
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }

  public getStatus(): DaemonStatus {
    const settings = this.tradingConfig.getSettings();
    const uptime = Date.now() - this.startTime.getTime();

    let nextCycleIn = 0;
    if (this.isRunning && this.daemonInterval) {
      const timeSinceLastActivity = Date.now() - this.lastActivity.getTime();
      const cycleInterval = Math.min(settings.monitoring.checkIntervalMs, 30000);
      nextCycleIn = Math.max(0, cycleInterval - timeSinceLastActivity);
    }

    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      uptime,
      autoTraderEnabled: this.autoTrader.isAutoTradingEnabled(),
      walletMonitorEnabled: this.walletMonitor.isMonitoringActive(),
      lastActivity: this.lastActivity,
      cyclesCompleted: this.cyclesCompleted,
      errorsEncountered: this.errorsEncountered,
      nextCycleIn: Math.floor(nextCycleIn / 1000)
    };
  }

  public printStatus(): void {
    const status = this.getStatus();
    const settings = this.tradingConfig.getSettings();

    console.log('\n🖥️ TRADING DAEMON STATUS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log(`Status: ${status.isRunning ? '🟢 RUNNING' : '🔴 STOPPED'}`);
    console.log(`Mode: ${settings.execution.dryRun ? '🧪 DRY RUN' : '🔴 LIVE TRADING'}`);

    if (status.isRunning) {
      const uptimeHours = (status.uptime / (1000 * 60 * 60)).toFixed(1);
      console.log(`Uptime: ${uptimeHours} hours`);
      console.log(`Cycles completed: ${status.cyclesCompleted}`);
      console.log(`Errors encountered: ${status.errorsEncountered}`);
      console.log(`Next cycle in: ${status.nextCycleIn}s`);
    }

    console.log('\nComponents:');
    console.log(`  Auto Trader: ${status.autoTraderEnabled ? '✅ ACTIVE' : '❌ INACTIVE'}`);
    console.log(`  Wallet Monitor: ${status.walletMonitorEnabled ? '✅ ACTIVE' : '❌ INACTIVE'}`);

    // Show current opportunities
    const opportunities = this.walletMonitor.getCurrentOpportunities();
    if (opportunities.length > 0) {
      console.log(`  Current opportunities: ${opportunities.length}`);
      const highPriorityCount = opportunities.filter(o => o.priority === 'HIGH' || o.priority === 'URGENT').length;
      if (highPriorityCount > 0) {
        console.log(`  High priority: ${highPriorityCount} 🔥`);
      }
    }

    console.log('\nSettings:');
    console.log(`  Profit taking: ${settings.profitTaking.enabled ? '✅' : '❌'}`);
    console.log(`  Active targets: ${settings.profitTaking.targets.filter(t => t.enabled).length}`);
    console.log(`  Monitoring interval: ${settings.monitoring.checkIntervalMs/1000}s`);
  }

  private printPeriodicStatus(): void {
    const status = this.getStatus();
    const autoTraderStats = this.autoTrader.getStats();
    const monitoringStats = this.walletMonitor.getMonitoringStats();

    console.log('\n📊 PERIODIC STATUS REPORT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log(`⏱️ Uptime: ${(status.uptime / (1000 * 60 * 60)).toFixed(1)} hours`);
    console.log(`🔄 Cycles: ${status.cyclesCompleted} (${status.errorsEncountered} errors)`);
    console.log(`📊 Monitoring: ${monitoringStats.tokensMonitored} tokens, ${monitoringStats.profitOpportunities} opportunities`);
    console.log(`🤖 Trading: ${autoTraderStats.tradesExecuted} total trades (${autoTraderStats.successfulTrades} successful)`);
    console.log(`📅 Daily limit: ${autoTraderStats.dailyTradeCount}/${autoTraderStats.dailyTradeLimit}`);
  }

  private printFinalStats(): void {
    const status = this.getStatus();
    const autoTraderStats = this.autoTrader.getStats();

    console.log('\n📈 FINAL SESSION STATISTICS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log(`⏱️ Session duration: ${(status.uptime / (1000 * 60 * 60)).toFixed(1)} hours`);
    console.log(`🔄 Total cycles: ${status.cyclesCompleted}`);
    console.log(`❌ Errors: ${status.errorsEncountered}`);
    console.log(`🤖 Trades executed: ${autoTraderStats.tradesExecuted}`);
    console.log(`✅ Success rate: ${autoTraderStats.tradesExecuted > 0 ? ((autoTraderStats.successfulTrades / autoTraderStats.tradesExecuted) * 100).toFixed(1) : 0}%`);

    if (autoTraderStats.totalProfitRealized > 0) {
      console.log(`💰 Profit realized: $${autoTraderStats.totalProfitRealized.toFixed(2)}`);
    }

    console.log(`📅 Session ended: ${new Date().toISOString()}`);
  }

  public async runInteractive(): Promise<void> {
    console.log('🎮 Starting Interactive Trading Daemon Mode');
    console.log('Commands: start, stop, status, config, opportunities, trades, quit');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Simple command interface (in a real implementation, you'd use a proper CLI library)
    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      const chunk = process.stdin.read();
      if (chunk !== null) {
        this.handleCommand(chunk.trim());
      }
    });

    process.stdin.on('end', () => {
      console.log('Goodbye!');
    });

    // Show initial status
    this.printStatus();
    console.log('\n> ');
  }

  private async handleCommand(command: string): Promise<void> {
    const [cmd] = command.toLowerCase().split(' ');

    try {
      switch (cmd) {
        case 'start':
          await this.start();
          break;

        case 'stop':
          await this.stop();
          break;

        case 'status':
          this.printStatus();
          break;

        case 'config':
          this.tradingConfig.printCurrentSettings();
          break;

        case 'opportunities':
          const opportunities = this.walletMonitor.getCurrentOpportunities();
          if (opportunities.length === 0) {
            console.log('No current opportunities');
          } else {
            console.log(`Found ${opportunities.length} opportunities:`);
            opportunities.forEach((opp, i) => {
              console.log(`${i + 1}. ${opp.token.tokenInfo.symbol}: +${opp.currentProfitPercent.toFixed(1)}% (${opp.priority})`);
            });
          }
          break;

        case 'trades':
          const recentTrades = this.autoTrader.getRecentExecutions(5);
          if (recentTrades.length === 0) {
            console.log('No recent trades');
          } else {
            console.log('Recent trades:');
            recentTrades.forEach((trade, i) => {
              const status = trade.success ? '✅' : '❌';
              console.log(`${i + 1}. ${status} ${trade.tokenSymbol} ${trade.action} (+${trade.profitPercent.toFixed(1)}%)`);
            });
          }
          break;

        case 'quit':
        case 'exit':
          await this.stop();
          process.exit(0);
          break;

        case 'help':
          console.log('Available commands:');
          console.log('  start - Start the daemon');
          console.log('  stop - Stop the daemon');
          console.log('  status - Show current status');
          console.log('  config - Show trading configuration');
          console.log('  opportunities - Show current trading opportunities');
          console.log('  trades - Show recent trades');
          console.log('  quit/exit - Exit the program');
          break;

        default:
          console.log(`Unknown command: ${cmd}. Type 'help' for available commands.`);
      }
    } catch (error) {
      console.error(`Error executing command '${cmd}':`, error);
    }

    console.log('\n> ');
  }
}