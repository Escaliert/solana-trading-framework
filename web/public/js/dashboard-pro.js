/**
 * Professional Solana Trading Platform
 * Built on stable foundation - preserves all working features
 */

class ProfessionalTradingDashboard {
    constructor() {
        this.data = {
            portfolio: null,
            status: null,
            config: null,
            opportunities: [],
            history: [],
            bots: [],
            strategies: []
        };

        this.cache = {
            portfolio: { data: null, timestamp: 0 },
            opportunities: { data: [], timestamp: 0 }
        };

        this.charts = {};
        this.updateInterval = null;
        this.CACHE_DURATION = 120000; // 2 minutes - same as stable version

        this.init();
    }

    async init() {
        console.log('🚀 Initializing Professional Trading Dashboard...');

        this.setupEventListeners();
        this.setupTabs();
        this.initializeCharts();

        await this.loadInitialData();
        this.startAutoRefresh();

        console.log('✅ Professional Dashboard initialized');
    }

    // =================== EVENT LISTENERS ===================
    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });

        // Global refresh
        window.refreshAll = () => this.refreshAll();
        window.showSettings = () => this.showSettings();

        // Trading controls (preserve stable functionality)
        this.setupTradingControls();

        // Real-time updates
        this.setupRealTimeUpdates();
    }

    setupTradingControls() {
        // Create trading control buttons dynamically
        const tradingControls = `
            <div class="trading-controls" style="display: none;">
                <button id="start-trading-btn" class="btn btn-success">
                    <i class="fas fa-play"></i> Start Trading
                </button>
                <button id="stop-trading-btn" class="btn btn-danger">
                    <i class="fas fa-stop"></i> Stop Trading
                </button>
                <button id="refresh-portfolio-btn" class="btn btn-secondary">
                    <i class="fas fa-sync-alt"></i> Refresh Portfolio
                </button>
            </div>
        `;

        // Add to sidebar if needed
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            const controlsCard = document.createElement('div');
            controlsCard.className = 'card';
            controlsCard.innerHTML = `
                <div class="card-header">
                    <h3 class="card-title">
                        <i class="fas fa-gamepad"></i>
                        Trading Controls
                    </h3>
                </div>
                <div class="card-content">
                    <div class="trading-controls-grid">
                        <button id="start-trading-btn" class="btn btn-success" onclick="tradingDashboard.startTrading()">
                            <i class="fas fa-play"></i> Start Trading
                        </button>
                        <button id="stop-trading-btn" class="btn btn-danger" onclick="tradingDashboard.stopTrading()">
                            <i class="fas fa-stop"></i> Stop Trading
                        </button>
                        <button id="auto-trading-btn" class="btn btn-warning" onclick="tradingDashboard.toggleAutoTrading()">
                            <i class="fas fa-robot"></i> <span id="auto-trading-text">Enable Auto Trading</span>
                        </button>
                        <button class="btn btn-secondary" onclick="tradingDashboard.refreshPortfolio()">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                        <button class="btn btn-primary" onclick="tradingDashboard.showManualTrading()">
                            <i class="fas fa-exchange-alt"></i> Manual Trade
                        </button>
                    </div>
                    <div id="trading-status-display" class="mt-3">
                        <div class="loading">
                            <div class="spinner"></div>
                            Loading status...
                        </div>
                    </div>
                </div>
            `;
            sidebar.appendChild(controlsCard);
        }

        // Global functions for compatibility
        window.tradingDashboard = this;
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.nav-tab');
        const contents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });
    }

    switchTab(tabName) {
        // Update tab appearance
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Show/hide content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Load tab-specific data
        this.loadTabData(tabName);
    }

    async loadTabData(tabName) {
        switch (tabName) {
            case 'overview':
                await this.loadOverviewData();
                break;
            case 'portfolio':
                await this.loadPortfolioData();
                break;
            case 'trading':
                await this.loadTradingData();
                break;
            case 'bots':
                await this.loadBotsData();
                break;
            case 'strategies':
                await this.loadStrategiesData();
                break;
            case 'history':
                await this.loadHistoryData();
                break;
            case 'analytics':
                await this.loadAnalyticsData();
                break;
        }
    }

    // =================== DATA LOADING (STABLE API CALLS) ===================
    async apiCall(endpoint, options = {}) {
        try {
            const response = await fetch(`/api${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            this.showNotification(`API Error: ${error.message}`, 'error');
            throw error;
        }
    }

    async loadInitialData() {
        try {
            this.showLoading(true);

            // Load data in parallel (stable approach)
            await Promise.all([
                this.loadPortfolio(),
                this.loadTradingStatus(),
                this.loadConfig(),
                this.loadOpportunities()
            ]);

            this.updateHeaderStats();
            this.showLoading(false);

        } catch (error) {
            console.error('Failed to load initial data:', error);
            this.showNotification('Failed to load dashboard data', 'error');
            this.showLoading(false);
        }
    }

    async loadPortfolio() {
        try {
            // Check cache first (stable caching strategy)
            const now = Date.now();
            if (this.cache.portfolio.data && now - this.cache.portfolio.timestamp < this.CACHE_DURATION) {
                this.data.portfolio = this.cache.portfolio.data;
                return;
            }

            const portfolio = await this.apiCall('/portfolio');

            this.data.portfolio = portfolio;
            this.cache.portfolio = { data: portfolio, timestamp: now };

            console.log('📊 Portfolio loaded:', portfolio);

        } catch (error) {
            console.error('Error loading portfolio:', error);
        }
    }

    async loadTradingStatus() {
        try {
            const status = await this.apiCall('/trading/status');
            this.data.status = status;
            this.updateTradingStatusDisplay();
        } catch (error) {
            console.error('Error loading trading status:', error);
        }
    }

    async loadConfig() {
        try {
            const config = await this.apiCall('/settings');
            this.data.config = config.success ? config.data : config;
        } catch (error) {
            console.error('Error loading config:', error);
        }
    }

    async loadOpportunities() {
        try {
            // Check cache first
            const now = Date.now();
            if (this.cache.opportunities.data.length > 0 && now - this.cache.opportunities.timestamp < this.CACHE_DURATION) {
                this.data.opportunities = this.cache.opportunities.data;
                return;
            }

            const opportunities = await this.apiCall('/portfolio/opportunities');

            this.data.opportunities = Array.isArray(opportunities) ? opportunities : [];
            this.cache.opportunities = { data: this.data.opportunities, timestamp: now };

        } catch (error) {
            console.error('Error loading opportunities:', error);
            this.data.opportunities = [];
        }
    }

    // =================== TRADING FUNCTIONS (PRESERVE STABLE) ===================
    async startTrading() {
        try {
            const result = await this.apiCall('/trading/start', { method: 'POST' });
            if (result.success) {
                this.showNotification('Trading daemon started successfully', 'success');
                await this.loadTradingStatus();
            }
        } catch (error) {
            this.showNotification('Failed to start trading daemon', 'error');
        }
    }

    async stopTrading() {
        try {
            const result = await this.apiCall('/trading/stop', { method: 'POST' });
            if (result.success) {
                this.showNotification('Trading daemon stopped successfully', 'success');
                await this.loadTradingStatus();
            }
        } catch (error) {
            this.showNotification('Failed to stop trading daemon', 'error');
        }
    }

    async toggleAutoTrading() {
        try {
            // Get current auto trading status
            const statusResult = await this.apiCall('/trading/status');
            const currentAutoTradingEnabled = statusResult?.autoTrader?.enabled || false;

            // Toggle the state
            const newState = !currentAutoTradingEnabled;

            const result = await this.apiCall('/config/auto-trading', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: newState })
            });

            if (result.success) {
                this.showNotification(result.message, 'success');
                await this.loadTradingStatus();
                this.updateAutoTradingButton(newState);
            }
        } catch (error) {
            this.showNotification('Failed to toggle auto trading', 'error');
        }
    }

    updateAutoTradingButton(enabled) {
        const btn = document.getElementById('auto-trading-btn');
        const text = document.getElementById('auto-trading-text');

        if (btn && text) {
            if (enabled) {
                btn.classList.remove('btn-warning');
                btn.classList.add('btn-success');
                text.textContent = 'Disable Auto Trading';
            } else {
                btn.classList.remove('btn-success');
                btn.classList.add('btn-warning');
                text.textContent = 'Enable Auto Trading';
            }
        }
    }

    async refreshPortfolio() {
        this.cache.portfolio = { data: null, timestamp: 0 }; // Clear cache
        await this.loadPortfolio();
        this.updateHeaderStats();
        this.updateOverviewDisplay();
        this.showNotification('Portfolio refreshed', 'success');
    }

    // =================== UI UPDATES ===================
    updateHeaderStats() {
        if (!this.data.portfolio) return;

        const portfolio = this.data.portfolio;

        // Update header values
        document.getElementById('header-portfolio-value').textContent =
            this.formatCurrency(portfolio.totalValue || 0);

        document.getElementById('header-pnl').textContent =
            this.formatCurrency(portfolio.totalUnrealizedPnL || 0);
        document.getElementById('header-pnl').className =
            `stat-value ${(portfolio.totalUnrealizedPnL || 0) >= 0 ? 'profit-positive' : 'profit-negative'}`;

        document.getElementById('header-sol-balance').textContent =
            `${(portfolio.solBalance || 0).toFixed(4)} SOL`;

        // Update connection status
        this.updateConnectionStatus();
    }

    updateConnectionStatus() {
        const statusEl = document.getElementById('header-connection-status');

        if (this.data.status && this.data.status.wallet) {
            if (this.data.status.wallet.connected) {
                if (this.data.status.wallet.canSign) {
                    statusEl.className = 'status-indicator status-live';
                    statusEl.innerHTML = '<i class="fas fa-circle"></i> LIVE TRADING';
                } else {
                    statusEl.className = 'status-indicator status-connected';
                    statusEl.innerHTML = '<i class="fas fa-circle"></i> READ-ONLY';
                }
            } else {
                statusEl.className = 'status-indicator status-stopped';
                statusEl.innerHTML = '<i class="fas fa-circle"></i> DISCONNECTED';
            }
        }
    }

    updateTradingStatusDisplay() {
        const statusDisplay = document.getElementById('trading-status-display');
        if (!statusDisplay || !this.data.status) return;

        const { daemon, autoTrader } = this.data.status;

        statusDisplay.innerHTML = `
            <div class="status-grid">
                <div class="status-item">
                    <span class="status-label">Daemon</span>
                    <span class="status-indicator ${daemon?.isRunning ? 'status-live' : 'status-stopped'}">
                        <i class="fas fa-circle"></i>
                        ${daemon?.isRunning ? 'Running' : 'Stopped'}
                    </span>
                </div>
                <div class="status-item">
                    <span class="status-label">Auto Trader</span>
                    <span class="status-indicator ${autoTrader?.enabled ? 'status-live' : 'status-stopped'}">
                        <i class="fas fa-circle"></i>
                        ${autoTrader?.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
                <div class="status-item">
                    <span class="status-label">Daily Trades</span>
                    <span class="stat-value">${autoTrader?.dailyTrades || 0} / ${autoTrader?.dailyTradeLimit || 10}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Success Rate</span>
                    <span class="stat-value">${autoTrader?.successRate || 0}%</span>
                </div>
            </div>
        `;

        // Update auto trading button state
        this.updateAutoTradingButton(autoTrader?.enabled || false);
    }

    // =================== OVERVIEW TAB ===================
    async loadOverviewData() {
        this.updateOverviewDisplay();
    }

    updateOverviewDisplay() {
        this.updateTopPositionsTable();
        this.updateQuickStats();
        this.updateBotsStatus();
        this.updateRecentActivity();
        this.updatePortfolioChart();
    }

    updateTopPositionsTable() {
        const tbody = document.getElementById('top-positions-table');
        if (!tbody || !this.data.portfolio) return;

        const positions = this.data.portfolio.positions || [];
        const significantPositions = positions
            .filter(pos => (pos.balanceUiAmount || 0) > 0 &&
                         ((pos.balanceUiAmount || 0) * (pos.currentPrice || 0)) >= 0.01)
            .sort((a, b) => ((b.balanceUiAmount || 0) * (b.currentPrice || 0)) -
                           ((a.balanceUiAmount || 0) * (a.currentPrice || 0)))
            .slice(0, 10);

        if (significantPositions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="loading">
                        No significant positions found
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = significantPositions.map(position => {
            const currentValue = (position.balanceUiAmount || 0) * (position.currentPrice || 0);
            const pnl = position.unrealizedPnL || 0;
            const pnlPercent = position.unrealizedPnLPercent || 0;
            const allocation = this.data.portfolio.totalValue > 0 ?
                (currentValue / this.data.portfolio.totalValue * 100) : 0;

            return `
                <tr>
                    <td>
                        <div class="asset-info">
                            <div class="asset-symbol">${position.tokenInfo?.symbol || 'Unknown'}</div>
                            <div class="asset-name">${position.tokenInfo?.name || 'Unknown Token'}</div>
                        </div>
                    </td>
                    <td>${this.formatNumber(position.balanceUiAmount || 0)}</td>
                    <td>${this.formatCurrency(currentValue)}</td>
                    <td>
                        <span class="${pnlPercent >= 0 ? 'profit-positive' : 'profit-negative'}">
                            ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%
                        </span>
                    </td>
                    <td>
                        <div class="${pnl >= 0 ? 'profit-positive' : 'profit-negative'}">
                            ${this.formatCurrency(pnl)}
                        </div>
                    </td>
                    <td>
                        <div class="allocation-bar">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${Math.min(allocation, 100)}%"></div>
                            </div>
                            <span class="allocation-text">${allocation.toFixed(1)}%</span>
                        </div>
                    </td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="tradingDashboard.quickTrade('${position.mintAddress}')">
                            <i class="fas fa-exchange-alt"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    updateQuickStats() {
        const container = document.getElementById('quick-stats');
        if (!container || !this.data.portfolio) return;

        const portfolio = this.data.portfolio;
        const positions = portfolio.positions || [];

        const profitableCount = positions.filter(p => (p.unrealizedPnLPercent || 0) > 0).length;
        const losingCount = positions.filter(p => (p.unrealizedPnLPercent || 0) < 0).length;
        const totalPositions = positions.filter(p => (p.balanceUiAmount || 0) > 0).length;

        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-icon success">
                        <i class="fas fa-arrow-up"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-value">${profitableCount}</div>
                        <div class="stat-label">Profitable</div>
                    </div>
                </div>

                <div class="stat-item">
                    <div class="stat-icon danger">
                        <i class="fas fa-arrow-down"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-value">${losingCount}</div>
                        <div class="stat-label">Losing</div>
                    </div>
                </div>

                <div class="stat-item">
                    <div class="stat-icon primary">
                        <i class="fas fa-coins"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-value">${totalPositions}</div>
                        <div class="stat-label">Total Positions</div>
                    </div>
                </div>

                <div class="stat-item">
                    <div class="stat-icon warning">
                        <i class="fas fa-percentage"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-value ${(portfolio.totalUnrealizedPnLPercent || 0) >= 0 ? 'profit-positive' : 'profit-negative'}">
                            ${(portfolio.totalUnrealizedPnLPercent || 0).toFixed(2)}%
                        </div>
                        <div class="stat-label">Total P&L</div>
                    </div>
                </div>
            </div>
        `;
    }

    updateBotsStatus() {
        const container = document.getElementById('bots-status');
        if (!container) return;

        // For now, show trading daemon status
        const daemon = this.data.status?.daemon;
        const autoTrader = this.data.status?.autoTrader;

        container.innerHTML = `
            <div class="bots-list">
                <div class="bot-item">
                    <div class="bot-info">
                        <div class="bot-name">Trading Daemon</div>
                        <div class="bot-type">Core System</div>
                    </div>
                    <div class="bot-status">
                        <span class="status-indicator ${daemon?.isRunning ? 'status-live' : 'status-stopped'}">
                            <i class="fas fa-circle"></i>
                            ${daemon?.isRunning ? 'Running' : 'Stopped'}
                        </span>
                    </div>
                </div>

                <div class="bot-item">
                    <div class="bot-info">
                        <div class="bot-name">Auto Trader</div>
                        <div class="bot-type">Strategy Bot</div>
                    </div>
                    <div class="bot-status">
                        <span class="status-indicator ${autoTrader?.enabled ? 'status-live' : 'status-stopped'}">
                            <i class="fas fa-circle"></i>
                            ${autoTrader?.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                </div>
            </div>

            <div class="bot-actions">
                <button class="btn btn-primary btn-sm" onclick="tradingDashboard.switchTab('bots')">
                    <i class="fas fa-cog"></i>
                    Manage Bots
                </button>
            </div>
        `;
    }

    updateRecentActivity() {
        const container = document.getElementById('recent-activity');
        if (!container) return;

        // Mock recent activity for now
        container.innerHTML = `
            <div class="activity-list">
                <div class="activity-item">
                    <div class="activity-icon success">
                        <i class="fas fa-arrow-up"></i>
                    </div>
                    <div class="activity-content">
                        <div class="activity-title">Portfolio loaded</div>
                        <div class="activity-time">Just now</div>
                    </div>
                </div>

                <div class="activity-item">
                    <div class="activity-icon primary">
                        <i class="fas fa-sync-alt"></i>
                    </div>
                    <div class="activity-content">
                        <div class="activity-title">Price update</div>
                        <div class="activity-time">2 minutes ago</div>
                    </div>
                </div>

                <div class="activity-item">
                    <div class="activity-icon warning">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <div class="activity-content">
                        <div class="activity-title">Market analysis</div>
                        <div class="activity-time">5 minutes ago</div>
                    </div>
                </div>
            </div>
        `;
    }

    // =================== CHARTS ===================
    initializeCharts() {
        this.initPortfolioChart();
    }

    initPortfolioChart() {
        const canvas = document.getElementById('portfolioChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // Mock data for now - will be replaced with real historical data
        const mockData = this.generateMockChartData();

        this.charts.portfolio = new Chart(ctx, {
            type: 'line',
            data: {
                labels: mockData.labels,
                datasets: [{
                    label: 'Portfolio Value',
                    data: mockData.values,
                    borderColor: 'rgb(0, 212, 255)',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            callback: function(value) {
                                return '$' + value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
    }

    generateMockChartData() {
        const now = new Date();
        const labels = [];
        const values = [];
        const baseValue = this.data.portfolio?.totalValue || 15.89;

        for (let i = 24; i >= 0; i--) {
            const time = new Date(now.getTime() - i * 60 * 60 * 1000);
            labels.push(time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

            // Generate slight variations around the base value
            const variation = (Math.random() - 0.5) * 2; // +/- 1
            values.push(Math.max(0, baseValue + variation));
        }

        return { labels, values };
    }

    updatePortfolioChart() {
        if (this.charts.portfolio && this.data.portfolio) {
            // Update chart with real data when available
            const mockData = this.generateMockChartData();
            this.charts.portfolio.data.labels = mockData.labels;
            this.charts.portfolio.data.datasets[0].data = mockData.values;
            this.charts.portfolio.update();
        }
    }

    // =================== UTILITY FUNCTIONS ===================
    formatCurrency(value) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 6
        }).format(value || 0);
    }

    formatNumber(value) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 6
        }).format(value || 0);
    }

    formatPercent(value) {
        return `${value >= 0 ? '+' : ''}${(value || 0).toFixed(2)}%`;
    }

    showLoading(show) {
        // Implementation for loading states
        console.log('Loading:', show);
    }

    showNotification(message, type = 'success') {
        const container = document.getElementById('notification-container');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;

        container.appendChild(notification);

        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    // =================== AUTO-REFRESH (STABLE) ===================
    startAutoRefresh() {
        // Use same refresh rate as stable version
        this.updateInterval = setInterval(() => {
            this.refreshData();
        }, 30000); // 30 seconds
    }

    async refreshData() {
        try {
            await Promise.all([
                this.loadTradingStatus(),
                this.loadOpportunities() // Only if cache expired
            ]);

            this.updateHeaderStats();
            this.updateTradingStatusDisplay();

        } catch (error) {
            console.error('Auto-refresh failed:', error);
        }
    }

    async refreshAll() {
        // Clear all caches
        this.cache.portfolio = { data: null, timestamp: 0 };
        this.cache.opportunities = { data: [], timestamp: 0 };

        await this.loadInitialData();
        this.showNotification('Dashboard refreshed', 'success');
    }

    // =================== PLACEHOLDER FUNCTIONS ===================
    async loadPortfolioData() {
        console.log('Loading advanced portfolio data...');
    }

    async loadTradingData() {
        console.log('Loading manual trading interface...');
    }

    async loadBotsData() {
        console.log('Loading trading bots data...');
    }

    async loadStrategiesData() {
        console.log('Loading strategies data...');
    }

    async loadHistoryData() {
        console.log('Loading trading history...');
    }

    async loadAnalyticsData() {
        console.log('Loading analytics data...');
    }

    quickTrade(mintAddress) {
        console.log('Quick trade for:', mintAddress);
        this.showNotification('Quick trade feature coming soon', 'warning');
    }

    showManualTrading() {
        this.switchTab('trading');
    }

    showSettings() {
        this.showNotification('Settings panel coming soon', 'warning');
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new ProfessionalTradingDashboard();
});

// Add CSS for dynamic elements
const additionalStyles = `
    .trading-controls-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
        margin-bottom: 1rem;
    }

    .status-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
    }

    .status-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .status-label {
        font-size: 0.75rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .stats-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1rem;
    }

    .stat-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        background: var(--bg-tertiary);
        border-radius: 8px;
    }

    .stat-icon {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.9rem;
    }

    .stat-icon.success { background: rgba(16, 185, 129, 0.2); color: var(--success); }
    .stat-icon.danger { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
    .stat-icon.primary { background: rgba(0, 212, 255, 0.2); color: var(--accent-blue); }
    .stat-icon.warning { background: rgba(245, 158, 11, 0.2); color: var(--warning); }

    .stat-content {
        flex: 1;
    }

    .bots-list, .activity-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .bot-item, .activity-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem;
        background: var(--bg-tertiary);
        border-radius: 8px;
    }

    .bot-info, .activity-content {
        flex: 1;
    }

    .bot-name, .activity-title {
        font-weight: 500;
        margin-bottom: 0.25rem;
    }

    .bot-type, .activity-time {
        font-size: 0.8rem;
        color: var(--text-muted);
    }

    .activity-icon {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 0.75rem;
        font-size: 0.8rem;
    }

    .bot-actions {
        margin-top: 1rem;
        text-align: center;
    }

    .allocation-bar {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 100px;
    }

    .progress-bar {
        flex: 1;
        height: 6px;
        background: var(--bg-tertiary);
        border-radius: 3px;
        overflow: hidden;
    }

    .allocation-text {
        font-size: 0.8rem;
        color: var(--text-muted);
        min-width: 35px;
    }

    .asset-info {
        display: flex;
        flex-direction: column;
    }

    .asset-symbol {
        font-weight: 600;
        margin-bottom: 0.25rem;
    }

    .asset-name {
        font-size: 0.8rem;
        color: var(--text-muted);
    }

    .btn-sm {
        padding: 0.5rem;
        font-size: 0.8rem;
    }

    .notification-content {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .mt-3 {
        margin-top: 1rem;
    }
`;

// Inject additional styles
const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);