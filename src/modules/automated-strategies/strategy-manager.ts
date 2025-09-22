import { PublicKey } from '@solana/web3.js';
import { StrategyBase } from './strategy-base';
import { DCAStrategy, DCAConfig } from './dca-strategy';
import { GridStrategy, GridConfig } from './grid-strategy';
import { RebalanceStrategy, RebalanceConfig } from './rebalance-strategy';

export type StrategyType = 'DCA' | 'GRID' | 'REBALANCE';

export interface StrategyInfo {
  id: string;
  type: StrategyType;
  name: string;
  enabled: boolean;
  dryRun: boolean;
  lastExecution?: Date | undefined;
  executionCount: number;
  status: 'idle' | 'running' | 'error' | 'stopped';
}

export class StrategyManager {
  private static instance: StrategyManager;
  private strategies: Map<string, StrategyBase> = new Map();
  private executionTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private executionInterval: number = 60000; // 1 minute

  private constructor() {}

  public static getInstance(): StrategyManager {
    if (!StrategyManager.instance) {
      StrategyManager.instance = new StrategyManager();
    }
    return StrategyManager.instance;
  }

  public createDCAStrategy(config: DCAConfig, userPublicKey: PublicKey): string {
    const strategy = new DCAStrategy(config, userPublicKey);
    this.strategies.set(config.id, strategy);
    console.log(`✅ DCA Strategy created: ${config.name}`);
    return config.id;
  }

  public createGridStrategy(config: GridConfig, userPublicKey: PublicKey): string {
    const strategy = new GridStrategy(config, userPublicKey);
    this.strategies.set(config.id, strategy);
    console.log(`✅ Grid Strategy created: ${config.name}`);
    return config.id;
  }

  public createRebalanceStrategy(config: RebalanceConfig, userPublicKey: PublicKey): string {
    const strategy = new RebalanceStrategy(config, userPublicKey);
    this.strategies.set(config.id, strategy);
    console.log(`✅ Rebalance Strategy created: ${config.name}`);
    return config.id;
  }

  public getStrategy(id: string): StrategyBase | undefined {
    return this.strategies.get(id);
  }

  public getAllStrategies(): StrategyBase[] {
    return Array.from(this.strategies.values());
  }

  public getStrategyInfo(id: string): StrategyInfo | undefined {
    const strategy = this.strategies.get(id);
    if (!strategy) return undefined;

    const config = strategy.getConfig();
    return {
      id: config.id,
      type: strategy.getStrategyType() as StrategyType,
      name: config.name,
      enabled: config.enabled,
      dryRun: config.dryRun,
      lastExecution: config.lastExecution,
      executionCount: config.executionCount,
      status: this.getStrategyStatus(strategy),
    };
  }

  public getAllStrategyInfo(): StrategyInfo[] {
    return Array.from(this.strategies.keys()).map(id => this.getStrategyInfo(id)!);
  }

  private getStrategyStatus(strategy: StrategyBase): 'idle' | 'running' | 'error' | 'stopped' {
    const config = strategy.getConfig();
    if (!config.enabled) return 'stopped';
    return 'idle'; // In a real implementation, you'd track running state
  }

  public enableStrategy(id: string): boolean {
    const strategy = this.strategies.get(id);
    if (!strategy) return false;

    strategy.setEnabled(true);
    console.log(`✅ Strategy enabled: ${strategy.getConfig().name}`);
    return true;
  }

  public disableStrategy(id: string): boolean {
    const strategy = this.strategies.get(id);
    if (!strategy) return false;

    strategy.setEnabled(false);
    console.log(`⏸️ Strategy disabled: ${strategy.getConfig().name}`);
    return true;
  }

  public setStrategyDryRun(id: string, dryRun: boolean): boolean {
    const strategy = this.strategies.get(id);
    if (!strategy) return false;

    strategy.setDryRun(dryRun);
    console.log(`${dryRun ? '🧪' : '🔴'} Strategy ${dryRun ? 'dry run enabled' : 'live mode enabled'}: ${strategy.getConfig().name}`);
    return true;
  }

  public removeStrategy(id: string): boolean {
    const strategy = this.strategies.get(id);
    if (!strategy) return false;

    strategy.setEnabled(false);
    this.strategies.delete(id);
    console.log(`🗑️ Strategy removed: ${strategy.getConfig().name}`);
    return true;
  }

  public async executeStrategy(id: string): Promise<boolean> {
    const strategy = this.strategies.get(id);
    if (!strategy) {
      console.error(`❌ Strategy not found: ${id}`);
      return false;
    }

    if (!strategy.isEnabled()) {
      console.log(`⏸️ Strategy disabled: ${strategy.getConfig().name}`);
      return false;
    }

    try {
      console.log(`🔄 Executing strategy: ${strategy.getConfig().name}`);
      return await strategy.execute();
    } catch (error) {
      console.error(`❌ Strategy execution failed: ${strategy.getConfig().name}`, error);
      return false;
    }
  }

  public async executeAllStrategies(): Promise<number> {
    const enabledStrategies = Array.from(this.strategies.values()).filter(s => s.isEnabled());
    let successCount = 0;

    console.log(`🔄 Executing ${enabledStrategies.length} enabled strategies...`);

    for (const strategy of enabledStrategies) {
      try {
        if (await strategy.execute()) {
          successCount++;
        }
      } catch (error) {
        console.error(`❌ Strategy execution error: ${strategy.getConfig().name}`, error);
      }
    }

    console.log(`✅ Strategy execution cycle complete: ${successCount}/${enabledStrategies.length} successful`);
    return successCount;
  }

  public startAutomation(intervalMs: number = 60000): void {
    if (this.isRunning) {
      console.log('⚠️ Strategy automation already running');
      return;
    }

    this.executionInterval = intervalMs;
    this.isRunning = true;

    console.log(`🚀 Starting strategy automation (${intervalMs / 1000}s intervals)`);

    this.executionTimer = setInterval(async () => {
      try {
        await this.executeAllStrategies();
      } catch (error) {
        console.error('❌ Strategy automation error:', error);
      }
    }, intervalMs);
  }

  public stopAutomation(): void {
    if (!this.isRunning) {
      console.log('⚠️ Strategy automation not running');
      return;
    }

    if (this.executionTimer) {
      clearInterval(this.executionTimer);
      this.executionTimer = null;
    }

    this.isRunning = false;
    console.log('⏹️ Strategy automation stopped');
  }

  public isAutomationRunning(): boolean {
    return this.isRunning;
  }

  public getAutomationInterval(): number {
    return this.executionInterval;
  }

  public setAutomationInterval(intervalMs: number): void {
    this.executionInterval = intervalMs;

    if (this.isRunning) {
      this.stopAutomation();
      this.startAutomation(intervalMs);
    }
  }

  public getStrategyMetrics(id: string) {
    const strategy = this.strategies.get(id);
    return strategy ? strategy.getMetrics() : null;
  }

  public validateStrategyConfig(type: StrategyType, config: any): boolean {
    try {
      // Create temporary strategy to validate
      const dummyKey = new PublicKey('11111111111111111111111111111111');

      switch (type) {
        case 'DCA':
          const dcaStrategy = new DCAStrategy(config as DCAConfig, dummyKey);
          return dcaStrategy.validateConfig();

        case 'GRID':
          const gridStrategy = new GridStrategy(config as GridConfig, dummyKey);
          return gridStrategy.validateConfig();

        case 'REBALANCE':
          const rebalanceStrategy = new RebalanceStrategy(config as RebalanceConfig, dummyKey);
          return rebalanceStrategy.validateConfig();

        default:
          return false;
      }
    } catch (error) {
      console.error('Strategy config validation error:', error);
      return false;
    }
  }

  public exportStrategies(): any[] {
    return Array.from(this.strategies.values()).map(strategy => ({
      config: strategy.getConfig(),
      type: strategy.getStrategyType(),
      metrics: strategy.getMetrics(),
      executions: strategy.getExecutions(),
    }));
  }

  public getExecutionSummary() {
    const strategies = this.getAllStrategies();
    const totalStrategies = strategies.length;
    const enabledStrategies = strategies.filter(s => s.isEnabled()).length;
    const totalExecutions = strategies.reduce((sum, s) => sum + s.getConfig().executionCount, 0);

    return {
      totalStrategies,
      enabledStrategies,
      disabledStrategies: totalStrategies - enabledStrategies,
      totalExecutions,
      automationRunning: this.isRunning,
      executionInterval: this.executionInterval,
    };
  }
}