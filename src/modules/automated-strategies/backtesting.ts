import { StrategyBase, StrategyMetrics } from './strategy-base';

export interface BacktestData {
  timestamp: Date;
  price: number;
  volume?: number;
}

export interface BacktestConfig {
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  dataSource: BacktestData[];
}

export interface BacktestResult {
  strategy: string;
  config: BacktestConfig;
  metrics: StrategyMetrics;
  trades: BacktestTrade[];
  performance: BacktestPerformance;
}

export interface BacktestTrade {
  timestamp: Date;
  action: 'buy' | 'sell';
  amount: number;
  price: number;
  balance: number;
  portfolioValue: number;
}

export interface BacktestPerformance {
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  profitFactor: number;
  volatility: number;
  finalBalance: number;
}

export class BacktestEngine {
  private static instance: BacktestEngine;

  private constructor() {}

  public static getInstance(): BacktestEngine {
    if (!BacktestEngine.instance) {
      BacktestEngine.instance = new BacktestEngine();
    }
    return BacktestEngine.instance;
  }

  public async runBacktest(
    strategy: StrategyBase,
    config: BacktestConfig
  ): Promise<BacktestResult> {
    console.log(`🧪 Starting backtest for strategy: ${strategy.getConfig().name}`);
    console.log(`📅 Period: ${config.startDate.toISOString().split('T')[0]} to ${config.endDate.toISOString().split('T')[0]}`);
    console.log(`💰 Initial Balance: $${config.initialBalance}`);

    const trades: BacktestTrade[] = [];
    let currentBalance = config.initialBalance;
    let currentPosition = 0;
    let maxDrawdown = 0;
    let peakValue = config.initialBalance;

    // Simulate strategy execution over historical data
    for (const dataPoint of config.dataSource) {
      if (dataPoint.timestamp < config.startDate || dataPoint.timestamp > config.endDate) {
        continue;
      }

      // Mock strategy execution based on historical price
      const shouldTrade = this.simulateStrategyDecision(strategy, dataPoint, currentBalance, currentPosition);

      if (shouldTrade) {
        const trade = this.executeTrade(shouldTrade, dataPoint, currentBalance, currentPosition);
        trades.push(trade);

        // Update balance and position
        if (trade.action === 'buy') {
          currentBalance -= trade.amount * trade.price;
          currentPosition += trade.amount;
        } else {
          currentBalance += trade.amount * trade.price;
          currentPosition -= trade.amount;
        }

        // Calculate portfolio value and drawdown
        const portfolioValue = currentBalance + (currentPosition * dataPoint.price);
        trade.balance = currentBalance;
        trade.portfolioValue = portfolioValue;

        if (portfolioValue > peakValue) {
          peakValue = portfolioValue;
        } else {
          const drawdown = (peakValue - portfolioValue) / peakValue;
          if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
          }
        }
      }
    }

    // Calculate final performance metrics
    const finalPortfolioValue = currentBalance + (currentPosition * config.dataSource[config.dataSource.length - 1].price);
    const performance = this.calculatePerformance(trades, config.initialBalance, finalPortfolioValue, config);

    const result: BacktestResult = {
      strategy: strategy.getConfig().name,
      config,
      metrics: strategy.getMetrics(),
      trades,
      performance,
    };

    console.log(`✅ Backtest completed`);
    console.log(`📊 Final Value: $${finalPortfolioValue.toFixed(2)}`);
    console.log(`📈 Total Return: ${performance.totalReturnPercent.toFixed(2)}%`);
    console.log(`📉 Max Drawdown: ${(performance.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`🎯 Win Rate: ${(performance.winRate * 100).toFixed(2)}%`);

    return result;
  }

  private simulateStrategyDecision(
    strategy: StrategyBase,
    dataPoint: BacktestData,
    balance: number,
    position: number
  ): { action: 'buy' | 'sell'; amount: number } | null {
    // This is a simplified simulation
    // In a real implementation, you would need to mock the strategy's decision logic

    const strategyType = strategy.getStrategyType();
    const random = Math.random();

    switch (strategyType) {
      case 'DCA':
        // DCA buys regularly regardless of price
        if (random < 0.1 && balance > 100) { // 10% chance to buy if sufficient balance
          return { action: 'buy', amount: Math.min(balance * 0.1, 100) / dataPoint.price };
        }
        break;

      case 'GRID':
        // Grid trading buys low, sells high
        if (random < 0.05) { // 5% chance of trade
          if (position > 0 && random < 0.5) {
            return { action: 'sell', amount: position * 0.2 }; // Sell 20% of position
          } else if (balance > 50) {
            return { action: 'buy', amount: (balance * 0.1) / dataPoint.price }; // Buy with 10% of balance
          }
        }
        break;

      case 'REBALANCE':
        // Rebalancing occurs less frequently
        if (random < 0.02) { // 2% chance of rebalance
          const targetValue = (balance + position * dataPoint.price) * 0.5;
          const currentPositionValue = position * dataPoint.price;

          if (currentPositionValue > targetValue * 1.1) {
            return { action: 'sell', amount: (currentPositionValue - targetValue) / dataPoint.price };
          } else if (currentPositionValue < targetValue * 0.9 && balance > 50) {
            return { action: 'buy', amount: Math.min(targetValue - currentPositionValue, balance) / dataPoint.price };
          }
        }
        break;
    }

    return null;
  }

  private executeTrade(
    decision: { action: 'buy' | 'sell'; amount: number },
    dataPoint: BacktestData,
    balance: number,
    position: number
  ): BacktestTrade {
    return {
      timestamp: dataPoint.timestamp,
      action: decision.action,
      amount: decision.amount,
      price: dataPoint.price,
      balance: balance,
      portfolioValue: balance + (position * dataPoint.price),
    };
  }

  private calculatePerformance(
    trades: BacktestTrade[],
    initialBalance: number,
    finalValue: number,
    config: BacktestConfig
  ): BacktestPerformance {
    const totalReturn = finalValue - initialBalance;
    const totalReturnPercent = (totalReturn / initialBalance) * 100;

    // Calculate time period in years
    const timeDiff = config.endDate.getTime() - config.startDate.getTime();
    const years = timeDiff / (365.25 * 24 * 60 * 60 * 1000);
    const annualizedReturn = years > 0 ? (Math.pow(finalValue / initialBalance, 1 / years) - 1) * 100 : 0;

    // Calculate win rate
    const profitableTrades = this.calculateProfitableTrades(trades);
    const winRate = trades.length > 0 ? profitableTrades / trades.length : 0;

    // Calculate profit factor (gross profit / gross loss)
    const { grossProfit, grossLoss } = this.calculateProfitLoss(trades);
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Calculate volatility (simplified)
    const returns = this.calculateReturns(trades);
    const volatility = this.calculateStandardDeviation(returns) * Math.sqrt(252); // Annualized

    // Simplified Sharpe ratio (assuming 0% risk-free rate)
    const sharpeRatio = volatility > 0 ? annualizedReturn / volatility : 0;

    // Calculate max drawdown
    const maxDrawdown = this.calculateMaxDrawdown(trades, initialBalance);

    return {
      totalReturn,
      totalReturnPercent,
      annualizedReturn,
      maxDrawdown,
      sharpeRatio,
      winRate,
      profitFactor,
      volatility,
      finalBalance: finalValue,
    };
  }

  private calculateProfitableTrades(trades: BacktestTrade[]): number {
    let profitableTrades = 0;
    let lastBuyPrice = 0;

    for (const trade of trades) {
      if (trade.action === 'buy') {
        lastBuyPrice = trade.price;
      } else if (trade.action === 'sell' && lastBuyPrice > 0) {
        if (trade.price > lastBuyPrice) {
          profitableTrades++;
        }
      }
    }

    return profitableTrades;
  }

  private calculateProfitLoss(trades: BacktestTrade[]): { grossProfit: number; grossLoss: number } {
    let grossProfit = 0;
    let grossLoss = 0;
    let lastBuyPrice = 0;

    for (const trade of trades) {
      if (trade.action === 'buy') {
        lastBuyPrice = trade.price;
      } else if (trade.action === 'sell' && lastBuyPrice > 0) {
        const pnl = (trade.price - lastBuyPrice) * trade.amount;
        if (pnl > 0) {
          grossProfit += pnl;
        } else {
          grossLoss += Math.abs(pnl);
        }
      }
    }

    return { grossProfit, grossLoss };
  }

  private calculateReturns(trades: BacktestTrade[]): number[] {
    const returns: number[] = [];

    for (let i = 1; i < trades.length; i++) {
      const currentValue = trades[i].portfolioValue;
      const previousValue = trades[i - 1].portfolioValue;

      if (previousValue > 0) {
        returns.push((currentValue - previousValue) / previousValue);
      }
    }

    return returns;
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

    return Math.sqrt(variance);
  }

  private calculateMaxDrawdown(trades: BacktestTrade[], initialBalance: number): number {
    let maxDrawdown = 0;
    let peak = initialBalance;

    for (const trade of trades) {
      if (trade.portfolioValue > peak) {
        peak = trade.portfolioValue;
      } else {
        const drawdown = (peak - trade.portfolioValue) / peak;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    }

    return maxDrawdown;
  }

  public generateSampleData(days: number, startPrice: number = 100): BacktestData[] {
    const data: BacktestData[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let currentPrice = startPrice;

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      // Generate random price movement (simplified random walk)
      const change = (Math.random() - 0.5) * 0.1; // ±5% max daily change
      currentPrice *= (1 + change);

      data.push({
        timestamp: date,
        price: Math.max(currentPrice, 0.01), // Prevent negative prices
        volume: Math.random() * 1000000, // Random volume
      });
    }

    return data;
  }
}