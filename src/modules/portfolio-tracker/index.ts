import { WalletManager } from '../../core/wallet-manager';
import { PriceFeedManager } from '../price-feed';
import { CostBasisTracker } from './cost-basis-tracker';
import { DatabaseManager, PortfolioSnapshot } from '../../core/database';
import { TransactionTracker } from '../transaction-tracker';
import { Portfolio, Position, PerformanceMetrics } from '../../types';

export class PortfolioTracker {
  private static instance: PortfolioTracker;
  private walletManager: WalletManager;
  private priceFeedManager: PriceFeedManager;
  private costBasisTracker: CostBasisTracker;
  private dbManager: DatabaseManager;
  private transactionTracker: TransactionTracker;
  private currentPortfolio: Portfolio | null = null;

  private constructor() {
    this.walletManager = WalletManager.getInstance();
    this.priceFeedManager = PriceFeedManager.getInstance();
    this.costBasisTracker = CostBasisTracker.getInstance();
    this.dbManager = DatabaseManager.getInstance();
    this.transactionTracker = TransactionTracker.getInstance();
  }

  public static getInstance(): PortfolioTracker {
    if (!PortfolioTracker.instance) {
      PortfolioTracker.instance = new PortfolioTracker();
    }
    return PortfolioTracker.instance;
  }

  public async updatePortfolio(): Promise<Portfolio> {
    if (!this.walletManager.isConnected()) {
      throw new Error('Wallet not connected');
    }

    try {
      const walletPublicKey = this.walletManager.getPublicKey();
      if (!walletPublicKey) {
        throw new Error('Wallet public key not available');
      }

      // Get SOL balance and token positions
      const { sol: solBalance, tokens: tokenPositions } = await this.walletManager.refreshBalances();

      // Create SOL position
      const solPosition = await this.createSolPosition(solBalance);

      // Enrich token positions with price and metadata
      const enrichedTokenPositions = await this.enrichPositions(tokenPositions);

      // Combine SOL and token positions
      const allPositions = solBalance > 0 ? [solPosition, ...enrichedTokenPositions] : enrichedTokenPositions;

      // Calculate portfolio totals
      const totalValue = this.calculateTotalValue(allPositions);
      const totalUnrealizedPnL = this.calculateTotalUnrealizedPnL(allPositions);
      const totalUnrealizedPnLPercent = totalValue > 0 ? (totalUnrealizedPnL / totalValue) * 100 : 0;

      this.currentPortfolio = {
        walletAddress: walletPublicKey.toBase58(),
        positions: allPositions,
        totalValue,
        totalUnrealizedPnL,
        totalUnrealizedPnLPercent,
        solBalance,
        lastUpdated: new Date(),
      };

      // Save portfolio snapshot to database
      await this.savePortfolioSnapshot(this.currentPortfolio);

      return this.currentPortfolio;
    } catch (error) {
      console.error('Error updating portfolio:', error);
      throw error;
    }
  }

  private async createSolPosition(solBalance: number): Promise<Position> {
    // Get SOL price
    const solMint = 'So11111111111111111111111111111111111111112';
    const priceResponse = await this.priceFeedManager.getPrice(solMint);
    const solPrice = priceResponse.data?.price || 0; // Use 0 as fallback to avoid incorrect calculations

    const solPosition: Position = {
      tokenInfo: {
        mint: solMint,
        symbol: 'SOL',
        name: 'Solana',
        decimals: 9,
      },
      balance: solBalance * 1e9, // Convert to lamports for consistency
      balanceUiAmount: solBalance,
      mintAddress: solMint,
      currentPrice: solPrice,
      lastUpdated: new Date(),
    };

    // Add P&L calculation for SOL
    return this.costBasisTracker.enrichPositionWithPnL(solPosition);
  }

  private async enrichPositions(positions: Position[]): Promise<Position[]> {
    if (positions.length === 0) {
      return [];
    }

    try {
      // Get all mint addresses
      const mintAddresses = positions.map(p => p.mintAddress);

      // Fetch prices for all tokens
      const pricesResponse = await this.priceFeedManager.getPrices(mintAddresses);
      const priceMap = new Map<string, number>();

      if (pricesResponse.success && pricesResponse.data) {
        pricesResponse.data.forEach(priceData => {
          priceMap.set(priceData.tokenMint, priceData.price);
        });
      }

      // Enrich each position
      const enrichedPositions = await Promise.all(
        positions.map(async (position) => {
          // Get current price
          const currentPrice = priceMap.get(position.mintAddress) || 0;

          // Enrich token info
          const enrichedTokenInfo = await this.priceFeedManager.enrichTokenInfo(position.tokenInfo);

          const enrichedPosition = {
            ...position,
            tokenInfo: enrichedTokenInfo,
            currentPrice,
            lastUpdated: new Date(),
          };

          // Add P&L calculation
          return this.costBasisTracker.enrichPositionWithPnL(enrichedPosition);
        })
      );

      return enrichedPositions;
    } catch (error) {
      console.error('Error enriching positions:', error);
      return positions;
    }
  }

  private calculateTotalValue(positions: Position[]): number {
    return positions.reduce((total, position) => {
      if (position.currentPrice) {
        return total + (position.balanceUiAmount * position.currentPrice);
      }
      return total;
    }, 0);
  }

  private calculateTotalUnrealizedPnL(positions: Position[]): number {
    return positions.reduce((total, position) => {
      return total + (position.unrealizedPnL || 0);
    }, 0);
  }

  public getCurrentPortfolio(): Portfolio | null {
    return this.currentPortfolio;
  }

  public async getPortfolioSummary(): Promise<Portfolio | null> {
    if (!this.currentPortfolio) {
      await this.updatePortfolio();
    }
    return this.currentPortfolio;
  }

  public getPositionsByValue(): Position[] {
    if (!this.currentPortfolio) {
      return [];
    }

    return [...this.currentPortfolio.positions].sort((a, b) => {
      const aValue = (a.currentPrice || 0) * a.balanceUiAmount;
      const bValue = (b.currentPrice || 0) * b.balanceUiAmount;
      return bValue - aValue; // Descending order
    });
  }

  public async getPerformanceMetrics(): Promise<PerformanceMetrics | null> {
    if (!this.currentPortfolio) {
      return null;
    }

    const positions = this.currentPortfolio.positions;
    const positionsWithValue = positions.filter(p => p.currentPrice && p.currentPrice > 0);

    if (positionsWithValue.length === 0) {
      return null;
    }

    // Find best and worst performers (by absolute value for now)
    const sortedByValue = positionsWithValue.sort((a, b) => {
      const aValue = (a.currentPrice || 0) * a.balanceUiAmount;
      const bValue = (b.currentPrice || 0) * b.balanceUiAmount;
      return bValue - aValue;
    });

    const bestPerformer = sortedByValue[0];
    const worstPerformer = sortedByValue[sortedByValue.length - 1];

    // Calculate portfolio diversification (simplified)
    const totalValue = this.currentPortfolio.totalValue;
    const largestPositionValue = (bestPerformer.currentPrice || 0) * bestPerformer.balanceUiAmount;
    const portfolioDiversification = totalValue > 0 ? 1 - (largestPositionValue / totalValue) : 0;

    return {
      totalReturn: this.currentPortfolio.totalUnrealizedPnL,
      totalReturnPercent: this.currentPortfolio.totalUnrealizedPnLPercent,
      dayReturn: 0, // Not implemented yet
      dayReturnPercent: 0, // Not implemented yet
      weekReturn: 0, // Not implemented yet
      weekReturnPercent: 0, // Not implemented yet
      bestPerformer,
      worstPerformer,
      portfolioDiversification,
    };
  }

  public async startRealTimeTracking(intervalMs?: number): Promise<void> {
    const interval = intervalMs || 30000; // Default 30 seconds

    setInterval(async () => {
      try {
        await this.updatePortfolio();
        console.log(`Portfolio updated at ${new Date().toISOString()}`);
      } catch (error) {
        console.error('Error updating portfolio in real-time:', error);
      }
    }, interval);

    console.log(`Started real-time portfolio tracking (${interval}ms interval)`);
  }

  public async syncTransactionHistory(): Promise<number> {
    if (!this.walletManager.isConnected()) {
      throw new Error('Wallet not connected');
    }

    const walletPublicKey = this.walletManager.getPublicKey();
    if (!walletPublicKey) {
      throw new Error('Wallet public key not available');
    }

    return await this.transactionTracker.syncTransactionHistory(walletPublicKey);
  }

  public async getPortfolioHistory(limit: number = 30): Promise<PortfolioSnapshot[]> {
    if (!this.walletManager.isConnected()) {
      throw new Error('Wallet not connected');
    }

    const walletPublicKey = this.walletManager.getPublicKey();
    if (!walletPublicKey) {
      throw new Error('Wallet public key not available');
    }

    return await this.dbManager.getPortfolioHistory(walletPublicKey.toBase58(), limit);
  }

  private async savePortfolioSnapshot(portfolio: Portfolio): Promise<void> {
    try {
      const snapshot: PortfolioSnapshot = {
        walletAddress: portfolio.walletAddress,
        totalValue: portfolio.totalValue,
        totalPnL: portfolio.totalUnrealizedPnL,
        totalPnLPercent: portfolio.totalUnrealizedPnLPercent,
        positionCount: portfolio.positions.length,
        timestamp: portfolio.lastUpdated,
        data: JSON.stringify(portfolio),
      };

      await this.dbManager.savePortfolioSnapshot(snapshot);
    } catch (error) {
      console.warn('Failed to save portfolio snapshot:', error);
    }
  }

  public async initializeDatabase(): Promise<void> {
    try {
      await this.dbManager.initialize();
      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  public async updateCostBasisFromTransactions(): Promise<void> {
    if (!this.walletManager.isConnected()) {
      throw new Error('Wallet not connected');
    }

    const walletPublicKey = this.walletManager.getPublicKey();
    if (!walletPublicKey) {
      throw new Error('Wallet public key not available');
    }

    const walletAddress = walletPublicKey.toBase58();

    // Get all positions to update cost basis for
    if (!this.currentPortfolio) {
      await this.updatePortfolio();
    }

    if (!this.currentPortfolio) return;

    for (const position of this.currentPortfolio.positions) {
      try {
        const realCostBasis = await this.transactionTracker.calculateRealCostBasis(
          walletAddress,
          position.mintAddress
        );

        if (realCostBasis) {
          this.costBasisTracker.setCostBasis(position.mintAddress, realCostBasis.averagePrice);
          console.log(`Updated cost basis for ${position.tokenInfo.symbol}: $${realCostBasis.averagePrice.toFixed(4)}`);
        }
      } catch (error) {
        console.warn(`Failed to update cost basis for ${position.tokenInfo.symbol}:`, error);
      }
    }
  }

  public async checkForNewSwaps(): Promise<void> {
    if (!this.walletManager.isConnected()) {
      throw new Error('Wallet not connected');
    }

    const walletPublicKey = this.walletManager.getPublicKey();
    if (!walletPublicKey) {
      throw new Error('Wallet public key not available');
    }

    try {
      // Sync recent transaction history to catch new swaps (limited to reduce rate limiting)
      const newTransactions = await this.transactionTracker.syncTransactionHistory(walletPublicKey);

      if (newTransactions > 0) {
        console.log(`🔄 Found ${newTransactions} new transactions, updating portfolio...`);

        // Update portfolio to reflect new tokens
        await this.updatePortfolio();

        // Update cost basis for any new positions
        await this.updateCostBasisFromTransactions();

        console.log('✅ Portfolio updated with new swap data');
      } else {
        console.log('💫 No new transactions found - portfolio is up to date');
      }
    } catch (error) {
      console.error('Error checking for new swaps:', error);
    }
  }

  public async enableAutoSwapDetection(intervalMs: number = 60000): Promise<void> {
    console.log(`🔄 Starting automatic swap detection (${intervalMs/1000}s interval)`);

    setInterval(async () => {
      try {
        await this.checkForNewSwaps();
      } catch (error) {
        console.error('Error in automatic swap detection:', error);
      }
    }, intervalMs);
  }

  public async getTokensInProfit(): Promise<Position[]> {
    if (!this.currentPortfolio) {
      await this.updatePortfolio();
    }

    if (!this.currentPortfolio) {
      return [];
    }

    return this.costBasisTracker.getTokensWithProfit(this.currentPortfolio.positions);
  }

  public async suggestProfitTaking(): Promise<{ token: string; currentPrice: number; entryPrice: number; profitPercent: number; suggestedAction: string }[]> {
    const tokensInProfit = await this.getTokensInProfit();
    const suggestions: { token: string; currentPrice: number; entryPrice: number; profitPercent: number; suggestedAction: string }[] = [];

    for (const position of tokensInProfit) {
      const pnlData = this.costBasisTracker.calculatePnL(position);
      if (pnlData && position.currentPrice) {
        let suggestedAction = '';

        if (pnlData.unrealizedPnLPercent >= 100) {
          suggestedAction = '🚀 STRONG SELL - Take profits! 100%+ gain';
        } else if (pnlData.unrealizedPnLPercent >= 50) {
          suggestedAction = '💰 SELL - Excellent profit opportunity';
        } else if (pnlData.unrealizedPnLPercent >= 20) {
          suggestedAction = '📈 Consider selling partial position';
        } else if (pnlData.unrealizedPnLPercent >= 10) {
          suggestedAction = '✅ Good profit - monitor closely';
        } else {
          suggestedAction = '👀 Small profit - hold or watch';
        }

        suggestions.push({
          token: position.tokenInfo.symbol,
          currentPrice: position.currentPrice,
          entryPrice: pnlData.entryPrice,
          profitPercent: pnlData.unrealizedPnLPercent,
          suggestedAction
        });
      }
    }

    return suggestions.sort((a, b) => b.profitPercent - a.profitPercent);
  }

  public async generateTradingAlert(): Promise<string[]> {
    const suggestions = await this.suggestProfitTaking();
    const alerts: string[] = [];

    if (suggestions.length === 0) {
      alerts.push('📊 No tokens currently in profit for selling');
      return alerts;
    }

    alerts.push('🎯 PROFIT TAKING OPPORTUNITIES:');
    alerts.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    suggestions.forEach((suggestion, index) => {
      if (index < 5) { // Show top 5 opportunities
        alerts.push(`${index + 1}. ${suggestion.token}: +${suggestion.profitPercent.toFixed(1)}%`);
        alerts.push(`   Entry: $${suggestion.entryPrice.toFixed(4)} → Current: $${suggestion.currentPrice.toFixed(4)}`);
        alerts.push(`   ${suggestion.suggestedAction}`);
        alerts.push('');
      }
    });

    // Add summary
    const strongSells = suggestions.filter(s => s.profitPercent >= 50).length;
    const moderateSells = suggestions.filter(s => s.profitPercent >= 20 && s.profitPercent < 50).length;

    if (strongSells > 0) {
      alerts.push(`🔥 ${strongSells} token(s) with 50%+ profit - Consider taking profits!`);
    }
    if (moderateSells > 0) {
      alerts.push(`📈 ${moderateSells} token(s) with 20-50% profit - Monitor for exit opportunities`);
    }

    return alerts;
  }
}