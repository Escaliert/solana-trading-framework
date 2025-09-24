import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface TradingSettings {
  // Profit taking settings
  profitTaking: {
    enabled: boolean;
    targets: ProfitTarget[];
    stopLoss?: {
      enabled: boolean;
      percentage: number; // -20% = stop loss at 20% loss
    };
  };

  // Position sizing and risk management
  riskManagement: {
    maxPositionSizePercent: number; // Max % of portfolio per position
    maxDailyTrades: number;
    requireMinimumProfit: number; // Minimum profit % before considering sale
  };

  // Monitoring settings
  monitoring: {
    checkIntervalMs: number; // How often to check for trading opportunities
    priceUpdateIntervalMs: number; // How often to update prices
    enableNotifications: boolean;
  };

  // Trading execution settings
  execution: {
    dryRun: boolean; // If true, only simulate trades
    slippagePercent: number;
    maxPriceImpactPercent: number;
    retryAttempts: number;
  };
}

export interface ProfitTarget {
  id: string;
  name: string;
  triggerPercent: number; // At what profit % to trigger
  sellPercent: number; // What % of position to sell (0-100)
  enabled: boolean;
}

export class TradingConfigManager {
  private static instance: TradingConfigManager;
  private configPath: string;
  private settings: TradingSettings;
  private defaultSettings: TradingSettings = {
    profitTaking: {
      enabled: true,
      targets: [
        {
          id: 'quick-profit',
          name: '25% Quick Profit',
          triggerPercent: 25,
          sellPercent: 30, // Sell 30% of position
          enabled: true
        },
        {
          id: 'good-profit',
          name: '50% Good Profit',
          triggerPercent: 50,
          sellPercent: 40, // Sell 40% of position
          enabled: true
        },
        {
          id: 'excellent-profit',
          name: '100% Excellent Profit',
          triggerPercent: 100,
          sellPercent: 60, // Sell 60% of position
          enabled: true
        },
        {
          id: 'moon-profit',
          name: '200% Moon Profit',
          triggerPercent: 200,
          sellPercent: 80, // Sell 80% of position
          enabled: true
        }
      ],
      stopLoss: {
        enabled: false, // Disabled by default - risky in volatile crypto
        percentage: -30 // Stop loss at 30% loss
      }
    },

    riskManagement: {
      maxPositionSizePercent: 20, // Max 20% of portfolio per position
      maxDailyTrades: 10,
      requireMinimumProfit: 5 // Require at least 5% profit before considering sale
    },

    monitoring: {
      checkIntervalMs: 60000, // Check every minute
      priceUpdateIntervalMs: 30000, // Update prices every 30 seconds
      enableNotifications: true
    },

    execution: {
      dryRun: true, // Safe default - no real trades until explicitly enabled
      slippagePercent: 1.0, // 1% slippage tolerance
      maxPriceImpactPercent: 5.0, // Max 5% price impact
      retryAttempts: 3
    }
  };

  private constructor() {
    this.configPath = join(process.cwd(), 'trading-config.json');
    this.settings = this.loadSettings();
  }

  public static getInstance(): TradingConfigManager {
    if (!TradingConfigManager.instance) {
      TradingConfigManager.instance = new TradingConfigManager();
    }
    return TradingConfigManager.instance;
  }

  private loadSettings(): TradingSettings {
    try {
      if (existsSync(this.configPath)) {
        const configData = readFileSync(this.configPath, 'utf8');
        const loadedSettings = JSON.parse(configData) as TradingSettings;

        // Merge with defaults to ensure all properties exist
        return this.mergeWithDefaults(loadedSettings);
      } else {
        // Create default config file
        this.saveSettings(this.defaultSettings);
        console.log(`✅ Created default trading config at: ${this.configPath}`);
        return this.defaultSettings;
      }
    } catch (error) {
      console.error('Error loading trading config:', error);
      console.log('Using default settings...');
      return this.defaultSettings;
    }
  }

  private mergeWithDefaults(loadedSettings: Partial<TradingSettings>): TradingSettings {
    return {
      profitTaking: {
        ...this.defaultSettings.profitTaking,
        ...loadedSettings.profitTaking,
        targets: loadedSettings.profitTaking?.targets || this.defaultSettings.profitTaking.targets
      },
      riskManagement: {
        ...this.defaultSettings.riskManagement,
        ...loadedSettings.riskManagement
      },
      monitoring: {
        ...this.defaultSettings.monitoring,
        ...loadedSettings.monitoring
      },
      execution: {
        ...this.defaultSettings.execution,
        ...loadedSettings.execution
      }
    };
  }

  private saveSettings(settings: TradingSettings): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(settings, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving trading config:', error);
    }
  }

  // Public API methods
  public getSettings(): TradingSettings {
    return { ...this.settings }; // Return copy to prevent modification
  }

  public updateSettings(newSettings: Partial<TradingSettings>): void {
    this.settings = this.mergeWithDefaults(newSettings);
    this.saveSettings(this.settings);
    console.log('✅ Trading settings updated and saved');
  }

  // Profit taking methods
  public getProfitTargets(): ProfitTarget[] {
    return this.settings.profitTaking.targets.filter(target => target.enabled);
  }

  public addProfitTarget(target: Omit<ProfitTarget, 'id'>): void {
    const newTarget: ProfitTarget = {
      ...target,
      id: `target-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    };

    this.settings.profitTaking.targets.push(newTarget);
    this.saveSettings(this.settings);
    console.log(`✅ Added profit target: ${newTarget.name} at ${newTarget.triggerPercent}%`);
  }

  public removeProfitTarget(targetId: string): void {
    this.settings.profitTaking.targets = this.settings.profitTaking.targets.filter(
      target => target.id !== targetId
    );
    this.saveSettings(this.settings);
    console.log(`✅ Removed profit target: ${targetId}`);
  }

  public enableProfitTarget(targetId: string): void {
    const target = this.settings.profitTaking.targets.find(t => t.id === targetId);
    if (target) {
      target.enabled = true;
      this.saveSettings(this.settings);
      console.log(`✅ Enabled profit target: ${target.name}`);
    }
  }

  public disableProfitTarget(targetId: string): void {
    const target = this.settings.profitTaking.targets.find(t => t.id === targetId);
    if (target) {
      target.enabled = false;
      this.saveSettings(this.settings);
      console.log(`✅ Disabled profit target: ${target.name}`);
    }
  }

  // Risk management methods
  public setMaxPositionSize(percent: number): void {
    this.settings.riskManagement.maxPositionSizePercent = percent;
    this.saveSettings(this.settings);
    console.log(`✅ Set max position size to ${percent}%`);
  }

  public setMaxDailyTrades(count: number): void {
    this.settings.riskManagement.maxDailyTrades = count;
    this.saveSettings(this.settings);
    console.log(`✅ Set max daily trades to ${count}`);
  }

  // Execution settings
  public enableDryRun(): void {
    this.settings.execution.dryRun = true;
    this.saveSettings(this.settings);
    console.log('✅ Enabled DRY RUN mode - trades will be simulated only');
  }

  public disableDryRun(): void {
    this.settings.execution.dryRun = false;
    this.saveSettings(this.settings);
    console.log('⚠️ Disabled DRY RUN mode - trades will be EXECUTED');
  }

  public setSlippage(percent: number): void {
    this.settings.execution.slippagePercent = percent;
    this.saveSettings(this.settings);
    console.log(`✅ Set slippage tolerance to ${percent}%`);
  }

  // Monitoring settings
  public setMonitoringInterval(intervalMs: number): void {
    this.settings.monitoring.checkIntervalMs = intervalMs;
    this.saveSettings(this.settings);
    console.log(`✅ Set monitoring interval to ${intervalMs/1000} seconds`);
  }

  public setPriceUpdateInterval(intervalMs: number): void {
    this.settings.monitoring.priceUpdateIntervalMs = intervalMs;
    this.saveSettings(this.settings);
    console.log(`✅ Set price update interval to ${intervalMs/1000} seconds`);
  }

  // Utility methods
  public resetToDefaults(): void {
    this.settings = { ...this.defaultSettings };
    this.saveSettings(this.settings);
    console.log('✅ Reset trading config to defaults');
  }

  public validateSettings(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate profit targets
    if (this.settings.profitTaking.enabled) {
      if (this.settings.profitTaking.targets.length === 0) {
        errors.push('No profit targets defined while profit taking is enabled');
      }

      for (const target of this.settings.profitTaking.targets) {
        if (target.triggerPercent <= 0) {
          errors.push(`Invalid trigger percentage for target ${target.name}: ${target.triggerPercent}%`);
        }
        if (target.sellPercent <= 0 || target.sellPercent > 100) {
          errors.push(`Invalid sell percentage for target ${target.name}: ${target.sellPercent}%`);
        }
      }
    }

    // Validate risk management
    if (this.settings.riskManagement.maxPositionSizePercent <= 0 ||
        this.settings.riskManagement.maxPositionSizePercent > 100) {
      errors.push(`Invalid max position size: ${this.settings.riskManagement.maxPositionSizePercent}%`);
    }

    // Validate execution settings
    if (this.settings.execution.slippagePercent < 0) {
      errors.push(`Invalid slippage: ${this.settings.execution.slippagePercent}%`);
    }

    if (this.settings.execution.maxPriceImpactPercent < 0) {
      errors.push(`Invalid max price impact: ${this.settings.execution.maxPriceImpactPercent}%`);
    }

    // Validate monitoring intervals
    if (this.settings.monitoring.checkIntervalMs < 10000) {
      errors.push('Monitoring interval too short (minimum 10 seconds)');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  public printCurrentSettings(): void {
    console.log('\n🎯 CURRENT TRADING SETTINGS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('\n💰 PROFIT TAKING:');
    console.log(`Status: ${this.settings.profitTaking.enabled ? '✅ ENABLED' : '❌ DISABLED'}`);

    if (this.settings.profitTaking.enabled) {
      console.log('Targets:');
      this.settings.profitTaking.targets.forEach(target => {
        const status = target.enabled ? '✅' : '❌';
        console.log(`  ${status} ${target.name}: ${target.triggerPercent}% → Sell ${target.sellPercent}%`);
      });

      if (this.settings.profitTaking.stopLoss?.enabled) {
        console.log(`Stop Loss: ${this.settings.profitTaking.stopLoss.percentage}%`);
      }
    }

    console.log('\n🛡️ RISK MANAGEMENT:');
    console.log(`Max Position Size: ${this.settings.riskManagement.maxPositionSizePercent}%`);
    console.log(`Max Daily Trades: ${this.settings.riskManagement.maxDailyTrades}`);
    console.log(`Min Profit Required: ${this.settings.riskManagement.requireMinimumProfit}%`);

    console.log('\n📊 MONITORING:');
    console.log(`Check Interval: ${this.settings.monitoring.checkIntervalMs/1000}s`);
    console.log(`Price Updates: ${this.settings.monitoring.priceUpdateIntervalMs/1000}s`);
    console.log(`Notifications: ${this.settings.monitoring.enableNotifications ? '✅ ON' : '❌ OFF'}`);

    console.log('\n⚙️ EXECUTION:');
    console.log(`Mode: ${this.settings.execution.dryRun ? '🧪 DRY RUN' : '🔴 LIVE TRADING'}`);
    console.log(`Slippage: ${this.settings.execution.slippagePercent}%`);
    console.log(`Max Price Impact: ${this.settings.execution.maxPriceImpactPercent}%`);
    console.log(`Retry Attempts: ${this.settings.execution.retryAttempts}`);

    console.log(`\n📁 Config file: ${this.configPath}`);
  }

  public getConfigPath(): string {
    return this.configPath;
  }
}