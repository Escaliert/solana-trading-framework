#!/usr/bin/env ts-node
import express from 'express';
import { PortfolioTracker } from './modules/portfolio-tracker';
import { TradingDaemon } from './modules/trading-engine/trading-daemon';
import { WalletManager } from './core/wallet-manager';
import { JupiterTrader } from './modules/trading-engine/jupiter-trader';
import { WalletMonitor } from './modules/trading-engine/wallet-monitor';
import { TradingConfigManager } from './modules/trading-engine/trading-config';
import { AutoTrader } from './modules/trading-engine/auto-trader';

const app = express();
const PORT = process.env.WEB_PORT || 3000;

app.use(express.json());

// Initialize components
let portfolioTracker: PortfolioTracker;
let tradingDaemon: TradingDaemon;
let walletManager: WalletManager;
let jupiterTrader: JupiterTrader;
let walletMonitor: WalletMonitor;
let tradingConfig: TradingConfigManager;

// Cache
let portfolioCache: any = null;
let portfolioCacheTime: number = 0;
let opportunitiesCache: any[] = [];
let opportunitiesCacheTime: number = 0;
const CACHE_DURATION = 120000; // 2 minutes - länger wegen Rate-Limiting

// Main dashboard HTML
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
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            background: #0f172a;
            color: #e2e8f0;
            line-height: 1.6;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header {
            background: linear-gradient(135deg, #1e40af, #7c3aed);
            padding: 2rem;
            border-radius: 12px;
            margin-bottom: 2rem;
            text-align: center;
        }
        .header h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
        .header p { opacity: 0.9; font-size: 1.1rem; }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        .card {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 12px;
            padding: 1.5rem;
        }
        .card h3 { color: #3b82f6; margin-bottom: 1rem; font-size: 1.3rem; }
        .btn {
            display: inline-block;
            padding: 12px 24px;
            background: #3b82f6;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            margin: 0.5rem 0.5rem 0.5rem 0;
            border: none;
            cursor: pointer;
            font-size: 1rem;
            transition: all 0.3s;
        }
        .btn:hover { background: #2563eb; transform: translateY(-2px); }
        .btn-danger { background: #dc2626; }
        .btn-danger:hover { background: #b91c1c; }
        .btn-success { background: #16a34a; }
        .btn-success:hover { background: #15803d; }
        .btn-warning { background: #f59e0b; }
        .btn-warning:hover { background: #d97706; }
        .status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: 600;
        }
        .status-live { background: #dc2626; color: white; }
        .status-stopped { background: #6b7280; color: white; }
        .status-success { background: #16a34a; color: white; }
        .table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
        }
        .table th, .table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #334155;
        }
        .table th {
            background: #334155;
            color: #f1f5f9;
            font-weight: 600;
        }
        .opportunity-card {
            background: #164e63;
            border: 1px solid #0891b2;
            border-radius: 8px;
            padding: 1rem;
            margin: 0.5rem 0;
        }
        .profit-positive { color: #16a34a; font-weight: bold; }
        .profit-negative { color: #dc2626; font-weight: bold; }
        .loading { text-align: center; padding: 2rem; }
        .section {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 12px;
            padding: 2rem;
            margin-bottom: 2rem;
        }
        .manual-trade {
            display: grid;
            grid-template-columns: 2fr 2fr 1fr 1fr;
            gap: 1rem;
            align-items: end;
        }
        .form-group { display: flex; flex-direction: column; }
        .form-group label { margin-bottom: 0.5rem; color: #94a3b8; }
        .form-group input, .form-group select {
            padding: 0.75rem;
            border: 1px solid #334155;
            border-radius: 6px;
            background: #0f172a;
            color: #e2e8f0;
        }
        .toast {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem;
            border-radius: 8px;
            color: white;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s;
        }
        .toast.show { opacity: 1; }
        .toast.success { background: #16a34a; }
        .toast.error { background: #dc2626; }
        @media (max-width: 768px) {
            .container { padding: 10px; }
            .manual-trade { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Solana Trading Dashboard</h1>
            <p>Professional Trading & Portfolio Management</p>
            <div style="margin-top: 1rem;">
                <span id="status" class="status status-stopped">Loading...</span>
                <span id="wallet-balance" style="margin-left: 1rem; color: #60a5fa;">SOL: --</span>
            </div>
        </div>

        <div class="grid">
            <!-- Portfolio Card -->
            <div class="card">
                <h3>📊 Portfolio Overview</h3>
                <div id="portfolio-data" class="loading">Loading portfolio...</div>
                <button onclick="refreshPortfolio()" class="btn">🔄 Refresh</button>
            </div>

            <!-- Trading Opportunities -->
            <div class="card">
                <h3>🎯 Trading Opportunities</h3>
                <div id="opportunities-data" class="loading">Loading opportunities...</div>
                <button onclick="refreshOpportunities()" class="btn">🔄 Refresh</button>
            </div>

            <!-- Auto Trading Control -->
            <div class="card">
                <h3>🤖 Auto Trading</h3>
                <div id="daemon-status" class="loading">Loading status...</div>
                <div style="margin-top: 1rem;">
                    <button onclick="startAutoTrading()" class="btn btn-success">▶️ Start</button>
                    <button onclick="stopAutoTrading()" class="btn btn-danger">⏹️ Stop</button>
                    <button onclick="refreshStatus()" class="btn">🔄 Status</button>
                </div>
            </div>

            <!-- Quick Stats -->
            <div class="card">
                <h3>📈 Quick Stats</h3>
                <div id="stats-data" class="loading">Loading stats...</div>
                <button onclick="refreshStats()" class="btn">🔄 Refresh</button>
            </div>
        </div>

        <!-- Manual Trading Section -->
        <div class="section">
            <h3>💱 Manual Trading</h3>
            <p style="margin-bottom: 1rem; color: #94a3b8;">Execute manual swaps directly through Jupiter</p>

            <div class="manual-trade">
                <div class="form-group">
                    <label>From Token</label>
                    <select id="fromToken">
                        <option value="So11111111111111111111111111111111111111112">SOL</option>
                        <option value="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v">USDC</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>To Token</label>
                    <select id="toToken">
                        <option value="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v">USDC</option>
                        <option value="So11111111111111111111111111111111111111112">SOL</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Amount</label>
                    <input type="number" id="swapAmount" placeholder="0.01" step="0.001" min="0.001">
                </div>

                <div class="form-group">
                    <label>&nbsp;</label>
                    <button onclick="executeManualSwap()" class="btn btn-warning">🔄 Swap</button>
                </div>
            </div>

            <div id="swap-result" style="margin-top: 1rem;"></div>
        </div>

        <!-- Trading Settings -->
        <div class="section">
            <h3>⚙️ Trading Settings</h3>
            <div id="settings-container">
                <div class="loading">Loading settings...</div>
            </div>
            <div style="margin-top: 1rem;">
                <button onclick="loadSettings()" class="btn">🔄 Load Settings</button>
                <button onclick="saveSettings()" class="btn btn-success">💾 Save Settings</button>
            </div>
        </div>

        <!-- Recent Transactions -->
        <div class="section">
            <h3>📋 Recent Activity</h3>
            <div id="recent-activity">Loading recent transactions...</div>
            <button onclick="refreshActivity()" class="btn">🔄 Refresh</button>
        </div>
    </div>

    <div id="toast" class="toast"></div>

    <script>
        let refreshInterval;

        // Utility functions
        function showToast(message, type = 'success') {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = \`toast \${type} show\`;
            setTimeout(() => {
                toast.className = 'toast';
            }, 3000);
        }

        function formatCurrency(value) {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2
            }).format(value);
        }

        function formatPercent(value) {
            const color = value >= 0 ? 'profit-positive' : 'profit-negative';
            const sign = value >= 0 ? '+' : '';
            return \`<span class="\${color}">\${sign}\${value.toFixed(2)}%</span>\`;
        }

        // API calls
        async function apiCall(endpoint, options = {}) {
            try {
                const response = await fetch(endpoint, {
                    headers: { 'Content-Type': 'application/json' },
                    ...options
                });
                return await response.json();
            } catch (error) {
                console.error('API Error:', error);
                showToast('API Error: ' + error.message, 'error');
                return null;
            }
        }

        // Portfolio functions
        async function refreshPortfolio() {
            const data = await apiCall('/api/portfolio');
            if (data && data.success) {
                displayPortfolio(data.data);
                document.getElementById('wallet-balance').textContent =
                    \`SOL: \${data.data.solBalance?.toFixed(4) || 0}\`;
            }
        }

        function displayPortfolio(portfolio) {
            const container = document.getElementById('portfolio-data');
            if (!portfolio) {
                container.innerHTML = '<p>No portfolio data available</p>';
                return;
            }

            container.innerHTML = \`
                <div style="margin-bottom: 1rem;">
                    <strong>Total Value:</strong> \${formatCurrency(portfolio.totalValue || 0)}<br>
                    <strong>P&L:</strong> \${formatPercent(portfolio.totalUnrealizedPnLPercent || 0)}<br>
                    <strong>Positions:</strong> \${portfolio.positions?.length || 0}
                </div>
                <div style="max-height: 200px; overflow-y: auto;">
                    \${portfolio.positions?.filter(pos =>
                        (pos.balanceUiAmount || 0) > 0 &&
                        ((pos.balanceUiAmount || 0) * (pos.currentPrice || 0)) >= 0.01
                    ).slice(0, 8).map(pos => \`
                        <div style="padding: 0.5rem; border-bottom: 1px solid #334155;">
                            <strong>\${pos.tokenInfo?.symbol || 'Unknown'}:</strong>
                            \${formatCurrency((pos.balanceUiAmount || 0) * (pos.currentPrice || 0))}
                            \${pos.unrealizedPnLPercent ? formatPercent(pos.unrealizedPnLPercent) : ''}
                            <small style="color: #94a3b8; display: block;">Balance: \${(pos.balanceUiAmount || 0).toFixed(4)}</small>
                        </div>
                    \`).join('') || '<p>No significant positions found</p>'}
                </div>
            \`;
        }

        // Trading opportunities
        async function refreshOpportunities() {
            const data = await apiCall('/api/opportunities');
            if (data && data.success) {
                displayOpportunities(data.data || []);
            }
        }

        function displayOpportunities(opportunities) {
            const container = document.getElementById('opportunities-data');
            if (!opportunities || opportunities.length === 0) {
                container.innerHTML = '<p>No trading opportunities found</p>';
                return;
            }

            container.innerHTML = opportunities.map(opp => \`
                <div class="opportunity-card">
                    <strong>\${opp.token.tokenInfo.symbol}</strong><br>
                    Profit: \${formatPercent(opp.currentProfitPercent)}<br>
                    Sell \${opp.recommendedSellPercent}% for ~\${formatCurrency(opp.estimatedProceeds)}<br>
                    <small>Priority: \${opp.priority}</small>
                </div>
            \`).join('');
        }

        // Auto trading
        async function startAutoTrading() {
            const data = await apiCall('/api/trading/start', { method: 'POST' });
            if (data && data.success) {
                showToast('Auto trading started');
                refreshStatus();
            }
        }

        async function stopAutoTrading() {
            const data = await apiCall('/api/trading/stop', { method: 'POST' });
            if (data && data.success) {
                showToast('Auto trading stopped');
                refreshStatus();
            }
        }

        async function refreshStatus() {
            const data = await apiCall('/api/trading/status');
            if (data && data.daemon) {
                displayStatus(data.daemon);
            }
        }

        function displayStatus(status) {
            const container = document.getElementById('daemon-status');
            const statusEl = document.getElementById('status');

            if (status.isRunning) {
                statusEl.className = 'status status-live';
                statusEl.textContent = '🟢 ACTIVE';
            } else {
                statusEl.className = 'status status-stopped';
                statusEl.textContent = '🔴 STOPPED';
            }

            container.innerHTML = \`
                <div>Status: \${status.isRunning ? '🟢 Running' : '🔴 Stopped'}</div>
                <div>Cycles: \${status.cyclesCompleted || 0}</div>
                <div>Errors: \${status.errorsEncountered || 0}</div>
                <div>Next check: \${status.nextCycleIn || 0}s</div>
            \`;
        }

        // Manual trading
        async function executeManualSwap() {
            const fromToken = document.getElementById('fromToken').value;
            const toToken = document.getElementById('toToken').value;
            const amount = parseFloat(document.getElementById('swapAmount').value);

            if (!amount || amount <= 0) {
                showToast('Please enter a valid amount', 'error');
                return;
            }

            if (fromToken === toToken) {
                showToast('Please select different tokens', 'error');
                return;
            }

            document.getElementById('swap-result').innerHTML = '<div class="loading">Executing swap...</div>';

            const data = await apiCall('/api/manual-swap', {
                method: 'POST',
                body: JSON.stringify({
                    fromToken,
                    toToken,
                    amount
                })
            });

            if (data && data.success) {
                document.getElementById('swap-result').innerHTML = \`
                    <div style="color: #16a34a; padding: 1rem; background: #164e63; border-radius: 8px;">
                        ✅ Swap successful!<br>
                        <strong>Transaction:</strong> <a href="https://solscan.io/tx/\${data.signature}" target="_blank" style="color: #60a5fa;">\${data.signature?.slice(0, 8)}...</a><br>
                        <strong>Amount:</strong> \${data.inputAmount} → \${data.outputAmount}
                    </div>
                \`;
                showToast('Swap executed successfully!');
                refreshPortfolio();
            } else {
                document.getElementById('swap-result').innerHTML = \`
                    <div style="color: #dc2626; padding: 1rem; background: #7f1d1d; border-radius: 8px;">
                        ❌ Swap failed: \${data?.error || 'Unknown error'}
                    </div>
                \`;
                showToast('Swap failed', 'error');
            }
        }

        // Recent Activity functions
        async function refreshActivity() {
            const data = await apiCall('/api/recent-activity');
            if (data && data.success) {
                displayActivity(data.data || []);
            }
        }

        function displayActivity(activities) {
            const container = document.getElementById('recent-activity');
            if (!activities || activities.length === 0) {
                container.innerHTML = '<p>No recent trading activity</p>';
                return;
            }

            container.innerHTML = activities.slice(0, 10).map(activity => \`
                <div style="padding: 0.75rem; border-bottom: 1px solid #334155; margin-bottom: 0.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong>\${activity.tokenSymbol || 'Unknown'}</strong>
                        <span style="color: \${activity.success ? '#16a34a' : '#dc2626'};">
                            \${activity.success ? '✅' : '❌'}
                        </span>
                    </div>
                    <div style="font-size: 0.9rem; color: #94a3b8;">
                        \${activity.executionMode === 'LIVE' ? '🔴 LIVE' : '🧪 DRY'} -
                        Sold \${activity.amountIn ? activity.amountIn.toFixed(4) : '0'} \${activity.tokenSymbol}
                        \${activity.tokenSymbol === 'SOL' ?
                            \`for \${activity.amountOut ? (activity.amountOut / 1e6).toFixed(2) : '0'} USDC\` :
                            \`for \${activity.amountOut ? (activity.amountOut / 1e9).toFixed(6) : '0'} SOL\`
                        }
                    </div>
                    \${activity.signature ? \`
                        <div style="font-size: 0.8rem; margin-top: 0.25rem;">
                            <a href="https://solscan.io/tx/\${activity.signature}" target="_blank" style="color: #60a5fa;">
                                View Transaction
                            </a>
                        </div>
                    \` : ''}
                    <div style="font-size: 0.8rem; color: #6b7280;">
                        \${new Date(activity.timestamp).toLocaleString()}
                    </div>
                </div>
            \`).join('');
        }

        // Quick Stats functions
        async function refreshStats() {
            const data = await apiCall('/api/portfolio');
            if (data && data.success) {
                displayStats(data.data);
            }
        }

        function displayStats(portfolio) {
            const container = document.getElementById('stats-data');
            if (!portfolio) {
                container.innerHTML = '<p>No portfolio data available</p>';
                return;
            }

            const profitableTokens = portfolio.positions?.filter(p =>
                p.unrealizedPnLPercent && p.unrealizedPnLPercent > 0
            ).length || 0;

            const losingTokens = portfolio.positions?.filter(p =>
                p.unrealizedPnLPercent && p.unrealizedPnLPercent < 0
            ).length || 0;

            const biggestWinner = portfolio.positions?.reduce((max, pos) =>
                (pos.unrealizedPnLPercent || 0) > (max.unrealizedPnLPercent || 0) ? pos : max,
                { unrealizedPnLPercent: 0, tokenInfo: { symbol: 'None' } }
            );

            const biggestLoser = portfolio.positions?.reduce((min, pos) =>
                (pos.unrealizedPnLPercent || 0) < (min.unrealizedPnLPercent || 0) ? pos : min,
                { unrealizedPnLPercent: 0, tokenInfo: { symbol: 'None' } }
            );

            container.innerHTML = \`
                <div style="font-size: 0.9rem; line-height: 1.4;">
                    <div style="margin-bottom: 0.5rem;">
                        <strong>Profitable Tokens:</strong> \${profitableTokens}
                    </div>
                    <div style="margin-bottom: 0.5rem;">
                        <strong>Losing Tokens:</strong> \${losingTokens}
                    </div>
                    <div style="margin-bottom: 0.5rem;">
                        <strong>Biggest Winner:</strong><br>
                        \${biggestWinner.tokenInfo.symbol} \${biggestWinner.unrealizedPnLPercent ? formatPercent(biggestWinner.unrealizedPnLPercent) : ''}
                    </div>
                    <div>
                        <strong>Biggest Loser:</strong><br>
                        \${biggestLoser.tokenInfo.symbol} \${biggestLoser.unrealizedPnLPercent ? formatPercent(biggestLoser.unrealizedPnLPercent) : ''}
                    </div>
                </div>
            \`;
        }

        // Settings functions
        let currentSettings = null;

        async function loadSettings() {
            const data = await apiCall('/api/settings');
            if (data && data.success) {
                currentSettings = data.data;
                displaySettings(currentSettings);
            } else {
                showToast('Failed to load settings', 'error');
            }
        }

        // Alias for consistency with other refresh functions
        const refreshSettings = loadSettings;

        function displaySettings(settings) {
            const container = document.getElementById('settings-container');
            container.innerHTML = \`
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem;">
                    <!-- Profit Taking Settings -->
                    <div style="border: 1px solid #334155; border-radius: 8px; padding: 1rem;">
                        <h4 style="color: #3b82f6; margin-bottom: 1rem;">💰 Profit Taking</h4>

                        <label style="display: flex; align-items: center; margin-bottom: 1rem;">
                            <input type="checkbox" id="profit-enabled" \${settings.profitTaking.enabled ? 'checked' : ''}
                                   style="margin-right: 0.5rem; transform: scale(1.2);">
                            Enable Profit Taking
                        </label>

                        <div id="profit-targets">
                            <h5 style="margin-bottom: 0.5rem;">Exit Targets:</h5>
                            \${settings.profitTaking.targets.map((target, index) => \`
                                <div style="border: 1px solid #475569; border-radius: 6px; padding: 0.75rem; margin-bottom: 0.5rem;">
                                    <div style="display: grid; grid-template-columns: auto 1fr auto auto auto; gap: 0.5rem; align-items: center;">
                                        <input type="checkbox" \${target.enabled ? 'checked' : ''}
                                               onchange="updateTarget(\${index}, 'enabled', this.checked)">
                                        <input type="text" value="\${target.name}"
                                               onchange="updateTarget(\${index}, 'name', this.value)"
                                               style="background: #0f172a; border: 1px solid #334155; color: #e2e8f0; padding: 0.25rem;">
                                        <input type="number" value="\${target.triggerPercent}" min="1" max="1000"
                                               onchange="updateTarget(\${index}, 'triggerPercent', parseInt(this.value))"
                                               style="width: 70px; background: #0f172a; border: 1px solid #334155; color: #e2e8f0; padding: 0.25rem;">
                                        <span style="color: #94a3b8;">% →</span>
                                        <input type="number" value="\${target.sellPercent}" min="1" max="100"
                                               onchange="updateTarget(\${index}, 'sellPercent', parseInt(this.value))"
                                               style="width: 60px; background: #0f172a; border: 1px solid #334155; color: #e2e8f0; padding: 0.25rem;">
                                        <span style="color: #94a3b8;">%</span>
                                    </div>
                                </div>
                            \`).join('')}
                        </div>

                        <div style="margin-top: 1rem;">
                            <label style="color: #94a3b8;">Minimum Profit Requirement:</label>
                            <input type="number" id="min-profit" value="\${settings.riskManagement.requireMinimumProfit}"
                                   min="0" max="100" style="width: 80px; background: #0f172a; border: 1px solid #334155; color: #e2e8f0; padding: 0.25rem;">
                            <span style="color: #94a3b8;">%</span>
                        </div>

                        <div style="margin-top: 1rem; border-top: 1px solid #475569; padding-top: 1rem;">
                            <label style="color: #94a3b8;">Full Sell Threshold:</label>
                            <input type="number" id="full-sell-threshold" value="\${settings.profitTaking.fullSellThresholdUSD}"
                                   min="0.1" max="100" step="0.1" style="width: 80px; background: #0f172a; border: 1px solid #334155; color: #e2e8f0; padding: 0.25rem;">
                            <span style="color: #94a3b8;">USD</span>
                            <div style="font-size: 0.8rem; color: #6b7280; margin-top: 0.25rem;">
                                Below this value, sell 100% instead of target %
                            </div>
                        </div>
                    </div>

                    <!-- Execution Settings -->
                    <div style="border: 1px solid #334155; border-radius: 8px; padding: 1rem;">
                        <h4 style="color: #3b82f6; margin-bottom: 1rem;">⚡ Execution</h4>

                        <label style="display: flex; align-items: center; margin-bottom: 1rem;">
                            <input type="checkbox" id="dry-run" \${settings.execution.dryRun ? 'checked' : ''}
                                   style="margin-right: 0.5rem; transform: scale(1.2);">
                            <span style="color: \${settings.execution.dryRun ? '#f59e0b' : '#16a34a'};">
                                \${settings.execution.dryRun ? '🧪 DRY RUN Mode' : '🔴 LIVE Trading'}
                            </span>
                        </label>

                        <div style="margin-bottom: 1rem;">
                            <label style="color: #94a3b8;">Slippage Tolerance:</label>
                            <input type="number" id="slippage" value="\${settings.execution.slippagePercent}"
                                   min="0.1" max="20" step="0.1" style="width: 80px; background: #0f172a; border: 1px solid #334155; color: #e2e8f0; padding: 0.25rem;">
                            <span style="color: #94a3b8;">%</span>
                        </div>

                        <div style="margin-bottom: 1rem;">
                            <label style="color: #94a3b8;">Max Price Impact:</label>
                            <input type="number" id="price-impact" value="\${settings.execution.maxPriceImpactPercent}"
                                   min="0.1" max="50" step="0.1" style="width: 80px; background: #0f172a; border: 1px solid #334155; color: #e2e8f0; padding: 0.25rem;">
                            <span style="color: #94a3b8;">%</span>
                        </div>
                    </div>

                    <!-- Monitoring Settings -->
                    <div style="border: 1px solid #334155; border-radius: 8px; padding: 1rem;">
                        <h4 style="color: #3b82f6; margin-bottom: 1rem;">👁️ Monitoring</h4>

                        <div style="margin-bottom: 1rem;">
                            <label style="color: #94a3b8;">Check Interval:</label>
                            <input type="number" id="check-interval" value="\${settings.monitoring.checkIntervalMs / 1000}"
                                   min="10" max="300" style="width: 80px; background: #0f172a; border: 1px solid #334155; color: #e2e8f0; padding: 0.25rem;">
                            <span style="color: #94a3b8;">seconds</span>
                        </div>

                        <div style="margin-bottom: 1rem;">
                            <label style="color: #94a3b8;">Price Update Interval:</label>
                            <input type="number" id="price-interval" value="\${settings.monitoring.priceUpdateIntervalMs / 1000}"
                                   min="5" max="180" style="width: 80px; background: #0f172a; border: 1px solid #334155; color: #e2e8f0; padding: 0.25rem;">
                            <span style="color: #94a3b8;">seconds</span>
                        </div>

                        <div style="margin-bottom: 1rem;">
                            <label style="color: #94a3b8;">Max Daily Trades:</label>
                            <input type="number" id="max-trades" value="\${settings.riskManagement.maxDailyTrades}"
                                   min="1" max="100" style="width: 80px; background: #0f172a; border: 1px solid #334155; color: #e2e8f0; padding: 0.25rem;">
                        </div>
                    </div>
                </div>
            \`;
        }

        function updateTarget(index, field, value) {
            if (currentSettings && currentSettings.profitTaking.targets[index]) {
                currentSettings.profitTaking.targets[index][field] = value;
            }
        }

        async function saveSettings() {
            if (!currentSettings) {
                showToast('No settings loaded', 'error');
                return;
            }

            // Update settings from form
            currentSettings.profitTaking.enabled = document.getElementById('profit-enabled').checked;
            currentSettings.profitTaking.fullSellThresholdUSD = parseFloat(document.getElementById('full-sell-threshold').value);
            currentSettings.execution.dryRun = document.getElementById('dry-run').checked;
            currentSettings.execution.slippagePercent = parseFloat(document.getElementById('slippage').value);
            currentSettings.execution.maxPriceImpactPercent = parseFloat(document.getElementById('price-impact').value);
            currentSettings.monitoring.checkIntervalMs = parseInt(document.getElementById('check-interval').value) * 1000;
            currentSettings.monitoring.priceUpdateIntervalMs = parseInt(document.getElementById('price-interval').value) * 1000;
            currentSettings.riskManagement.maxDailyTrades = parseInt(document.getElementById('max-trades').value);
            currentSettings.riskManagement.requireMinimumProfit = parseInt(document.getElementById('min-profit').value);

            const response = await apiCall('/api/settings', {
                method: 'POST',
                body: JSON.stringify(currentSettings)
            });

            if (response && response.success) {
                showToast('Settings saved successfully!');
            } else {
                showToast('Failed to save settings', 'error');
            }
        }

        // Initialize dashboard
        async function initDashboard() {
            await Promise.all([
                refreshPortfolio(),
                refreshOpportunities(),
                refreshStatus(),
                refreshActivity(),
                refreshStats(),
                refreshSettings()
            ]);

            // Set up auto-refresh
            refreshInterval = setInterval(async () => {
                await Promise.all([
                    refreshOpportunities(),
                    refreshStatus(),
                    refreshActivity(),
                    refreshStats()
                ]);
            }, 30000); // Every 30 seconds
        }

        // Start dashboard
        initDashboard();
    </script>
</body>
</html>
  `);
});

// API Endpoints
app.get('/api/portfolio', async (_req, res) => {
  try {
    if (!portfolioTracker) {
      return res.json({ success: false, error: 'Portfolio tracker not initialized' });
    }

    const now = Date.now();
    if (portfolioCache && now - portfolioCacheTime < CACHE_DURATION) {
      return res.json({ success: true, data: portfolioCache, cached: true });
    }

    // NIEMALS Portfolio-Updates im Dashboard - nur aktuellen Stand verwenden
    let portfolio = portfolioTracker.getCurrentPortfolio();

    // Falls gar kein Portfolio vorhanden, return error (sollte nicht passieren wenn Trading Daemon läuft)
    if (!portfolio) {
      console.warn('⚠️ No portfolio available - Trading Daemon might not be running');
      return res.json({
        success: false,
        error: 'No portfolio data available. Please start trading daemon first.',
        data: null
      });
    }

    portfolioCache = portfolio;
    portfolioCacheTime = now;

    return res.json({ success: true, data: portfolio });
  } catch (error) {
    console.error('Portfolio API error:', error);
    return res.json({ success: false, error: 'Failed to get portfolio: ' + (error instanceof Error ? error.message : String(error)) });
  }
});

app.get('/api/opportunities', async (_req, res) => {
  try {
    if (!walletMonitor) {
      return res.json({ success: false, error: 'Wallet monitor not initialized' });
    }

    const now = Date.now();
    if (opportunitiesCache.length > 0 && now - opportunitiesCacheTime < CACHE_DURATION) {
      return res.json({ success: true, data: opportunitiesCache, cached: true });
    }

    const opportunities = walletMonitor.getCurrentOpportunities();

    opportunitiesCache = opportunities;
    opportunitiesCacheTime = now;

    return res.json({ success: true, data: opportunities });
  } catch (error) {
    console.error('Opportunities API error:', error);
    return res.json({ success: false, error: 'Failed to get opportunities: ' + (error instanceof Error ? error.message : String(error)) });
  }
});

app.get('/api/trading/status', async (_req, res) => {
  try {
    if (!tradingDaemon) {
      return res.json({ success: false, error: 'Trading daemon not initialized' });
    }

    const status = tradingDaemon.getStatus();
    return res.json({ success: true, daemon: status });
  } catch (error) {
    return res.json({ success: false, error: 'Failed to get status: ' + (error instanceof Error ? error.message : String(error)) });
  }
});

app.post('/api/trading/start', async (_req, res) => {
  try {
    if (!tradingDaemon) {
      return res.json({ success: false, error: 'Trading daemon not initialized' });
    }

    await tradingDaemon.start();
    return res.json({ success: true, message: 'Trading daemon started' });
  } catch (error) {
    return res.json({ success: false, error: 'Failed to start trading daemon: ' + (error instanceof Error ? error.message : String(error)) });
  }
});

app.post('/api/trading/stop', async (_req, res) => {
  try {
    if (!tradingDaemon) {
      return res.json({ success: false, error: 'Trading daemon not initialized' });
    }

    await tradingDaemon.stop();
    return res.json({ success: true, message: 'Trading daemon stopped' });
  } catch (error) {
    return res.json({ success: false, error: 'Failed to stop trading daemon: ' + (error instanceof Error ? error.message : String(error)) });
  }
});

app.post('/api/manual-swap', async (req, res) => {
  try {
    if (!walletManager || !jupiterTrader) {
      return res.json({ success: false, error: 'Trading components not initialized' });
    }

    const { fromToken, toToken, amount } = req.body;

    if (!fromToken || !toToken || !amount) {
      return res.json({ success: false, error: 'Missing required parameters' });
    }

    const publicKey = walletManager.getPublicKey();
    if (!publicKey) {
      return res.json({ success: false, error: 'Wallet not connected' });
    }

    // Convert amount to proper units
    let amountInSmallestUnit;
    if (fromToken === 'So11111111111111111111111111111111111111112') {
      // SOL has 9 decimals
      amountInSmallestUnit = Math.floor(amount * 1e9);
    } else {
      // USDC has 6 decimals
      amountInSmallestUnit = Math.floor(amount * 1e6);
    }

    const result = await jupiterTrader.executeSwap(
      fromToken,
      toToken,
      amountInSmallestUnit,
      publicKey,
      100, // 1% slippage
      false // Live trading
    );

    if (result.success) {
      return res.json({
        success: true,
        signature: result.signature,
        inputAmount: (result.inputAmount / (fromToken.includes('Sol') ? 1e9 : 1e6)).toFixed(6),
        outputAmount: (result.outputAmount / (toToken.includes('Sol') ? 1e9 : 1e6)).toFixed(6)
      });
    } else {
      return res.json({ success: false, error: result.error });
    }

  } catch (error) {
    console.error('Manual swap API error:', error);
    return res.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Settings API endpoints
app.get('/api/settings', async (_req, res) => {
  try {
    if (!tradingConfig) {
      return res.json({ success: false, error: 'Trading config not initialized' });
    }

    const settings = tradingConfig.getSettings();
    return res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Settings API error:', error);
    return res.json({ success: false, error: 'Failed to get settings: ' + (error instanceof Error ? error.message : String(error)) });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    if (!tradingConfig) {
      return res.json({ success: false, error: 'Trading config not initialized' });
    }

    const newSettings = req.body;
    tradingConfig.updateSettings(newSettings);

    return res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Settings update API error:', error);
    return res.json({ success: false, error: 'Failed to update settings: ' + (error instanceof Error ? error.message : String(error)) });
  }
});

// Recent Activity API endpoint
app.get('/api/recent-activity', async (_req, res) => {
  try {
    if (!tradingDaemon) {
      return res.json({ success: false, error: 'Trading daemon not initialized' });
    }

    // Get recent trading activity from the auto trader directly
    const autoTrader = AutoTrader.getInstance();
    const activity = autoTrader.getRecentExecutions(20);  // Get last 20 trades
    return res.json({ success: true, data: activity });
  } catch (error) {
    console.error('Recent activity API error:', error);
    return res.json({ success: false, error: 'Failed to get recent activity: ' + (error instanceof Error ? error.message : String(error)) });
  }
});

// Initialize and start
async function startTradingDashboard() {
  try {
    console.log('🚀 Initializing Trading Dashboard...');

    // Initialize components
    portfolioTracker = PortfolioTracker.getInstance();
    tradingDaemon = TradingDaemon.getInstance();
    walletManager = WalletManager.getInstance();
    jupiterTrader = JupiterTrader.getInstance();
    walletMonitor = WalletMonitor.getInstance();
    tradingConfig = TradingConfigManager.getInstance();

    // Initialize database and wallet
    await portfolioTracker.initializeDatabase();
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
    console.error('❌ Failed to start dashboard:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startTradingDashboard();
}

export { startTradingDashboard };