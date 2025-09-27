import express from 'express';
import cors from 'cors';
import path from 'path';
import { PortfolioTracker } from '../modules/portfolio-tracker';
import { AutoTrader } from '../modules/trading-engine/auto-trader';
import { TradingDaemon } from '../modules/trading-engine/trading-daemon';
import { TradingConfigManager } from '../modules/trading-engine/trading-config';
import { WalletManager } from '../core/wallet-manager';
import { WalletMonitor } from '../modules/trading-engine/wallet-monitor';
import { JupiterTrader } from '../modules/trading-engine/jupiter-trader';
import { BalanceMonitor } from '../modules/balance-monitor';

const app = express();
const PORT = process.env.WEB_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../web/public')));

// Initialize components
let portfolioTracker: PortfolioTracker;
let autoTrader: AutoTrader;
let tradingDaemon: TradingDaemon;
let tradingConfig: TradingConfigManager;
let walletManager: WalletManager;
let walletMonitor: WalletMonitor;
let jupiterTrader: JupiterTrader;
let balanceMonitor: BalanceMonitor;

// Cache for performance
let portfolioCache: any = null;
let portfolioCacheTime: number = 0;
let opportunitiesCache: any[] = [];
let opportunitiesCacheTime: number = 0;
const CACHE_DURATION = 120000; // 2 minutes

// API Routes

// Portfolio endpoints
app.get('/api/portfolio', async (_req, res) => {
  try {
    if (!portfolioTracker) {
      return res.status(500).json({ error: 'Portfolio tracker not initialized' });
    }

    const now = Date.now();
    if (portfolioCache && now - portfolioCacheTime < CACHE_DURATION) {
      return res.json(portfolioCache);
    }

    // First try to get existing portfolio
    let portfolio = portfolioTracker.getCurrentPortfolio();

    // If no portfolio exists, update with prices (slow but necessary)
    if (!portfolio || !portfolio.positions || portfolio.positions.length === 0) {
      console.log('📊 No cached portfolio found. Fetching fresh data with prices...');
      try {
        await portfolioTracker.updatePortfolioWithPrices();
        portfolio = portfolioTracker.getCurrentPortfolio();
      } catch (priceError) {
        console.warn('⚠️ Price update failed, trying without prices:', priceError);
        // Fallback: try to update without prices
        try {
          await portfolioTracker.updatePortfolio();
          portfolio = portfolioTracker.getCurrentPortfolio();
        } catch (fallbackError) {
          console.error('❌ Portfolio fallback failed:', fallbackError);
          return res.status(500).json({ error: 'Failed to load portfolio data' });
        }
      }
    }

    if (!portfolio) {
      return res.status(500).json({ error: 'No portfolio data available' });
    }

    portfolioCache = portfolio;
    portfolioCacheTime = now;

    return res.json(portfolio);
  } catch (error) {
    console.error('API Error getting portfolio:', error);
    return res.status(500).json({ error: 'Failed to get portfolio' });
  }
});

app.get('/api/portfolio/opportunities', async (_req, res) => {
  try {
    if (!walletMonitor) {
      return res.status(500).json({ error: 'Wallet monitor not initialized' });
    }

    const now = Date.now();
    if (opportunitiesCache.length > 0 && now - opportunitiesCacheTime < CACHE_DURATION) {
      return res.json(opportunitiesCache);
    }

    const opportunities = walletMonitor.getCurrentOpportunities();

    opportunitiesCache = opportunities;
    opportunitiesCacheTime = now;

    return res.json(opportunities);
  } catch (error) {
    console.error('API Error getting opportunities:', error);
    return res.status(500).json({ error: 'Failed to get opportunities' });
  }
});

// Trading control endpoints
app.post('/api/trading/start', async (_req, res) => {
  try {
    await tradingDaemon.start();
    return res.json({ success: true, message: 'Trading daemon started' });
  } catch (error) {
    console.error('API Error starting daemon:', error);
    return res.status(500).json({ error: 'Failed to start trading daemon' });
  }
});

app.post('/api/trading/stop', async (_req, res) => {
  try {
    await tradingDaemon.stop();
    return res.json({ success: true, message: 'Trading daemon stopped' });
  } catch (error) {
    console.error('API Error stopping daemon:', error);
    return res.status(500).json({ error: 'Failed to stop trading daemon' });
  }
});

app.get('/api/trading/status', async (_req, res) => {
  try {
    const status = tradingDaemon.getStatus();
    const autoTraderStatus = autoTrader.getStatus();
    return res.json({
      daemon: status,
      autoTrader: autoTraderStatus,
      wallet: {
        connected: walletManager.isConnected(),
        canSign: walletManager.canSign(),
        publicKey: walletManager.getPublicKey()?.toBase58()
      }
    });
  } catch (error) {
    console.error('API Error getting status:', error);
    return res.status(500).json({ error: 'Failed to get trading status' });
  }
});

// Configuration endpoints
app.get('/api/config', (_req, res) => {
  try {
    const settings = tradingConfig.getSettings();
    return res.json(settings);
  } catch (error) {
    console.error('API Error getting config:', error);
    return res.status(500).json({ error: 'Failed to get configuration' });
  }
});

app.post('/api/config', (req, res) => {
  try {
    const newSettings = req.body;
    tradingConfig.updateSettings(newSettings);
    return res.json({ success: true, message: 'Configuration updated' });
  } catch (error) {
    console.error('API Error updating config:', error);
    return res.status(500).json({ error: 'Failed to update configuration' });
  }
});

app.post('/api/config/dry-run', (req, res) => {
  try {
    const { enabled } = req.body;
    const settings = tradingConfig.getSettings();
    settings.execution.dryRun = enabled;
    tradingConfig.updateSettings(settings);
    return res.json({ success: true, message: `Dry run ${enabled ? 'enabled' : 'disabled'}` });
  } catch (error) {
    console.error('API Error toggling dry run:', error);
    return res.status(500).json({ error: 'Failed to toggle dry run mode' });
  }
});

// Toggle Auto Trading without affecting daemon
app.post('/api/config/auto-trading', (req, res) => {
  try {
    const { enabled } = req.body;

    if (!autoTrader) {
      return res.status(500).json({ error: 'Auto trader not initialized' });
    }

    // Enable or disable auto trading
    if (enabled) {
      autoTrader.enableAutoTrading();
    } else {
      autoTrader.disableAutoTrading();
    }

    return res.json({
      success: true,
      message: `Auto trading ${enabled ? 'enabled' : 'disabled'}`,
      autoTraderEnabled: enabled
    });
  } catch (error) {
    console.error('API Error toggling auto trading:', error);
    return res.status(500).json({ error: 'Failed to toggle auto trading mode' });
  }
});

// Trade execution endpoints
app.post('/api/trading/execute/:tokenMint', async (req, res) => {
  try {
    const { tokenMint } = req.params;
    const { sellPercent } = req.body;

    if (!autoTrader) {
      return res.status(500).json({ error: 'Auto trader not initialized' });
    }

    // Get current opportunities from wallet monitor
    const opportunities = walletMonitor ? walletMonitor.getCurrentOpportunities() : [];
    const opportunity = opportunities.find(op => op.token.mintAddress === tokenMint);

    if (!opportunity) {
      return res.status(404).json({ error: 'Trading opportunity not found' });
    }

    // Override sell percent if provided
    if (sellPercent) {
      opportunity.recommendedSellPercent = sellPercent;
    }

    const executions = await autoTrader.processOpportunities();
    return res.json({ success: true, executions });
  } catch (error) {
    console.error('API Error executing trade:', error);
    return res.status(500).json({ error: 'Failed to execute trade' });
  }
});

// Manual swap endpoint
app.post('/api/manual-swap', async (req, res) => {
  try {
    if (!walletManager || !jupiterTrader) {
      return res.status(500).json({ success: false, error: 'Trading components not initialized' });
    }

    const { fromToken, toToken, amount } = req.body;

    if (!fromToken || !toToken || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required parameters' });
    }

    const publicKey = walletManager.getPublicKey();
    if (!publicKey) {
      return res.status(400).json({ success: false, error: 'Wallet not connected' });
    }

    // Convert amount to proper units
    let amountInSmallestUnit;
    if (fromToken === 'So11111111111111111111111111111111111111112') {
      amountInSmallestUnit = Math.floor(amount * 1e9);
    } else {
      amountInSmallestUnit = Math.floor(amount * 1e6);
    }

    const result = await jupiterTrader.executeSwap(
      fromToken,
      toToken,
      amountInSmallestUnit,
      publicKey,
      100,
      false
    );

    if (result.success) {
      return res.json({
        success: true,
        signature: result.signature,
        inputAmount: (result.inputAmount / (fromToken.includes('Sol') ? 1e9 : 1e6)).toFixed(6),
        outputAmount: (result.outputAmount / (toToken.includes('Sol') ? 1e9 : 1e6)).toFixed(6)
      });
    } else {
      return res.status(400).json({ success: false, error: result.error });
    }

  } catch (error) {
    console.error('Manual swap API error:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Settings endpoints
app.get('/api/settings', async (_req, res) => {
  try {
    if (!tradingConfig) {
      return res.status(500).json({ success: false, error: 'Trading config not initialized' });
    }

    const settings = tradingConfig.getSettings();
    return res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Settings API error:', error);
    return res.status(500).json({ success: false, error: 'Failed to get settings' });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    if (!tradingConfig) {
      return res.status(500).json({ success: false, error: 'Trading config not initialized' });
    }

    const newSettings = req.body;
    tradingConfig.updateSettings(newSettings);

    return res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Settings update API error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// Recent Activity endpoint
app.get('/api/recent-activity', async (_req, res) => {
  try {
    if (!autoTrader) {
      return res.status(500).json({ success: false, error: 'Auto trader not initialized' });
    }

    const activity = autoTrader.getRecentExecutions(20);
    return res.json({ success: true, data: activity });
  } catch (error) {
    console.error('Recent activity API error:', error);
    return res.status(500).json({ success: false, error: 'Failed to get recent activity' });
  }
});

// Trade history
app.get('/api/trading/history', (_req, res) => {
  try {
    const history = autoTrader.getExecutionHistory();
    return res.json(history);
  } catch (error) {
    console.error('API Error getting history:', error);
    return res.status(500).json({ error: 'Failed to get trade history' });
  }
});

// Balance monitor endpoints
app.get('/api/balance-monitor/status', (_req, res) => {
  try {
    const status = balanceMonitor.getStatus();
    return res.json(status);
  } catch (error) {
    console.error('API Error getting balance monitor status:', error);
    return res.status(500).json({ error: 'Failed to get balance monitor status' });
  }
});

app.post('/api/balance-monitor/force-check', async (_req, res) => {
  try {
    const changes = await balanceMonitor.forceBalanceCheck();
    return res.json({
      success: true,
      message: `Force check completed. Found ${changes.length} balance changes.`,
      changes
    });
  } catch (error) {
    console.error('API Error forcing balance check:', error);
    return res.status(500).json({ error: 'Failed to perform force balance check' });
  }
});

// Serve the professional dashboard (now the only dashboard)
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../web/public/index-pro.html'));
});

// Legacy routes redirect to main dashboard
app.get('/pro', (_req, res) => {
  res.redirect('/');
});

app.get('/dashboard', (_req, res) => {
  res.redirect('/');
});

// Initialize and start server
async function startServer() {
  try {
    console.log('🌐 Initializing Web Dashboard...');

    // Initialize components
    portfolioTracker = PortfolioTracker.getInstance();
    autoTrader = AutoTrader.getInstance();
    tradingDaemon = TradingDaemon.getInstance();
    tradingConfig = TradingConfigManager.getInstance();
    walletManager = WalletManager.getInstance();
    walletMonitor = WalletMonitor.getInstance();
    jupiterTrader = JupiterTrader.getInstance();
    balanceMonitor = BalanceMonitor.getInstance();

    // Initialize portfolio tracker database
    await portfolioTracker.initializeDatabase();

    // Connect wallet
    await walletManager.connect();

    app.listen(PORT, () => {
      console.log('🚀 ═══════════════════════════════════════');
      console.log('🚀  SOLANA TRADING DASHBOARD ONLINE');
      console.log('🚀 ═══════════════════════════════════════');
      console.log(`🌐 Local:  http://localhost:${PORT}`);
      console.log(`📱 Mobile: http://[your-ip]:${PORT}`);
      console.log(`🔐 Wallet: ${walletManager.getPublicKey()?.toBase58()}`);
      console.log(`🎯 Mode: ${walletManager.canSign() ? '🔴 LIVE TRADING' : '👁️ READ-ONLY'}`);
      console.log('🚀 ═══════════════════════════════════════');
    });
  } catch (error) {
    console.error('❌ Failed to start web server:', error);
    process.exit(1);
  }
}

export { startServer };

if (require.main === module) {
  startServer();
}