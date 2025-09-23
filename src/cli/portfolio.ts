#!/usr/bin/env node

import { WalletManager } from '../core/wallet-manager';
import { PortfolioTracker } from '../modules/portfolio-tracker';
import { ConfigManager } from '../core/config';
import { TradingEngine } from '../modules/trading-engine';
import { DCAConfig } from '../modules/automated-strategies';
import { Formatter } from '../utils/formatter';

class PortfolioCLI {
  private walletManager: WalletManager;
  private portfolioTracker: PortfolioTracker;
  private config: ConfigManager;
  private tradingEngine: TradingEngine;

  constructor() {
    this.walletManager = WalletManager.getInstance();
    this.portfolioTracker = PortfolioTracker.getInstance();
    this.config = ConfigManager.getInstance();
    this.tradingEngine = TradingEngine.getInstance();
  }

  public async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing Solana Trading Framework...\n');

      // Initialize database
      console.log('🗄️ Initializing database...');
      await this.portfolioTracker.initializeDatabase();

      // Initialize trading engine
      console.log('🏗️ Initializing trading engine...');
      await this.tradingEngine.initialize();

      // Validate configuration
      if (!this.config.validateConfig()) {
        throw new Error('Invalid configuration. Please check your .env file.');
      }

      // Connect wallet
      console.log('🔗 Connecting to wallet...');
      await this.walletManager.connect();
      console.log(`✅ Connected to wallet: ${Formatter.formatWalletAddress(this.walletManager.getPublicKey()!.toBase58())}\n`);

    } catch (error) {
      console.error('❌ Initialization failed:', error);
      process.exit(1);
    }
  }

  public async showPortfolio(): Promise<void> {
    try {
      console.log('📊 Fetching portfolio data with prices...\n');
      const portfolio = await this.portfolioTracker.updatePortfolioWithSmartPricing();

      // Display portfolio summary
      console.log(Formatter.createPortfolioSummary(portfolio));
      console.log('\n');

      // Display positions table
      if (portfolio.positions.length > 0) {
        console.log('💰 Token Positions:');
        console.log(Formatter.createPositionsTable(portfolio.positions));
      } else {
        console.log('💰 No token positions found.');
      }

      console.log('\n');

      // Show profit taking opportunities
      console.log('💎 Profit Taking Analysis:');
      console.log('━'.repeat(80));
      const alerts = await this.portfolioTracker.generateTradingAlert();
      alerts.forEach(alert => console.log(alert));

      console.log('\n');

      // Display performance metrics
      const metrics = await this.portfolioTracker.getPerformanceMetrics();
      if (metrics) {
        console.log('📈 Performance Metrics:');
        console.log(`Best Performer: ${metrics.bestPerformer?.tokenInfo.symbol} - ${Formatter.formatCurrency((metrics.bestPerformer?.currentPrice || 0) * (metrics.bestPerformer?.balanceUiAmount || 0))}`);
        console.log(`Worst Performer: ${metrics.worstPerformer?.tokenInfo.symbol} - ${Formatter.formatCurrency((metrics.worstPerformer?.currentPrice || 0) * (metrics.worstPerformer?.balanceUiAmount || 0))}`);
        console.log(`Portfolio Diversification: ${Formatter.formatPercent(metrics.portfolioDiversification * 100)}`);
      }

    } catch (error) {
      console.error('❌ Error fetching portfolio:', error);
    }
  }

  public async showPortfolioWithPrices(): Promise<void> {
    try {
      console.log('📊 Fetching portfolio data with current prices...\n');

      const portfolio = await this.portfolioTracker.updatePortfolioWithPrices();

      // Display portfolio summary
      console.log(Formatter.createPortfolioSummary(portfolio));
      console.log('\n');

      // Display positions table
      if (portfolio.positions.length > 0) {
        console.log('💰 Token Positions:');
        console.log(Formatter.createPositionsTable(portfolio.positions));
      } else {
        console.log('💰 No token positions found.');
      }

      console.log('\n');

      // Show profit taking opportunities
      console.log('💎 Profit Taking Analysis:');
      console.log('━'.repeat(80));
      const alerts = await this.portfolioTracker.generateTradingAlert();
      alerts.forEach(alert => console.log(alert));

      console.log('\n');

      // Display performance metrics
      const metrics = await this.portfolioTracker.getPerformanceMetrics();
      if (metrics) {
        console.log('📈 Performance Metrics:');
        console.log(`Best Performer: ${metrics.bestPerformer?.tokenInfo.symbol} - ${Formatter.formatCurrency((metrics.bestPerformer?.currentPrice || 0) * (metrics.bestPerformer?.balanceUiAmount || 0))}`);
        console.log(`Worst Performer: ${metrics.worstPerformer?.tokenInfo.symbol} - ${Formatter.formatCurrency((metrics.worstPerformer?.currentPrice || 0) * (metrics.worstPerformer?.balanceUiAmount || 0))}`);
        console.log(`Portfolio Diversification: ${Formatter.formatPercent(metrics.portfolioDiversification * 100)}`);
      }

    } catch (error) {
      console.error('❌ Error fetching portfolio with prices:', error);
    }
  }

  public async showPortfolioWithLivePrices(): Promise<void> {
    try {
      console.log('📊 Fetching portfolio with live prices...\n');

      const portfolio = await this.portfolioTracker.updatePortfolioWithRealPrices();

      // Filter out tokens under $0.01 value
      const filteredPositions = portfolio.positions.filter(position => {
        const value = (position.currentPrice || 0) * position.balanceUiAmount;
        const isActive = position.balanceUiAmount > 0;
        const isSignificant = value >= 0.01; // $0.01 threshold

        return isActive && isSignificant;
      });

      const filteredPortfolio = {
        ...portfolio,
        positions: filteredPositions
      };

      // Display portfolio summary
      console.log(Formatter.createPortfolioSummary(filteredPortfolio));
      console.log('\n');

      // Display positions table
      if (filteredPortfolio.positions.length > 0) {
        console.log('💰 Token Positions (≥ $0.01):');
        console.log(Formatter.createPositionsTable(filteredPortfolio.positions));

        const hiddenCount = portfolio.positions.length - filteredPositions.length;
        if (hiddenCount > 0) {
          console.log(`\n🔍 ${hiddenCount} token(s) hidden (< $0.01 value)`);
        }
      } else {
        console.log('💰 No significant token positions found (all < $0.01).');
      }

      console.log('\n');

      // Show profit taking opportunities
      console.log('💎 Profit Taking Analysis:');
      console.log('━'.repeat(80));
      const alerts = await this.portfolioTracker.generateTradingAlert();
      alerts.forEach(alert => console.log(alert));

    } catch (error) {
      console.error('❌ Error fetching portfolio with live prices:', error);
    }
  }

  public async syncTransactions(): Promise<void> {
    try {
      console.log('🔄 Syncing transaction history and updating cost basis...\n');

      // Sync real transaction history from blockchain
      const syncedCount = await this.portfolioTracker.syncTransactionHistory();
      console.log(`📈 Synced ${syncedCount} transactions from blockchain`);

      // Update cost basis from real transactions
      await this.portfolioTracker.updateCostBasisFromTransactions();

      // Update portfolio to reflect any changes
      const portfolio = await this.portfolioTracker.updatePortfolio();

      console.log('✅ Transaction sync completed');
      console.log(`📊 Portfolio updated: ${portfolio.positions.length} positions tracked`);
      console.log(`💰 Total value: ${Formatter.formatCurrency(portfolio.totalValue)}`);

      // Show profit opportunities after sync
      const alerts = await this.portfolioTracker.generateTradingAlert();
      if (alerts.length > 1) { // More than just the header
        console.log('\n💎 Updated Profit Opportunities:');
        alerts.forEach(alert => console.log(alert));
      }

    } catch (error) {
      console.error('❌ Error syncing transactions:', error);
    }
  }

  public async watchPortfolio(): Promise<void> {
    console.log('👀 Starting real-time portfolio monitoring...');
    console.log('⚠️  Using conservative intervals to prevent rate limiting');
    console.log('💰 Fetching live prices and P&L data');
    console.log('Press Ctrl+C to stop\n');

    // Initial display with prices
    await this.showPortfolioWithLivePrices();

    // Start watching with longer interval to prevent rate limiting
    const baseInterval = this.config.getSettings().portfolioRefreshInterval;
    const safeInterval = Math.max(baseInterval, 45000); // Minimum 45 seconds for price fetching

    console.log(`🔄 Update interval: ${safeInterval / 1000}s (includes live prices)\n`);

    setInterval(async () => {
      try {
        console.clear();
        console.log('🔄 Portfolio Update - ' + new Date().toLocaleTimeString());
        console.log(''.padEnd(50, '='));
        await this.showPortfolioWithLivePrices();
      } catch (error) {
        console.error('❌ Error updating portfolio in real-time:', error);
        console.log('⏳ Continuing with next update cycle...\n');
      }
    }, safeInterval);
  }


  public async showHistory(): Promise<void> {
    try {
      console.log('📈 Fetching portfolio history...\n');

      const history = await this.portfolioTracker.getPortfolioHistory(10);

      if (history.length === 0) {
        console.log('No portfolio history found. Run some portfolio updates first.');
        return;
      }

      console.log('Portfolio History (Last 10 snapshots):');
      console.log('==================================================');

      for (const snapshot of history) {
        const date = Formatter.formatTimestamp(snapshot.timestamp);
        const value = Formatter.formatCurrency(snapshot.totalValue);
        const pnl = snapshot.totalPnL !== 0
          ? Formatter.colorizeValue(snapshot.totalPnL, Formatter.formatCurrency(Math.abs(snapshot.totalPnL)))
          : '$0.00';

        console.log(`${date} | Value: ${value} | P&L: ${pnl} | Positions: ${snapshot.positionCount}`);
      }

    } catch (error) {
      console.error('❌ Error fetching history:', error);
    }
  }

  public async showTradingRules(): Promise<void> {
    try {
      console.log('📋 Trading Rules Configuration:\n');

      const ruleEngine = this.tradingEngine.getRuleEngine();
      const rules = ruleEngine.getAllRules();

      if (rules.length === 0) {
        console.log('No trading rules configured.');
        return;
      }

      for (const rule of rules) {
        const status = rule.enabled ? '🟢 ENABLED' : '🔴 DISABLED';
        const executed = rule.executionCount > 0 ? `(${rule.executionCount} executions)` : '';

        console.log(`${status} ${rule.name} ${executed}`);
        console.log(`  ID: ${rule.id}`);
        console.log(`  Type: ${rule.ruleType.toUpperCase()}`);
        console.log(`  Token: ${rule.tokenMint}`);

        if (rule.conditions.percentageThreshold) {
          console.log(`  Threshold: ${rule.conditions.percentageThreshold}%`);
        }

        if (rule.actions.action === 'sell_percentage') {
          console.log(`  Action: Sell ${rule.actions.percentage}% of position`);
        }

        console.log(`  Dry Run: ${rule.actions.dryRun !== false ? 'YES' : 'NO'}`);
        console.log('');
      }

    } catch (error) {
      console.error('❌ Error showing trading rules:', error);
    }
  }

  public async simulateSwap(fromSymbol: string, toSymbol: string, amount: number): Promise<void> {
    try {
      console.log(`🧪 Simulating swap: ${amount} ${fromSymbol} → ${toSymbol}\n`);

      const jupiterTrader = this.tradingEngine.getJupiterTrader();
      const userPublicKey = this.walletManager.getPublicKey();

      if (!userPublicKey) {
        console.error('❌ Wallet not connected');
        return;
      }

      // Find tokens
      const fromToken = await jupiterTrader.findTokenBySymbol(fromSymbol);
      const toToken = await jupiterTrader.findTokenBySymbol(toSymbol);

      if (!fromToken || !toToken) {
        console.error(`❌ Token not found: ${!fromToken ? fromSymbol : toSymbol}`);
        return;
      }

      // Convert amount to base units
      const amountBaseUnits = amount * Math.pow(10, fromToken.decimals);

      // Simulate swap
      const simulation = await jupiterTrader.simulateSwap(
        fromToken.address,
        toToken.address,
        amountBaseUnits,
        userPublicKey
      );

      if (!simulation) {
        console.error('❌ Simulation failed');
        return;
      }

      const quote = simulation.quote;
      const outputAmount = parseInt(quote.otherAmountThreshold) / Math.pow(10, toToken.decimals);

      console.log('✅ Simulation Results:');
      console.log(`Input: ${amount} ${fromSymbol}`);
      console.log(`Output: ${outputAmount.toFixed(6)} ${toSymbol}`);
      console.log(`Price Impact: ${quote.priceImpactPct}%`);
      console.log(`Rate: 1 ${fromSymbol} = ${(outputAmount / amount).toFixed(6)} ${toSymbol}`);

      if (simulation.simulation.err) {
        console.log(`⚠️ Simulation Error: ${JSON.stringify(simulation.simulation.err)}`);
      } else {
        console.log('✅ Transaction would succeed');
      }

    } catch (error) {
      console.error('❌ Error simulating swap:', error);
    }
  }

  public async showStrategies(): Promise<void> {
    try {
      console.log('🤖 Automated Trading Strategies:\n');

      const strategyManager = this.tradingEngine.getStrategyManager();
      const strategies = strategyManager.getAllStrategyInfo();
      const summary = strategyManager.getExecutionSummary();

      if (strategies.length === 0) {
        console.log('No strategies configured. Use strategy commands to create them.');
        return;
      }

      console.log(`📊 Summary: ${summary.totalStrategies} total, ${summary.enabledStrategies} enabled, ${summary.totalExecutions} executions`);
      console.log(`🔄 Automation: ${summary.automationRunning ? '🟢 Running' : '🔴 Stopped'} (${summary.executionInterval / 1000}s intervals)\n`);

      for (const strategy of strategies) {
        const status = strategy.enabled ? '🟢 ENABLED' : '🔴 DISABLED';
        const dryRun = strategy.dryRun ? '🧪 DRY RUN' : '🔴 LIVE';
        const lastExec = strategy.lastExecution ? strategy.lastExecution.toLocaleString() : 'Never';

        console.log(`${status} ${strategy.type} - ${strategy.name}`);
        console.log(`  ID: ${strategy.id}`);
        console.log(`  Mode: ${dryRun}`);
        console.log(`  Executions: ${strategy.executionCount}`);
        console.log(`  Last Run: ${lastExec}`);
        console.log('');
      }

    } catch (error) {
      console.error('❌ Error showing strategies:', error);
    }
  }

  public async createDCAStrategy(tokenSymbol: string, amountUsd: number, intervalHours: number): Promise<void> {
    try {
      const jupiterTrader = this.tradingEngine.getJupiterTrader();
      const userPublicKey = this.walletManager.getPublicKey();

      if (!userPublicKey) {
        console.error('❌ Wallet not connected');
        return;
      }

      // Find target token
      const targetToken = await jupiterTrader.findTokenBySymbol(tokenSymbol);
      if (!targetToken) {
        console.error(`❌ Token not found: ${tokenSymbol}`);
        return;
      }

      const dcaConfig: DCAConfig = {
        id: `dca-${tokenSymbol.toLowerCase()}-${Date.now()}`,
        name: `DCA ${tokenSymbol} $${amountUsd} every ${intervalHours}h`,
        enabled: true,
        dryRun: true, // Default to dry run for safety
        created: new Date(),
        executionCount: 0,
        totalProfit: 0,
        maxDrawdown: 0,
        targetTokenMint: targetToken.address,
        targetTokenSymbol: tokenSymbol,
        baseTokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        baseTokenSymbol: 'USDC',
        buyAmountUsd: amountUsd,
        intervalHours: intervalHours,
      };

      const strategyManager = this.tradingEngine.getStrategyManager();
      const strategyId = strategyManager.createDCAStrategy(dcaConfig, userPublicKey);
      console.log(`✅ DCA Strategy created: ${strategyId}`);
      console.log(`⚠️  Strategy is in DRY RUN mode by default. Use 'strategy live <id>' to enable live trading.`);

    } catch (error) {
      console.error('❌ Error creating DCA strategy:', error);
    }
  }

  public async enableStrategy(id: string): Promise<void> {
    const strategyManager = this.tradingEngine.getStrategyManager();
    if (strategyManager.enableStrategy(id)) {
      console.log(`✅ Strategy enabled: ${id}`);
    } else {
      console.error(`❌ Strategy not found: ${id}`);
    }
  }

  public async disableStrategy(id: string): Promise<void> {
    const strategyManager = this.tradingEngine.getStrategyManager();
    if (strategyManager.disableStrategy(id)) {
      console.log(`⏸️ Strategy disabled: ${id}`);
    } else {
      console.error(`❌ Strategy not found: ${id}`);
    }
  }

  public async setStrategyLive(id: string): Promise<void> {
    const strategyManager = this.tradingEngine.getStrategyManager();
    if (strategyManager.setStrategyDryRun(id, false)) {
      console.log(`🔴 Strategy set to LIVE mode: ${id}`);
      console.log(`⚠️  WARNING: This strategy will now execute real trades!`);
    } else {
      console.error(`❌ Strategy not found: ${id}`);
    }
  }

  public async setStrategyDryRun(id: string): Promise<void> {
    const strategyManager = this.tradingEngine.getStrategyManager();
    if (strategyManager.setStrategyDryRun(id, true)) {
      console.log(`🧪 Strategy set to DRY RUN mode: ${id}`);
    } else {
      console.error(`❌ Strategy not found: ${id}`);
    }
  }

  public async startAutomation(): Promise<void> {
    const strategyManager = this.tradingEngine.getStrategyManager();
    strategyManager.startAutomation(120000); // 2 minutes interval
    console.log('🚀 Strategy automation started');
  }

  public async stopAutomation(): Promise<void> {
    const strategyManager = this.tradingEngine.getStrategyManager();
    strategyManager.stopAutomation();
    console.log('⏹️ Strategy automation stopped');
  }

  public async executeStrategy(id: string): Promise<void> {
    console.log(`🔄 Executing strategy: ${id}`);
    const strategyManager = this.tradingEngine.getStrategyManager();
    const success = await strategyManager.executeStrategy(id);
    console.log(success ? '✅ Strategy executed successfully' : '❌ Strategy execution failed');
  }

  public displayHelp(): void {
    console.log(`
Solana Trading Framework - Portfolio CLI

Usage: npm run portfolio [command] [args]

Portfolio Commands:
  (default)           Quick portfolio status (rate-limit safe)
  status              Quick portfolio status (rate-limit safe)
  show                Display portfolio with current prices (rate-limit safe)
  watch               Monitor portfolio in real-time
  sync                Sync transaction history and update cost basis
  history             Show portfolio history

Trading Commands:
  rules               Show trading rules configuration
  simulate <from> <to> <amount>  Simulate a token swap

Strategy Commands:
  strategies          Show all automated strategies
  strategy create-dca <token> <amount> <hours>  Create DCA strategy
  strategy enable <id>     Enable strategy
  strategy disable <id>    Disable strategy
  strategy live <id>       Set strategy to live mode
  strategy dryrun <id>     Set strategy to dry run mode
  strategy run <id>        Execute strategy once
  strategy start           Start automation
  strategy stop            Stop automation

Examples:
  npm run portfolio                    # Quick status (rate-limit safe) ⚡
  npm run portfolio status             # Quick status (rate-limit safe) ⚡
  npm run portfolio show               # Portfolio with prices (rate-limit safe) ⚡
  npm run portfolio watch              # Start real-time monitoring
  npm run portfolio sync               # Sync transactions and update P&L 🐌
  npm run portfolio history            # Show portfolio history
  npm run portfolio rules              # Show trading rules
  npm run portfolio simulate SOL USDC 0.1  # Simulate SOL→USDC swap
  npm run portfolio strategies         # Show all strategies
  npm run portfolio strategy create-dca SOL 10 24  # DCA $10 SOL every 24h
  npm run portfolio strategy start     # Start strategy automation

Configuration:
  Make sure to set WALLET_PUBLIC_KEY in your .env file
  Copy .env.example to .env and configure your settings

Features:
  ✅ Real-time portfolio monitoring with auto-swap detection
  ✅ Advanced P&L calculation with automatic cost basis tracking
  ✅ Transaction history sync from blockchain
  ✅ Portfolio snapshots and history
  ✅ Jupiter trading integration (simulation)
  ✅ Trading rules engine (dry-run mode)
  ✅ Rate limiting and retry logic
  ✅ Offline mode with price fallbacks
  🆕 Automatic new token detection after swaps
  🆕 Profit-taking alerts and recommendations
  🆕 Real-time cost basis updates from swaps

Phase 3 - Trading Engine:
  🟢 Jupiter swap quotes and simulation
  🟢 Trading rules engine (take-profit, stop-loss)
  🟢 Rate limiting and error handling

Phase 4 - Automated Strategies:
  🟢 DCA (Dollar Cost Averaging) strategies
  🟢 Grid Trading with buy/sell ladders
  🟢 Portfolio Rebalancing automation
  🟢 Strategy management and automation
  ⚠️  All operations in DRY RUN mode by default for safety
    `);
  }
}

async function main() {
  const cli = new PortfolioCLI();
  const command = process.argv[2] || 'status';
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case 'help':
      case '--help':
      case '-h':
        cli.displayHelp();
        break;

      case 'status':
        await cli.initialize();
        await cli.showPortfolio(); // Basic portfolio
        break;

      case 'watch':
        await cli.initialize();
        await cli.watchPortfolio();
        break;

      case 'sync':
        await cli.initialize();
        await cli.syncTransactions();
        break;

      case 'history':
        await cli.initialize();
        await cli.showHistory();
        break;

      case 'rules':
        await cli.initialize();
        await cli.showTradingRules();
        break;

      case 'simulate':
        if (args.length < 3) {
          console.error('❌ Usage: npm run portfolio simulate <from> <to> <amount>');
          console.error('Example: npm run portfolio simulate SOL USDC 0.1');
          process.exit(1);
        }
        await cli.initialize();
        await cli.simulateSwap(args[0], args[1], parseFloat(args[2]));
        break;

      case 'strategies':
        await cli.initialize();
        await cli.showStrategies();
        break;

      case 'strategy':
        if (args.length === 0) {
          console.error('❌ Usage: npm run portfolio strategy <subcommand>');
          console.error('Available subcommands: create-dca, enable, disable, live, dryrun, run, start, stop');
          process.exit(1);
        }

        await cli.initialize();

        switch (args[0]) {
          case 'create-dca':
            if (args.length < 4) {
              console.error('❌ Usage: npm run portfolio strategy create-dca <token> <amount> <hours>');
              console.error('Example: npm run portfolio strategy create-dca SOL 10 24');
              process.exit(1);
            }
            await cli.createDCAStrategy(args[1], parseFloat(args[2]), parseFloat(args[3]));
            break;

          case 'enable':
            if (args.length < 2) {
              console.error('❌ Usage: npm run portfolio strategy enable <id>');
              process.exit(1);
            }
            await cli.enableStrategy(args[1]);
            break;

          case 'disable':
            if (args.length < 2) {
              console.error('❌ Usage: npm run portfolio strategy disable <id>');
              process.exit(1);
            }
            await cli.disableStrategy(args[1]);
            break;

          case 'live':
            if (args.length < 2) {
              console.error('❌ Usage: npm run portfolio strategy live <id>');
              process.exit(1);
            }
            await cli.setStrategyLive(args[1]);
            break;

          case 'dryrun':
            if (args.length < 2) {
              console.error('❌ Usage: npm run portfolio strategy dryrun <id>');
              process.exit(1);
            }
            await cli.setStrategyDryRun(args[1]);
            break;

          case 'run':
            if (args.length < 2) {
              console.error('❌ Usage: npm run portfolio strategy run <id>');
              process.exit(1);
            }
            await cli.executeStrategy(args[1]);
            break;

          case 'start':
            await cli.startAutomation();
            break;

          case 'stop':
            await cli.stopAutomation();
            break;

          default:
            console.error(`❌ Unknown strategy subcommand: ${args[0]}`);
            console.error('Available subcommands: create-dca, enable, disable, live, dryrun, run, start, stop');
            process.exit(1);
        }
        break;

      case 'show':
        await cli.initialize();
        await cli.showPortfolioWithPrices(); // Full portfolio with prices
        break;

      default:
        await cli.initialize();
        await cli.showPortfolio(); // Basic portfolio
        break;
    }
  } catch (error) {
    console.error('❌ CLI Error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

if (require.main === module) {
  main();
}