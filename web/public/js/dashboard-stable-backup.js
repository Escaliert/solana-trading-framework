class TradingDashboard {
    constructor() {
        this.portfolio = null;
        this.config = null;
        this.status = null;
        this.opportunities = [];
        this.history = [];
        this.updateInterval = null;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupTabs();
        await this.loadInitialData();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        // Refresh button
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.loadInitialData();
        });

        // Trading controls
        document.getElementById('start-trading').addEventListener('click', () => {
            this.startTrading();
        });

        document.getElementById('stop-trading').addEventListener('click', () => {
            this.stopTrading();
        });

        document.getElementById('auto-trading-toggle').addEventListener('change', (e) => {
            this.toggleAutoTrading(e.target.checked);
        });

        document.getElementById('dry-run-toggle').addEventListener('change', (e) => {
            this.toggleDryRun(e.target.checked);
        });

        // Settings buttons
        document.getElementById('save-profit-settings').addEventListener('click', () => {
            this.saveProfitSettings();
        });

        document.getElementById('save-risk-settings').addEventListener('click', () => {
            this.saveRiskSettings();
        });
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.nav-tab');
        const contents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.getAttribute('data-tab');

                // Update tab appearance
                tabs.forEach(t => {
                    t.classList.remove('active', 'text-blue-600', 'border-blue-600');
                    t.classList.add('text-gray-500', 'hover:text-gray-700');
                });
                tab.classList.add('active', 'text-blue-600', 'border-blue-600');
                tab.classList.remove('text-gray-500', 'hover:text-gray-700');

                // Show/hide content
                contents.forEach(content => {
                    content.classList.add('hidden');
                });
                document.getElementById(`${tabName}-tab`).classList.remove('hidden');

                // Load specific tab data
                if (tabName === 'history') {
                    this.loadTradeHistory();
                }
            });
        });
    }

    async loadInitialData() {
        this.showLoading();
        try {
            await Promise.all([
                this.loadPortfolio(),
                this.loadConfig(),
                this.loadStatus(),
                this.loadOpportunities()
            ]);
            this.hideLoading();
        } catch (error) {
            this.showError('Failed to load dashboard data: ' + error.message);
            this.hideLoading();
        }
    }

    async apiCall(endpoint, options = {}) {
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

        return response.json();
    }

    async loadPortfolio() {
        try {
            this.portfolio = await this.apiCall('/portfolio');
            this.updatePortfolioDisplay();
        } catch (error) {
            console.error('Error loading portfolio:', error);
        }
    }

    async loadStatus() {
        try {
            this.status = await this.apiCall('/trading/status');
            this.updateStatusDisplay();
        } catch (error) {
            console.error('Error loading status:', error);
        }
    }

    async loadConfig() {
        try {
            this.config = await this.apiCall('/config');
            this.updateConfigDisplay();
        } catch (error) {
            console.error('Error loading config:', error);
        }
    }

    async loadOpportunities() {
        try {
            this.opportunities = await this.apiCall('/portfolio/opportunities');
            this.updateOpportunitiesDisplay();
        } catch (error) {
            console.error('Error loading opportunities:', error);
        }
    }

    async loadTradeHistory() {
        try {
            this.history = await this.apiCall('/trading/history');
            this.updateHistoryDisplay();
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    updatePortfolioDisplay() {
        if (!this.portfolio) return;

        // Update summary cards
        document.getElementById('total-value').textContent =
            this.formatCurrency(this.portfolio.totalValue || 0);

        const totalPnL = this.portfolio.totalUnrealizedPnL || 0;
        const totalPnLPercent = this.portfolio.totalUnrealizedPnLPercent || 0;

        const pnlElement = document.getElementById('total-pnl');
        const pnlPercentElement = document.getElementById('total-pnl-percent');

        pnlElement.textContent = this.formatCurrency(totalPnL);
        pnlPercentElement.textContent = this.formatPercent(totalPnLPercent);

        // Apply color classes
        const isPositive = totalPnL >= 0;
        pnlElement.className = `text-2xl font-bold ${isPositive ? 'profit-positive' : 'profit-negative'}`;
        pnlPercentElement.className = `text-sm ${isPositive ? 'profit-positive' : 'profit-negative'}`;

        document.getElementById('position-count').textContent =
            (this.portfolio.positions || []).length;

        // Update portfolio table
        this.updatePortfolioTable();
    }

    updatePortfolioTable() {
        const tbody = document.getElementById('portfolio-table');
        if (!this.portfolio || !this.portfolio.positions) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-gray-500">No positions found</td></tr>';
            return;
        }

        tbody.innerHTML = this.portfolio.positions.map(position => {
            const currentValue = position.currentPrice ? (position.balanceUiAmount * position.currentPrice) : 0;
            const pnl = position.unrealizedPnL || 0;
            const pnlPercent = position.unrealizedPnLPercent || 0;
            const isPositive = pnl >= 0;

            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div>
                                <div class="text-sm font-medium text-gray-900">${position.tokenInfo.symbol}</div>
                                <div class="text-sm text-gray-500">${position.tokenInfo.name}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm text-gray-900">${this.formatNumber(position.balanceUiAmount)}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm text-gray-900">${position.currentPrice ? this.formatCurrency(position.currentPrice) : 'N/A'}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm text-gray-900">${this.formatCurrency(currentValue)}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm text-gray-900">${position.entryPrice ? this.formatCurrency(position.entryPrice) : 'N/A'}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm ${isPositive ? 'profit-positive' : 'profit-negative'}">
                            ${this.formatCurrency(pnl)}<br>
                            <span class="text-xs">${this.formatPercent(pnlPercent)}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        ${currentValue > 1 ? `<button onclick="dashboard.executeTrade('${position.mintAddress}')" class="text-blue-600 hover:text-blue-900">Trade</button>` : '<span class="text-gray-400">-</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    updateStatusDisplay() {
        if (!this.status) return;

        // Connection status
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');

        if (this.status.wallet && this.status.wallet.connected) {
            statusDot.className = `w-3 h-3 rounded-full ${this.status.wallet.canSign ? 'bg-red-500' : 'bg-yellow-500'}`;
            statusText.textContent = this.status.wallet.canSign ? 'LIVE TRADING' : 'READ-ONLY';
            statusText.className = `text-white text-sm ${this.status.wallet.canSign ? 'status-live' : 'status-readonly'}`;
        } else {
            statusDot.className = 'w-3 h-3 rounded-full bg-red-500';
            statusText.textContent = 'DISCONNECTED';
            statusText.className = 'text-white text-sm text-red-300';
        }

        // Daemon status
        document.getElementById('daemon-status').textContent =
            this.status.daemon && this.status.daemon.isRunning ? 'Running' : 'Stopped';

        // Auto trader status
        document.getElementById('auto-trader-status').textContent =
            this.status.autoTrader && this.status.autoTrader.enabled ? 'Enabled' : 'Disabled';

        // Update toggles
        const autoTradingToggle = document.getElementById('auto-trading-toggle');
        const dryRunToggle = document.getElementById('dry-run-toggle');

        if (this.status.autoTrader) {
            autoTradingToggle.checked = this.status.autoTrader.enabled;
            this.updateToggleAppearance(autoTradingToggle);
        }

        if (this.config && this.config.execution) {
            dryRunToggle.checked = this.config.execution.dryRun;
            this.updateToggleAppearance(dryRunToggle);
        }

        // Quick stats
        if (this.status.autoTrader) {
            document.getElementById('opportunities-count').textContent = this.opportunities.length;
            document.getElementById('todays-trades').textContent = this.status.autoTrader.dailyTrades || 0;
            const successRate = this.status.autoTrader.successRate || 0;
            document.getElementById('success-rate').textContent = this.formatPercent(successRate);
        }
    }

    updateConfigDisplay() {
        if (!this.config) return;

        // Profit targets
        const profitTargetsContainer = document.getElementById('profit-targets');
        if (this.config.profitTaking && this.config.profitTaking.targets) {
            profitTargetsContainer.innerHTML = this.config.profitTaking.targets.map((target, index) => `
                <div class="border rounded-lg p-4">
                    <div class="flex items-center justify-between mb-2">
                        <label class="text-sm font-medium text-gray-700">${target.name}</label>
                        <input type="checkbox" ${this.config.profitTaking.enabled ? 'checked' : ''}
                               data-target-index="${index}" class="profit-target-enabled">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="text-xs text-gray-500">Trigger %</label>
                            <input type="number" value="${target.triggerPercent}"
                                   data-target-index="${index}" data-field="triggerPercent"
                                   class="profit-target-input mt-1 block w-full text-sm rounded border-gray-300">
                        </div>
                        <div>
                            <label class="text-xs text-gray-500">Sell %</label>
                            <input type="number" value="${target.sellPercent}"
                                   data-target-index="${index}" data-field="sellPercent"
                                   class="profit-target-input mt-1 block w-full text-sm rounded border-gray-300">
                        </div>
                    </div>
                </div>
            `).join('');
        }

        // Risk settings
        if (this.config.execution) {
            document.getElementById('slippage-tolerance').value = this.config.execution.slippagePercent || 1;
            document.getElementById('max-price-impact').value = this.config.execution.maxPriceImpactPercent || 5;
        }

        if (this.config.riskManagement) {
            document.getElementById('max-daily-trades').value = this.config.riskManagement.maxDailyTrades || 10;
        }
    }

    updateOpportunitiesDisplay() {
        const container = document.getElementById('opportunities-list');

        if (this.opportunities.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center">No trading opportunities available</p>';
            return;
        }

        container.innerHTML = this.opportunities.map(opportunity => {
            const isPositive = opportunity.currentProfitPercent >= 0;
            return `
                <div class="border rounded-lg p-4 mb-4 hover:shadow-md transition-shadow">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h4 class="font-semibold text-lg">${opportunity.token.tokenInfo.symbol}</h4>
                            <p class="text-sm text-gray-600">${opportunity.token.tokenInfo.name}</p>
                        </div>
                        <div class="text-right">
                            <div class="text-lg font-bold ${isPositive ? 'profit-positive' : 'profit-negative'}">
                                ${this.formatPercent(opportunity.currentProfitPercent)}
                            </div>
                            <div class="text-sm text-gray-600">
                                Sell ${opportunity.recommendedSellPercent}%
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                            <span class="text-gray-600">Entry:</span><br>
                            <span class="font-semibold">${this.formatCurrency(opportunity.token.entryPrice || 0)}</span>
                        </div>
                        <div>
                            <span class="text-gray-600">Current:</span><br>
                            <span class="font-semibold">${this.formatCurrency(opportunity.token.currentPrice || 0)}</span>
                        </div>
                        <div>
                            <span class="text-gray-600">Balance:</span><br>
                            <span class="font-semibold">${this.formatNumber(opportunity.token.balanceUiAmount)}</span>
                        </div>
                        <div>
                            <span class="text-gray-600">Value:</span><br>
                            <span class="font-semibold">${this.formatCurrency((opportunity.token.balanceUiAmount * (opportunity.token.currentPrice || 0)))}</span>
                        </div>
                    </div>

                    <div class="flex justify-end mt-4 space-x-2">
                        <button onclick="dashboard.executeTrade('${opportunity.token.mintAddress}', ${opportunity.recommendedSellPercent})"
                                class="btn-primary">
                            <i class="fas fa-exchange-alt mr-2"></i>Execute Trade
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateHistoryDisplay() {
        const container = document.getElementById('trade-history');

        if (this.history.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center">No trade history available</p>';
            return;
        }

        container.innerHTML = `
            <div class="overflow-x-auto">
                <table class="min-w-full">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Token</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${this.history.map(trade => `
                            <tr>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    ${new Date(trade.timestamp).toLocaleString()}
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    ${trade.tokenSymbol || 'Unknown'}
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    ${trade.action || 'Trade'}
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    ${this.formatNumber(trade.amount || 0)}
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    ${this.formatCurrency(trade.price || 0)}
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <span class="px-2 py-1 text-xs rounded-full ${
                                        trade.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                    }">
                                        ${trade.success ? 'Success' : 'Failed'}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async startTrading() {
        try {
            await this.apiCall('/trading/start', { method: 'POST' });
            this.showSuccess('Trading daemon started successfully');
            this.loadStatus();
        } catch (error) {
            this.showError('Failed to start trading: ' + error.message);
        }
    }

    async stopTrading() {
        try {
            await this.apiCall('/trading/stop', { method: 'POST' });
            this.showSuccess('Trading daemon stopped successfully');
            this.loadStatus();
        } catch (error) {
            this.showError('Failed to stop trading: ' + error.message);
        }
    }

    async toggleAutoTrading(enabled) {
        try {
            // For now, auto trading is controlled through the daemon start/stop
            if (enabled) {
                await this.startTrading();
            } else {
                await this.stopTrading();
            }
            this.updateToggleAppearance(document.getElementById('auto-trading-toggle'));
        } catch (error) {
            this.showError('Failed to toggle auto trading: ' + error.message);
        }
    }

    async toggleDryRun(enabled) {
        try {
            await this.apiCall('/config/dry-run', {
                method: 'POST',
                body: JSON.stringify({ enabled })
            });
            this.showSuccess(`Dry run mode ${enabled ? 'enabled' : 'disabled'}`);
            this.updateToggleAppearance(document.getElementById('dry-run-toggle'));
        } catch (error) {
            this.showError('Failed to toggle dry run: ' + error.message);
        }
    }

    async executeTrade(tokenMint, sellPercent = null) {
        if (!confirm(`Are you sure you want to execute this trade?${sellPercent ? ` (Sell ${sellPercent}%)` : ''}`)) {
            return;
        }

        try {
            const body = sellPercent ? { sellPercent } : {};
            const result = await this.apiCall(`/trading/execute/${tokenMint}`, {
                method: 'POST',
                body: JSON.stringify(body)
            });

            this.showSuccess('Trade executed successfully');
            this.loadPortfolio();
            this.loadOpportunities();
        } catch (error) {
            this.showError('Failed to execute trade: ' + error.message);
        }
    }

    async saveProfitSettings() {
        try {
            // Collect profit target settings
            const targets = [];
            document.querySelectorAll('.profit-target-input').forEach((input, i) => {
                const targetIndex = parseInt(input.dataset.targetIndex);
                const field = input.dataset.field;

                if (!targets[targetIndex]) {
                    targets[targetIndex] = { ...this.config.profitTaking.targets[targetIndex] };
                }
                targets[targetIndex][field] = parseFloat(input.value);
            });

            const updatedConfig = {
                ...this.config,
                profitTaking: {
                    ...this.config.profitTaking,
                    targets: targets
                }
            };

            await this.apiCall('/config', {
                method: 'POST',
                body: JSON.stringify(updatedConfig)
            });

            this.showSuccess('Profit settings saved successfully');
            this.loadConfig();
        } catch (error) {
            this.showError('Failed to save profit settings: ' + error.message);
        }
    }

    async saveRiskSettings() {
        try {
            const updatedConfig = {
                ...this.config,
                execution: {
                    ...this.config.execution,
                    slippagePercent: parseFloat(document.getElementById('slippage-tolerance').value),
                    maxPriceImpactPercent: parseFloat(document.getElementById('max-price-impact').value)
                },
                riskManagement: {
                    ...this.config.riskManagement,
                    maxDailyTrades: parseInt(document.getElementById('max-daily-trades').value)
                }
            };

            await this.apiCall('/config', {
                method: 'POST',
                body: JSON.stringify(updatedConfig)
            });

            this.showSuccess('Risk settings saved successfully');
            this.loadConfig();
        } catch (error) {
            this.showError('Failed to save risk settings: ' + error.message);
        }
    }

    updateToggleAppearance(toggle) {
        const container = toggle.parentElement.querySelector('div');
        const dot = container.querySelector('.dot');

        if (toggle.checked) {
            container.classList.remove('bg-gray-600');
            container.classList.add('bg-blue-600');
            dot.style.transform = 'translateX(1.5rem)';
        } else {
            container.classList.remove('bg-blue-600');
            container.classList.add('bg-gray-600');
            dot.style.transform = 'translateX(0)';
        }
    }

    startAutoRefresh() {
        // Refresh every 30 seconds
        this.updateInterval = setInterval(() => {
            this.loadPortfolio();
            this.loadStatus();
            this.loadOpportunities();
        }, 30000);
    }

    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.add('hidden');
        });
    }

    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('portfolio-tab').classList.remove('hidden');
    }

    showError(message) {
        const errorDiv = document.getElementById('error');
        document.getElementById('error-message').textContent = message;
        errorDiv.classList.remove('hidden');

        setTimeout(() => {
            errorDiv.classList.add('hidden');
        }, 5000);
    }

    showSuccess(message) {
        // Create success notification
        const successDiv = document.createElement('div');
        successDiv.className = 'fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded z-50';
        successDiv.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-check-circle mr-2"></i>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(successDiv);

        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    }

    formatCurrency(value) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 8
        }).format(value);
    }

    formatPercent(value) {
        return new Intl.NumberFormat('en-US', {
            style: 'percent',
            minimumFractionDigits: 1,
            maximumFractionDigits: 2
        }).format(value / 100);
    }

    formatNumber(value) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 6
        }).format(value);
    }
}

// Initialize dashboard when page loads
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new TradingDashboard();
});