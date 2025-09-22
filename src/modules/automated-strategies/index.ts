export { StrategyBase, StrategyConfig, StrategyExecution, StrategyMetrics } from './strategy-base';
export { DCAStrategy, DCAConfig } from './dca-strategy';
export { GridStrategy, GridConfig, GridLevel } from './grid-strategy';
export { RebalanceStrategy, RebalanceConfig, AllocationTarget, RebalanceAction } from './rebalance-strategy';
export { StrategyManager, StrategyType, StrategyInfo } from './strategy-manager';
export { BacktestEngine, BacktestConfig, BacktestResult, BacktestData, BacktestPerformance } from './backtesting';

// Re-export for convenience
export type AutomatedStrategyConfig = import('./dca-strategy').DCAConfig |
                                     import('./grid-strategy').GridConfig |
                                     import('./rebalance-strategy').RebalanceConfig;