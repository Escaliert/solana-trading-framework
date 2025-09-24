#!/usr/bin/env ts-node

import { TradingDaemon } from '../modules/trading-engine/trading-daemon';
import { TradingConfigManager } from '../modules/trading-engine/trading-config';
import { AutoTrader } from '../modules/trading-engine/auto-trader';
import { WalletMonitor } from '../modules/trading-engine/wallet-monitor';
import { PortfolioTracker } from '../modules/portfolio-tracker';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  try {
    switch (command.toLowerCase()) {
      case 'daemon':
        await runDaemon();
        break;

      case 'start':
        await startTrading();
        break;

      case 'stop':
        await stopTrading();
        break;

      case 'status':
        await showStatus();
        break;

      case 'config':
        await handleConfig(args.slice(1));
        break;

      case 'opportunities':
        await showOpportunities();
        break;

      case 'monitor':
        await startMonitoring();
        break;

      case 'trades':
        await showTrades();
        break;

      case 'test':
        await runTest();
        break;

      case 'help':
      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error('❌ Command failed:', error);
    process.exit(1);
  }
}

async function runDaemon() {
  console.log('🤖 Starting Trading Daemon...');
  const daemon = TradingDaemon.getInstance();

  try {
    await daemon.start();

    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('\n⚠️ Received SIGINT, shutting down...');
      await daemon.stop();
      process.exit(0);
    });

    // Run indefinitely
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

  } catch (error) {
    console.error('❌ Daemon failed:', error);
    process.exit(1);
  }
}

async function startTrading() {
  console.log('🚀 Starting automated trading...');

  const autoTrader = AutoTrader.getInstance();
  const walletMonitor = WalletMonitor.getInstance();

  await autoTrader.initialize();
  await walletMonitor.startMonitoring();
  autoTrader.enableAutoTrading();

  console.log('✅ Automated trading started');
  console.log('Use "npm run trading stop" to stop');
}

async function stopTrading() {
  console.log('🛑 Stopping automated trading...');

  const autoTrader = AutoTrader.getInstance();
  const walletMonitor = WalletMonitor.getInstance();

  autoTrader.disableAutoTrading();
  walletMonitor.stopMonitoring();

  console.log('✅ Automated trading stopped');
}

async function showStatus() {
  console.log('📊 TRADING SYSTEM STATUS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━');

  const daemon = TradingDaemon.getInstance();
  const autoTrader = AutoTrader.getInstance();
  const walletMonitor = WalletMonitor.getInstance();
  const tradingConfig = TradingConfigManager.getInstance();

  // Show daemon status
  daemon.printStatus();

  // Show auto trader stats
  console.log('');
  autoTrader.printStatus();

  // Show wallet monitor status
  console.log('');
  walletMonitor.printStatus();

  // Show current config
  console.log('');
  tradingConfig.printCurrentSettings();
}

async function handleConfig(args: string[]) {
  const tradingConfig = TradingConfigManager.getInstance();
  const subcommand = args[0] || 'show';

  switch (subcommand.toLowerCase()) {
    case 'show':
      tradingConfig.printCurrentSettings();
      break;

    case 'reset':
      tradingConfig.resetToDefaults();
      console.log('✅ Configuration reset to defaults');
      break;

    case 'dry-run':
      const mode = args[1]?.toLowerCase();
      if (mode === 'on' || mode === 'true') {
        tradingConfig.enableDryRun();
      } else if (mode === 'off' || mode === 'false') {
        tradingConfig.disableDryRun();
      } else {
        console.log('Usage: npm run trading config dry-run <on|off>');
      }
      break;

    case 'slippage':
      const slippage = parseFloat(args[1]);
      if (isNaN(slippage) || slippage < 0) {
        console.log('Usage: npm run trading config slippage <percentage>');
        console.log('Example: npm run trading config slippage 1.5');
      } else {
        tradingConfig.setSlippage(slippage);
      }
      break;

    case 'max-position':
      const maxPos = parseFloat(args[1]);
      if (isNaN(maxPos) || maxPos <= 0 || maxPos > 100) {
        console.log('Usage: npm run trading config max-position <percentage>');
        console.log('Example: npm run trading config max-position 20');
      } else {
        tradingConfig.setMaxPositionSize(maxPos);
      }
      break;

    case 'add-target':
      if (args.length < 3) {
        console.log('Usage: npm run trading config add-target <trigger%> <sell%> [name]');
        console.log('Example: npm run trading config add-target 30 25 "30% Quick Profit"');
      } else {
        const triggerPercent = parseFloat(args[1]);
        const sellPercent = parseFloat(args[2]);
        const name = args[3] || `${triggerPercent}% Target`;

        if (isNaN(triggerPercent) || isNaN(sellPercent)) {
          console.log('❌ Invalid percentages');
        } else {
          tradingConfig.addProfitTarget({
            name,
            triggerPercent,
            sellPercent,
            enabled: true
          });
        }
      }
      break;

    case 'path':
      console.log(`📁 Config file location: ${tradingConfig.getConfigPath()}`);
      break;

    default:
      console.log('Available config commands:');
      console.log('  show - Show current configuration');
      console.log('  reset - Reset to defaults');
      console.log('  dry-run <on|off> - Toggle dry run mode');
      console.log('  slippage <percentage> - Set slippage tolerance');
      console.log('  max-position <percentage> - Set max position size');
      console.log('  add-target <trigger%> <sell%> [name] - Add profit target');
      console.log('  path - Show config file path');
      break;
  }
}

async function showOpportunities() {
  console.log('🎯 CURRENT TRADING OPPORTUNITIES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const walletMonitor = WalletMonitor.getInstance();
  const opportunities = walletMonitor.getCurrentOpportunities();

  if (opportunities.length === 0) {
    console.log('📊 No trading opportunities found');
    console.log('💡 Reasons:');
    console.log('  - No tokens with sufficient profit');
    console.log('  - Profit targets not met');
    console.log('  - Monitoring not started');
    return;
  }

  console.log(`Found ${opportunities.length} opportunities:\n`);

  opportunities.forEach((opp, index) => {
    const priorityEmoji = {
      'URGENT': '🚨',
      'HIGH': '🔥',
      'MEDIUM': '📈',
      'LOW': '💡'
    }[opp.priority];

    console.log(`${index + 1}. ${priorityEmoji} ${opp.token.tokenInfo.symbol} (${opp.priority})`);
    console.log(`   Current Profit: +${opp.currentProfitPercent.toFixed(2)}%`);
    console.log(`   Entry Price: $${opp.token.entryPrice?.toFixed(6) || 'Unknown'}`);
    console.log(`   Current Price: $${opp.token.currentPrice?.toFixed(6) || 'Unknown'}`);
    console.log(`   Trigger Target: ${opp.triggerTarget}`);
    console.log(`   Recommended: Sell ${opp.recommendedSellPercent}% of position`);
    console.log(`   Estimated Proceeds: $${opp.estimatedProceeds.toFixed(2)}`);
    console.log('');
  });

  console.log('💡 Use "npm run trading start" to enable automatic trading');
}

async function startMonitoring() {
  console.log('👀 Starting wallet monitoring...');

  const walletMonitor = WalletMonitor.getInstance();
  await walletMonitor.startMonitoring();

  console.log('✅ Monitoring started');
  console.log('💡 Use "npm run trading opportunities" to see current opportunities');
}

async function showTrades() {
  console.log('📊 RECENT TRADES');
  console.log('━━━━━━━━━━━━━━━━━');

  const autoTrader = AutoTrader.getInstance();
  const recentTrades = autoTrader.getRecentExecutions(10);

  if (recentTrades.length === 0) {
    console.log('📊 No trades executed yet');
    return;
  }

  console.log(`Showing last ${recentTrades.length} trades:\n`);

  recentTrades.forEach((trade, index) => {
    const status = trade.success ? '✅ SUCCESS' : '❌ FAILED';
    const mode = trade.executionMode === 'DRY_RUN' ? '🧪 DRY' : '🔴 LIVE';

    console.log(`${recentTrades.length - index}. ${status} ${mode}`);
    console.log(`   Token: ${trade.tokenSymbol}`);
    console.log(`   Action: ${trade.action} ${trade.amountIn.toFixed(6)}`);
    console.log(`   Profit: +${trade.profitPercent.toFixed(2)}%`);
    console.log(`   Target: ${trade.targetTriggered}`);
    console.log(`   Time: ${trade.timestamp.toISOString()}`);

    if (trade.success && trade.amountOut > 0) {
      console.log(`   Output: ${trade.amountOut.toFixed(6)} SOL`);
      console.log(`   Price Impact: ${trade.priceImpact.toFixed(4)}%`);
    }

    if (trade.error) {
      console.log(`   Error: ${trade.error}`);
    }

    if (trade.signature && trade.executionMode === 'LIVE') {
      console.log(`   Tx: ${trade.signature}`);
    }

    console.log('');
  });
}

async function runTest() {
  console.log('🧪 TESTING TRADING SYSTEM');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // Test portfolio tracker initialization
    console.log('1. Testing Portfolio Tracker...');
    const portfolioTracker = PortfolioTracker.getInstance();
    console.log('✅ Portfolio Tracker initialized');

    // Try to connect wallet
    const { WalletManager } = await import('../core/wallet-manager');
    const walletManager = WalletManager.getInstance();
    try {
      await walletManager.connect();
      const portfolio = await portfolioTracker.updatePortfolio();
      console.log(`✅ Portfolio loaded with ${portfolio.positions.length} positions`);
    } catch (error) {
      console.log('⚠️ Wallet connection failed - skipping portfolio update test');
    }

    // Test trading config
    console.log('2. Testing Trading Configuration...');
    const tradingConfig = TradingConfigManager.getInstance();
    const validation = tradingConfig.validateSettings();
    if (validation.valid) {
      console.log('✅ Trading configuration is valid');
    } else {
      console.log('❌ Trading configuration issues:');
      validation.errors.forEach(error => console.log(`   - ${error}`));
    }

    // Test wallet monitor initialization
    console.log('3. Testing Wallet Monitor...');
    const walletMonitor = WalletMonitor.getInstance();
    console.log('✅ Wallet Monitor initialized');
    console.log(`   Monitor active: ${walletMonitor.isMonitoringActive()}`);

    // Test auto trader initialization
    console.log('4. Testing Auto Trader...');
    const autoTrader = AutoTrader.getInstance();
    try {
      await autoTrader.initialize();
      console.log('✅ Auto Trader initialized');
    } catch (error) {
      console.log('⚠️ Auto Trader initialization failed:', error instanceof Error ? error.message : String(error));
    }

    console.log('\n🎉 All systems operational!');
    console.log('💡 You can now run "npm run trading daemon" to start automated trading');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

function showHelp() {
  console.log('📖 SOLANA TRADING FRAMEWORK - TRADING CLI');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Usage: npm run trading <command> [options]');
  console.log('');
  console.log('MAIN COMMANDS:');
  console.log('  daemon          Start the trading daemon (recommended)');
  console.log('  start           Start automated trading');
  console.log('  stop            Stop automated trading');
  console.log('  status          Show system status');
  console.log('');
  console.log('CONFIGURATION:');
  console.log('  config show              Show current configuration');
  console.log('  config dry-run <on|off>  Toggle dry run mode');
  console.log('  config slippage <pct>    Set slippage tolerance');
  console.log('  config max-position <pct> Set max position size');
  console.log('  config add-target <trigger> <sell> [name] Add profit target');
  console.log('  config reset             Reset to defaults');
  console.log('  config path              Show config file path');
  console.log('');
  console.log('MONITORING:');
  console.log('  opportunities   Show current trading opportunities');
  console.log('  monitor         Start wallet monitoring only');
  console.log('  trades          Show recent trade history');
  console.log('');
  console.log('TESTING:');
  console.log('  test            Test all system components');
  console.log('');
  console.log('EXAMPLES:');
  console.log('  npm run trading daemon                    # Start full trading system');
  console.log('  npm run trading config dry-run off       # Enable live trading');
  console.log('  npm run trading config add-target 50 30  # Sell 30% at 50% profit');
  console.log('  npm run trading opportunities             # Check current opportunities');
  console.log('');
  console.log('⚠️ SAFETY:');
  console.log('  - System starts in DRY RUN mode by default');
  console.log('  - Use "config dry-run off" to enable live trading');
  console.log('  - Always test with small amounts first');
  console.log('  - Monitor your trades and adjust settings as needed');
}

// Run the CLI
main().catch(console.error);