import { Position } from '../../types';
import { JupiterTrader, SwapResult } from './jupiter-trader';
import { WalletManager } from '../../core/wallet-manager';

export interface TradingRule {
  id: string;
  name: string;
  enabled: boolean;
  tokenMint: string;
  ruleType: 'take_profit' | 'stop_loss' | 'dca' | 'rebalance';
  conditions: RuleConditions;
  actions: RuleActions;
  lastExecuted?: Date;
  executionCount: number;
}

export interface RuleConditions {
  priceThreshold?: number;
  percentageThreshold?: number;
  timeCondition?: 'always' | 'market_hours' | 'custom';
  portfolioConditions?: {
    maxPositionSize?: number;
    minLiquidity?: number;
  };
}

export interface RuleActions {
  action: 'sell_percentage' | 'sell_amount' | 'buy_amount' | 'rebalance';
  amount?: number;
  percentage?: number;
  targetToken?: string;
  slippage?: number;
  dryRun?: boolean;
}

export interface RuleExecutionResult {
  ruleId: string;
  executed: boolean;
  reason: string;
  swapResult?: SwapResult;
  timestamp: Date;
}

export class TradingRuleEngine {
  private static instance: TradingRuleEngine;
  private rules: Map<string, TradingRule> = new Map();
  private jupiterTrader: JupiterTrader;
  private walletManager: WalletManager;
  private isRunning: boolean = false;

  private constructor() {
    this.jupiterTrader = JupiterTrader.getInstance();
    this.walletManager = WalletManager.getInstance();
    this.loadDefaultRules();
  }

  public static getInstance(): TradingRuleEngine {
    if (!TradingRuleEngine.instance) {
      TradingRuleEngine.instance = new TradingRuleEngine();
    }
    return TradingRuleEngine.instance;
  }

  private loadDefaultRules(): void {
    // Example take-profit rule for SOL
    const solTakeProfitRule: TradingRule = {
      id: 'sol-take-profit-20',
      name: 'SOL Take Profit at +20%',
      enabled: false, // Disabled by default for safety
      tokenMint: 'So11111111111111111111111111111111111111112',
      ruleType: 'take_profit',
      conditions: {
        percentageThreshold: 20, // 20% profit
        timeCondition: 'always',
      },
      actions: {
        action: 'sell_percentage',
        percentage: 25, // Sell 25% of position
        targetToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        slippage: 1,
        dryRun: true,
      },
      executionCount: 0,
    };

    // Example stop-loss rule for JUP
    const jupStopLossRule: TradingRule = {
      id: 'jup-stop-loss-10',
      name: 'JUP Stop Loss at -10%',
      enabled: false,
      tokenMint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      ruleType: 'stop_loss',
      conditions: {
        percentageThreshold: -10, // 10% loss
        timeCondition: 'always',
      },
      actions: {
        action: 'sell_percentage',
        percentage: 50, // Sell 50% of position
        targetToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        slippage: 2,
        dryRun: true,
      },
      executionCount: 0,
    };

    this.rules.set(solTakeProfitRule.id, solTakeProfitRule);
    this.rules.set(jupStopLossRule.id, jupStopLossRule);
  }

  public addRule(rule: TradingRule): void {
    this.rules.set(rule.id, rule);
    console.log(`✅ Added trading rule: ${rule.name}`);
  }

  public removeRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      console.log(`🗑️ Removed trading rule: ${ruleId}`);
    }
    return removed;
  }

  public enableRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
      console.log(`🟢 Enabled trading rule: ${rule.name}`);
      return true;
    }
    return false;
  }

  public disableRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
      console.log(`🔴 Disabled trading rule: ${rule.name}`);
      return true;
    }
    return false;
  }

  public getAllRules(): TradingRule[] {
    return Array.from(this.rules.values());
  }

  public getEnabledRules(): TradingRule[] {
    return Array.from(this.rules.values()).filter(rule => rule.enabled);
  }

  public async evaluateRules(positions: Position[]): Promise<RuleExecutionResult[]> {
    const results: RuleExecutionResult[] = [];
    const enabledRules = this.getEnabledRules();

    if (enabledRules.length === 0) {
      return results;
    }

    console.log(`🔍 Evaluating ${enabledRules.length} trading rules...`);

    for (const rule of enabledRules) {
      try {
        const result = await this.evaluateRule(rule, positions);
        results.push(result);

        if (result.executed) {
          rule.executionCount++;
          rule.lastExecuted = new Date();
          console.log(`✅ Executed rule: ${rule.name}`);
        }
      } catch (error) {
        console.error(`❌ Error evaluating rule ${rule.name}:`, error);
        results.push({
          ruleId: rule.id,
          executed: false,
          reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date(),
        });
      }
    }

    return results;
  }

  private async evaluateRule(rule: TradingRule, positions: Position[]): Promise<RuleExecutionResult> {
    // Find the position for this rule
    const position = positions.find(p => p.mintAddress === rule.tokenMint);

    if (!position) {
      return {
        ruleId: rule.id,
        executed: false,
        reason: 'Position not found',
        timestamp: new Date(),
      };
    }

    // Check if conditions are met
    const conditionsMet = this.checkConditions(rule, position);
    if (!conditionsMet.met) {
      return {
        ruleId: rule.id,
        executed: false,
        reason: conditionsMet.reason,
        timestamp: new Date(),
      };
    }

    // Execute the action
    const swapResult = await this.executeAction(rule, position);

    return {
      ruleId: rule.id,
      executed: swapResult.success,
      reason: swapResult.success ? 'Rule executed successfully' : swapResult.error || 'Execution failed',
      swapResult,
      timestamp: new Date(),
    };
  }

  private checkConditions(rule: TradingRule, position: Position): { met: boolean; reason: string } {
    const conditions = rule.conditions;

    // Check percentage threshold
    if (conditions.percentageThreshold !== undefined) {
      const currentPnlPercent = position.unrealizedPnLPercent || 0;

      if (rule.ruleType === 'take_profit' && currentPnlPercent < conditions.percentageThreshold) {
        return {
          met: false,
          reason: `P&L ${currentPnlPercent.toFixed(2)}% below take-profit threshold ${conditions.percentageThreshold}%`,
        };
      }

      if (rule.ruleType === 'stop_loss' && currentPnlPercent > conditions.percentageThreshold) {
        return {
          met: false,
          reason: `P&L ${currentPnlPercent.toFixed(2)}% above stop-loss threshold ${conditions.percentageThreshold}%`,
        };
      }
    }

    // Check price threshold
    if (conditions.priceThreshold !== undefined && position.currentPrice) {
      if (rule.ruleType === 'take_profit' && position.currentPrice < conditions.priceThreshold) {
        return {
          met: false,
          reason: `Price $${position.currentPrice} below threshold $${conditions.priceThreshold}`,
        };
      }

      if (rule.ruleType === 'stop_loss' && position.currentPrice > conditions.priceThreshold) {
        return {
          met: false,
          reason: `Price $${position.currentPrice} above threshold $${conditions.priceThreshold}`,
        };
      }
    }

    return { met: true, reason: 'All conditions met' };
  }

  private async executeAction(rule: TradingRule, position: Position): Promise<SwapResult> {
    const actions = rule.actions;
    const userPublicKey = this.walletManager.getPublicKey();

    if (!userPublicKey) {
      return {
        success: false,
        error: 'Wallet not connected',
        inputAmount: 0,
        outputAmount: 0,
        priceImpact: 0,
        timestamp: new Date(),
      };
    }

    let sellAmount = 0;

    // Calculate sell amount
    if (actions.action === 'sell_percentage' && actions.percentage) {
      sellAmount = position.balanceUiAmount * (actions.percentage / 100);
    } else if (actions.action === 'sell_amount' && actions.amount) {
      sellAmount = Math.min(actions.amount, position.balanceUiAmount);
    }

    if (sellAmount <= 0) {
      return {
        success: false,
        error: 'Invalid sell amount calculated',
        inputAmount: 0,
        outputAmount: 0,
        priceImpact: 0,
        timestamp: new Date(),
      };
    }

    // Convert to base units
    const sellAmountBaseUnits = sellAmount * Math.pow(10, position.tokenInfo.decimals);

    // Execute swap
    const targetToken = actions.targetToken || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // Default to USDC
    const slippageBps = this.jupiterTrader.calculateSlippageBps(actions.slippage || 1);

    console.log(`🔄 Executing ${actions.action}: ${sellAmount} ${position.tokenInfo.symbol} → target token`);

    return await this.jupiterTrader.executeSwap(
      position.mintAddress,
      targetToken,
      sellAmountBaseUnits,
      userPublicKey,
      slippageBps,
      actions.dryRun !== false // Default to dry run for safety
    );
  }

  public async startAutomation(intervalMs: number = 60000): Promise<void> {
    if (this.isRunning) {
      console.log('🤖 Trading automation is already running');
      return;
    }

    this.isRunning = true;
    console.log(`🤖 Starting trading automation (${intervalMs / 1000}s interval)`);
    console.log('⚠️  All rules are in DRY RUN mode by default for safety');

    // This would integrate with the portfolio tracker
    // For now, we'll just log that automation is running
    const interval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(interval);
        return;
      }

      console.log('🔄 Checking trading rules...');
      // In production, this would get current positions and evaluate rules
    }, intervalMs);
  }

  public stopAutomation(): void {
    this.isRunning = false;
    console.log('🛑 Trading automation stopped');
  }

  public isAutomationRunning(): boolean {
    return this.isRunning;
  }
}