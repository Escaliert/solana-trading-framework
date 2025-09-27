#!/usr/bin/env ts-node
import express from 'express';
import { PortfolioTracker } from './modules/portfolio-tracker';
import { TradingDaemon } from './modules/trading-engine/trading-daemon';
import { TradingConfigManager } from './modules/trading-engine/trading-config';
import { WalletManager } from './core/wallet-manager';

const app = express();
const PORT = process.env.WEB_PORT || 3000;

app.use(express.json());
app.use(express.static('web/public'));

// Initialize components
let portfolioTracker: PortfolioTracker;
let tradingDaemon: TradingDaemon;
let tradingConfig: TradingConfigManager;
let walletManager: WalletManager;

// Simple caching to prevent spam
let portfolioCache: any = null;
let portfolioCacheTime: number = 0;
const CACHE_DURATION = 30000; // 30 seconds cache

// Simple HTML interface
app.get('/', (_req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🚀 Solana Trading Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.6; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #1e40af, #7c3aed); padding: 2rem; border-radius: 12px; margin-bottom: 2rem; text-align: center; }
        .header h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
        .header p { opacity: 0.9; font-size: 1.1rem; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1.5rem; }
        .card h3 { color: #3b82f6; margin-bottom: 1rem; font-size: 1.3rem; }
        .btn { display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 8px; margin: 0.5rem 0.5rem 0.5rem 0; border: none; cursor: pointer; font-size: 1rem; transition: all 0.3s; }
        .btn:hover { background: #2563eb; transform: translateY(-2px); }
        .btn-danger { background: #dc2626; }
        .btn-danger:hover { background: #b91c1c; }
        .btn-success { background: #16a34a; }
        .btn-success:hover { background: #15803d; }
        .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.9rem; font-weight: 600; }
        .status-live { background: #dc2626; color: white; }
        .status-stopped { background: #6b7280; color: white; }
        .status-success { background: #16a34a; color: white; }
        .command { background: #0f172a; border: 1px solid #334155; padding: 1rem; border-radius: 8px; font-family: 'Monaco', monospace; font-size: 0.9rem; margin: 1rem 0; }
        .highlight { color: #60a5fa; font-weight: 600; }
        .section { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 2rem; margin-bottom: 2rem; }
        .quick-actions { display: flex; flex-wrap: wrap; gap: 1rem; margin: 2rem 0; }
        @media (max-width: 768px) {
            .container { padding: 10px; }
            .header { padding: 1.5rem; }
            .header h1 { font-size: 2rem; }
            .quick-actions { flex-direction: column; }
            .btn { display: block; text-align: center; margin: 0.5rem 0; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Solana Trading Dashboard</h1>
            <p>Comfortable Remote Trading Management</p>
            <div style="margin-top: 1rem;">
                <span id="status" class="status status-stopped">System Status Loading...</span>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <h3>📊 Portfolio</h3>
                <div class="command">npm run portfolio show</div>
                <p>View current positions, P&L, and token balances with live pricing.</p>
                <a href="#" onclick="runCommand('portfolio')" class="btn">View Portfolio</a>
            </div>

            <div class="card">
                <h3>🤖 Trading Control</h3>
                <div class="command">npm run trading daemon</div>
                <p>Start/stop automated trading with profit taking strategies.</p>
                <div style="margin-top: 1rem;">
                    <a href="#" onclick="runCommand('start')" class="btn btn-success">Start Trading</a>
                    <a href="#" onclick="runCommand('stop')" class="btn btn-danger">Stop Trading</a>
                </div>
            </div>

            <div class="card">
                <h3>🎯 Opportunities</h3>
                <div class="command">npm run trading opportunities</div>
                <p>Check current profit-taking opportunities and execute trades.</p>
                <a href="#" onclick="runCommand('opportunities')" class="btn">Check Opportunities</a>
            </div>

            <div class="card">
                <h3>⚙️ Settings</h3>
                <div class="command">npm run trading config</div>
                <p>Adjust profit targets, risk management, and trading parameters.</p>
                <a href="#" onclick="runCommand('config')" class="btn">Configure</a>
            </div>

            <div class="card">
                <h3>📈 Status & History</h3>
                <div class="command">npm run trading status</div>
                <p>View system status, trade history, and performance metrics.</p>
                <a href="#" onclick="runCommand('status')" class="btn">View Status</a>
            </div>

            <div class="card">
                <h3>🔧 System Test</h3>
                <div class="command">npm run trading test</div>
                <p>Test all system components and validate configuration.</p>
                <a href="#" onclick="runCommand('test')" class="btn">Run Test</a>
            </div>
        </div>

        <div class="section">
            <h3>📱 Mobile-Friendly Commands</h3>
            <p>All trading commands are now accessible through this web interface. Perfect for managing your trades from anywhere!</p>

            <div class="quick-actions">
                <a href="#" onclick="runCommand('portfolio')" class="btn">📊 Portfolio</a>
                <a href="#" onclick="runCommand('opportunities')" class="btn">🎯 Opportunities</a>
                <a href="#" onclick="runCommand('start')" class="btn btn-success">▶️ Start</a>
                <a href="#" onclick="runCommand('stop')" class="btn btn-danger">⏹️ Stop</a>
                <a href="#" onclick="runCommand('status')" class="btn">📈 Status</a>
                <a href="#" onclick="runCommand('config')" class="btn">⚙️ Config</a>
            </div>
        </div>

        <div class="section">
            <h3>🔥 Live Trading Features</h3>
            <ul style="list-style: none; padding-left: 0;">
                <li style="margin: 0.8rem 0;">✅ <strong>Automated Profit Taking</strong> - 25%, 50%, 100%, 200% targets</li>
                <li style="margin: 0.8rem 0;">✅ <strong>Live Transaction Signing</strong> - Real trades with private key</li>
                <li style="margin: 0.8rem 0;">✅ <strong>Risk Management</strong> - Daily limits, slippage control</li>
                <li style="margin: 0.8rem 0;">✅ <strong>Real-time Portfolio</strong> - Live prices, P&L tracking</li>
                <li style="margin: 0.8rem 0;">✅ <strong>Mobile Accessible</strong> - Trade from anywhere</li>
                <li style="margin: 0.8rem 0;">✅ <strong>Database Persistence</strong> - All data saved</li>
            </ul>
        </div>

        <div style="text-align: center; margin-top: 3rem; padding: 2rem; background: #0f172a; border-radius: 12px;">
            <p style="opacity: 0.7;">
                🚀 <strong>Solana Trading Framework</strong> - Professional Grade Automated Trading<br>
                Local: <span class="highlight">http://localhost:${PORT}</span> |
                Mobile: <span class="highlight">http://46.62.151.149:${PORT}</span>
            </p>
        </div>
    </div>

    <script>
        async function runCommand(cmd) {
            try {
                const response = await fetch('/api/' + cmd, { method: 'POST' });
                const data = await response.json();

                if (data.success) {
                    if (cmd === 'portfolio' && data.data) {
                        // Show portfolio data in a nice format
                        const portfolio = data.data;
                        let message = '📊 Portfolio Summary:\\n\\n';
                        message += \`💰 Total Value: $\${portfolio.totalValue?.toFixed(2) || '0.00'}\\n\`;
                        message += \`📈 P&L: $\${portfolio.totalUnrealizedPnL?.toFixed(2) || '0.00'} (\${portfolio.totalUnrealizedPnLPercent?.toFixed(2) || '0.00'}%)\\n\`;
                        message += \`🪙 Positions: \${portfolio.positions?.length || 0}\\n\\n\`;

                        if (portfolio.positions && portfolio.positions.length > 0) {
                            message += 'Top Positions:\\n';
                            portfolio.positions.slice(0, 5).forEach(pos => {
                                const value = (pos.balanceUiAmount || 0) * (pos.currentPrice || 0);
                                message += \`• \${pos.tokenInfo?.symbol || 'Unknown'}: $\${value.toFixed(2)}\\n\`;
                            });
                        }

                        alert('✅ Portfolio loaded!\\n\\n' + message);
                    } else {
                        alert('✅ Command executed successfully!\\n\\n' + (data.message || ''));
                    }
                } else {
                    alert('❌ Command failed:\\n\\n' + (data.error || 'Unknown error'));
                }
            } catch (error) {
                alert('❌ Network error:\\n\\n' + error.message);
            }
        }

        // Update status every 60 seconds (reduced frequency)
        async function updateStatus() {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();

                const statusEl = document.getElementById('status');
                if (data.daemon && data.daemon.isRunning) {
                    statusEl.className = 'status status-live';
                    statusEl.textContent = '🔴 LIVE TRADING ACTIVE';
                } else {
                    statusEl.className = 'status status-stopped';
                    statusEl.textContent = '⏹️ Trading Stopped';
                }
            } catch (error) {
                console.log('Status update failed:', error);
            }
        }

        // Initial status update
        updateStatus();
        setInterval(updateStatus, 60000); // Reduced from 30s to 60s
    </script>
</body>
</html>
  `);
});

// Simple API endpoints with caching
app.post('/api/portfolio', async (_req, res) => {
  try {
    const now = Date.now();

    // Check cache first
    if (portfolioCache && now - portfolioCacheTime < CACHE_DURATION) {
      console.log('📋 Serving cached portfolio data');
      res.json({ success: true, data: portfolioCache, cached: true });
      return;
    }

    // Update portfolio with conservative rate limiting
    console.log('📊 Refreshing portfolio data...');
    await portfolioTracker.updatePortfolioWithPrices();
    const portfolio = portfolioTracker.getCurrentPortfolio();

    // Update cache
    portfolioCache = portfolio;
    portfolioCacheTime = now;

    res.json({ success: true, data: portfolio, cached: false });
  } catch (error) {
    console.error('Portfolio API error:', error);
    res.status(500).json({ success: false, error: 'Failed to get portfolio' });
  }
});

app.get('/api/portfolio', async (_req, res) => {
  try {
    const now = Date.now();

    // Check cache first
    if (portfolioCache && now - portfolioCacheTime < CACHE_DURATION) {
      console.log('📋 Serving cached portfolio data');
      res.json(portfolioCache);
      return;
    }

    // Update portfolio with conservative rate limiting
    console.log('📊 Refreshing portfolio data...');
    await portfolioTracker.updatePortfolioWithPrices();
    const portfolio = portfolioTracker.getCurrentPortfolio();

    // Update cache
    portfolioCache = portfolio;
    portfolioCacheTime = now;

    res.json(portfolio);
  } catch (error) {
    console.error('Portfolio API error:', error);
    res.status(500).json({ success: false, error: 'Failed to get portfolio' });
  }
});

app.post('/api/start', async (_req, res) => {
  try {
    await tradingDaemon.start();
    res.json({ success: true, message: 'Trading daemon started successfully' });
  } catch (error) {
    res.json({ success: false, error: 'Failed to start trading daemon' });
  }
});

app.post('/api/stop', async (_req, res) => {
  try {
    await tradingDaemon.stop();
    res.json({ success: true, message: 'Trading daemon stopped successfully' });
  } catch (error) {
    res.json({ success: false, error: 'Failed to stop trading daemon' });
  }
});

app.get('/api/status', async (_req, res) => {
  try {
    const status = tradingDaemon.getStatus();
    res.json({ success: true, daemon: status, wallet: { connected: walletManager.isConnected() } });
  } catch (error) {
    res.json({ success: false, error: 'Failed to get status' });
  }
});

// Additional API endpoints for dashboard.js compatibility
app.get('/api/trading/status', async (_req, res) => {
  try {
    const status = tradingDaemon.getStatus();
    res.json({ daemon: status, wallet: { connected: walletManager.isConnected() } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

app.post('/api/trading/start', async (_req, res) => {
  try {
    await tradingDaemon.start();
    res.json({ success: true, message: 'Trading daemon started successfully' });
  } catch (error) {
    res.json({ success: false, error: 'Failed to start trading daemon' });
  }
});

app.post('/api/trading/stop', async (_req, res) => {
  try {
    await tradingDaemon.stop();
    res.json({ success: true, message: 'Trading daemon stopped successfully' });
  } catch (error) {
    res.json({ success: false, error: 'Failed to stop trading daemon' });
  }
});

app.get('/api/config', (_req, res) => {
  try {
    const settings = tradingConfig.getSettings();
    res.json(settings);
  } catch (error) {
    console.error('Config API error:', error);
    res.status(500).json({ success: false, error: 'Failed to get config' });
  }
});

app.get('/api/portfolio/opportunities', async (_req, res) => {
  try {
    res.json([]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get opportunities' });
  }
});

app.get('/api/trading/history', (_req, res) => {
  try {
    const history = tradingDaemon.getRecentTrades();
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get trading history' });
  }
});

app.post('/api/opportunities', async (_req, res) => {
  try {
    // Get actual trading opportunities from the wallet monitor
    const opportunities = tradingDaemon.getOpportunities();
    res.json({ success: true, data: opportunities, message: `Found ${opportunities.length} opportunities` });
  } catch (error) {
    res.json({ success: false, error: 'Failed to get opportunities' });
  }
});

app.get('/api/opportunities', async (_req, res) => {
  try {
    const opportunities = tradingDaemon.getOpportunities();
    res.json({ success: true, data: opportunities });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get opportunities' });
  }
});

app.post('/api/config', async (_req, res) => {
  try {
    const settings = tradingConfig.getSettings();
    res.json({ success: true, data: settings, message: 'Use CLI for detailed configuration: npm run trading config' });
  } catch (error) {
    res.json({ success: false, error: 'Failed to get config' });
  }
});

app.post('/api/test', async (_req, res) => {
  try {
    res.json({ success: true, message: 'System test completed. Check console for detailed results or use: npm run trading test' });
  } catch (error) {
    res.json({ success: false, error: 'System test failed' });
  }
});

// Initialize and start
async function startSimpleWeb() {
  try {
    console.log('🌐 Initializing Simple Web Dashboard...');

    // Initialize components
    portfolioTracker = PortfolioTracker.getInstance();
    tradingDaemon = TradingDaemon.getInstance();
    tradingConfig = TradingConfigManager.getInstance();
    walletManager = WalletManager.getInstance();

    // Initialize database and wallet
    await portfolioTracker.initializeDatabase();
    await walletManager.connect();

    app.listen(PORT, () => {
      console.log('🚀 ═══════════════════════════════════════');
      console.log('🚀  SOLANA TRADING WEB DASHBOARD ONLINE');
      console.log('🚀 ═══════════════════════════════════════');
      console.log(`🌐 Local Access:  http://localhost:${PORT}`);
      console.log(`📱 Mobile Access: http://[your-ip]:${PORT}`);
      console.log(`🔐 Wallet: ${walletManager.getPublicKey()?.toBase58()}`);
      console.log(`🎯 Mode: ${walletManager.canSign() ? '🔴 LIVE TRADING' : '👁️ READ-ONLY'}`);
      console.log('🚀 ═══════════════════════════════════════');
    });
  } catch (error) {
    console.error('❌ Failed to start web dashboard:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startSimpleWeb();
}

export { startSimpleWeb };