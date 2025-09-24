export { JupiterTrader, SwapQuote, SwapResult } from './jupiter-trader';
export { TradingRuleEngine, TradingRule, RuleExecutionResult } from './trading-rules';
export { TradingConfigManager, TradingSettings, ProfitTarget } from './trading-config';
export { WalletMonitor, TradingOpportunity, MonitoringStats } from './wallet-monitor';
export { AutoTrader, TradeExecution, AutoTradingStats } from './auto-trader';
export { TradingDaemon, DaemonStatus } from './trading-daemon';

import { JupiterTrader } from './jupiter-trader';
import { TradingRuleEngine } from './trading-rules';
import { StrategyManager } from '../automated-strategies';

export class TradingEngine {
  private static instance: TradingEngine;
  private jupiterTrader: JupiterTrader;
  private ruleEngine: TradingRuleEngine;
  private strategyManager: StrategyManager;

  private constructor() {
    this.jupiterTrader = JupiterTrader.getInstance();
    this.ruleEngine = TradingRuleEngine.getInstance();
    this.strategyManager = StrategyManager.getInstance();
  }

  public static getInstance(): TradingEngine {
    if (!TradingEngine.instance) {
      TradingEngine.instance = new TradingEngine();
    }
    return TradingEngine.instance;
  }

  public getJupiterTrader(): JupiterTrader {
    return this.jupiterTrader;
  }

  public getRuleEngine(): TradingRuleEngine {
    return this.ruleEngine;
  }

  public getStrategyManager(): StrategyManager {
    return this.strategyManager;
  }

  public async initialize(): Promise<void> {
    console.log('🏗️ Initializing Trading Engine...');
    console.log('✅ Jupiter Trader ready');
    console.log('✅ Trading Rule Engine ready');
    console.log('✅ Strategy Manager ready');
    console.log('⚠️  All operations are in DRY RUN mode by default');
  }
}