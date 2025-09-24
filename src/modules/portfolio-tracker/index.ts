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

      // Create SOL position (without price for rate limit safety)
      const solPosition = await this.createSolPositionBasic(solBalance);

      // Get token positions (without prices for rate limit safety)
      const enrichedTokenPositions = await this.getTokenPositionsBasic(tokenPositions);

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

  public async updatePortfolioWithPrices(): Promise<Portfolio> {
    // Use real prices but with conservative rate limiting
    return this.updatePortfolioWithRealPrices();
  }

  public async updatePortfolioWithRealPrices(): Promise<Portfolio> {
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

      // Create SOL position with live price (conservative rate limiting)
      const solPosition = await this.createSolPositionWithPrice(solBalance);

      // Enrich token positions with live prices (conservative rate limiting)
      const enrichedTokenPositions = await this.enrichPositionsWithPrices(tokenPositions);

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
      console.error('Error updating portfolio with prices:', error);
      throw error;
    }
  }

  public async updatePortfolioWithSmartPricing(): Promise<Portfolio> {
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

      // Create SOL position with price (smart rate limiting)
      const solPosition = await this.createSolPositionWithPrice(solBalance);

      // Enrich ALL token positions with smart price fetching
      const enrichedTokenPositions = await this.enrichPositionsSmartly(tokenPositions);

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
      console.error('Error updating portfolio with smart pricing:', error);
      throw error;
    }
  }

  private async enrichPositionsSmartly(positions: Position[]): Promise<Position[]> {
    if (positions.length === 0) {
      return [];
    }

    try {
      // Only process tokens with balance > 0
      const activePositions = positions.filter(p => p.balanceUiAmount > 0);
      console.log(`💰 Fetching prices for ${activePositions.length} active tokens...`);

      // Skip known dead/non-tradable tokens to prevent circuit breaker triggering
      const deadTokens = [
        'CAnihSk8tbqehyjVtZvFAkX7AC2JnYdmCqXpUDm1pump', // CANI - confirmed dead
      ];

      const tradablePositions = activePositions.filter(p => !deadTokens.includes(p.mintAddress));
      console.log(`💰 Skipping ${activePositions.length - tradablePositions.length} dead tokens, processing ${tradablePositions.length} tradable tokens...`);

      const priceMap = new Map<string, number>();

      // Fetch prices for tradable tokens only
      for (let i = 0; i < tradablePositions.length; i++) {
        const position = tradablePositions[i];

        try {
          console.log(`💰 ${i+1}/${tradablePositions.length}: Fetching price for ${position.tokenInfo.symbol}...`);
          const priceResponse = await this.priceFeedManager.getPrice(position.mintAddress);

          if (priceResponse.success && priceResponse.data && priceResponse.data.price > 0) {
            priceMap.set(position.mintAddress, priceResponse.data.price);
            console.log(`✅ ${position.tokenInfo.symbol}: $${priceResponse.data.price}`);
          } else {
            console.log(`⚠️ ${position.tokenInfo.symbol}: No price found`);
          }

          // Moderate delay to respect Jupiter rate limits (60 req/min = 1 req/second)
          const delay = 1200; // 1.2s fixed delay - allows ~50 req/min
          if (i < tradablePositions.length - 1) {
            console.log(`⏳ Waiting ${delay/1000}s before next request...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (error) {
          console.warn(`⚠️ Failed to get price for ${position.tokenInfo.symbol}`);
        }
      }

      console.log(`💰 Retrieved ${priceMap.size} prices successfully`);

      // Enrich all positions (including zero balance ones)
      const enrichedPositions = await Promise.all(
        positions.map(async (position) => {
          const currentPrice = priceMap.get(position.mintAddress) || 0;

          // Enrich token info if we have a price (indicates it's a known/tradable token)
          let enrichedTokenInfo = position.tokenInfo;
          if (currentPrice > 0) {
            try {
              enrichedTokenInfo = await this.priceFeedManager.enrichTokenInfo(position.tokenInfo);
            } catch (error) {
              console.warn(`⚠️ Failed to enrich token info for ${position.tokenInfo.symbol}`);
            }
          }

          const enrichedPosition = {
            ...position,
            tokenInfo: enrichedTokenInfo,
            currentPrice,
            lastUpdated: new Date(),
          };

          // OPTIMIZED: Only set cost basis for tradable tokens with actual balance
          if (position.balanceUiAmount > 0 && currentPrice > 0) {
            // FAST PATH: Check if cost basis already exists to avoid expensive calls
            if (!this.costBasisTracker.hasValidCostBasis(position.mintAddress)) {
              console.log(`📊 Setting cost basis for tradable token: ${position.tokenInfo?.symbol || position.mintAddress.slice(0, 8)}...`);

              // CRITICAL FIX: Skip expensive transaction sync for performance
              await this.costBasisTracker.autoSetCostBasisForNewToken(
                position.mintAddress,
                currentPrice,
                undefined // SKIP wallet address to prevent transaction sync
              );
            }
          }

          // Add P&L calculation
          return this.costBasisTracker.enrichPositionWithPnL(enrichedPosition);
        })
      );

      return enrichedPositions;
    } catch (error) {
      console.error('❌ Error enriching positions smartly:', error);
      console.log('⚡ Falling back to basic positions without prices');
      // Use empty string as fallback for error cases
      return this.getTokenPositionsBasic(positions);
    }
  }

  private async createSolPositionWithPrice(solBalance: number): Promise<Position> {
    const solMint = 'So11111111111111111111111111111111111111112';

    try {
      console.log(`💰 Fetching SOL price...`);
      const priceResponse = await this.priceFeedManager.getPrice(solMint);
      const solPrice = priceResponse.data?.price || 0;

      if (solPrice > 0) {
        console.log(`✅ Got SOL price: $${solPrice}`);
      }

      const solPosition: Position = {
        tokenInfo: {
          mint: solMint,
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
        },
        balance: solBalance * 1e9,
        balanceUiAmount: solBalance,
        mintAddress: solMint,
        currentPrice: solPrice,
        lastUpdated: new Date(),
      };

      return this.costBasisTracker.enrichPositionWithPnL(solPosition);
    } catch (error) {
      console.warn('⚠️ Failed to get SOL price, using cost basis only');
      return this.createSolPositionBasic(solBalance);
    }
  }

  private async enrichPositionsWithPrices(positions: Position[]): Promise<Position[]> {
    if (positions.length === 0) {
      return [];
    }

    try {
      // Get all mint addresses
      const mintAddresses = positions.map(p => p.mintAddress);
      console.log(`💰 Fetching prices for ${mintAddresses.length} tokens (conservative rate limiting)...`);

      // Only fetch prices for major tokens with known price sources
      const majorTokens = [
        'So11111111111111111111111111111111111111112', // SOL
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', // JUP
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
      ];

      const activePositions = positions.filter(p => p.balanceUiAmount > 0);
      const majorActivePositions = activePositions.filter(p => majorTokens.includes(p.mintAddress));

      console.log(`⚡ Processing ${majorActivePositions.length} major tokens only (prevent rate limits)`);

      // Fetch prices only for major tokens
      const priceMap = new Map<string, number>();

      for (const position of majorActivePositions) {
        try {
          console.log(`💰 Fetching price for ${position.tokenInfo.symbol}...`);
          const priceResponse = await this.priceFeedManager.getPrice(position.mintAddress);

          if (priceResponse.success && priceResponse.data) {
            priceMap.set(position.mintAddress, priceResponse.data.price);
            console.log(`✅ Got price for ${position.tokenInfo.symbol}: $${priceResponse.data.price}`);
          }

          // Add longer delay between major token requests
          await new Promise(resolve => setTimeout(resolve, 8000)); // 8 second delay
        } catch (error) {
          console.warn(`⚠️ Failed to get price for ${position.tokenInfo.symbol}`);
        }
      }

      console.log(`💰 Retrieved ${priceMap.size} prices successfully`);

      // Enrich each position
      // Don't need wallet address in closure for now
      const enrichedPositions = await Promise.all(
        positions.map(async (position) => {
          // Get current price
          const currentPrice = priceMap.get(position.mintAddress) || 0;

          // Enrich token info only if we got a price
          let enrichedTokenInfo = position.tokenInfo;
          if (currentPrice > 0) {
            try {
              enrichedTokenInfo = await this.priceFeedManager.enrichTokenInfo(position.tokenInfo);
            } catch (error) {
              console.warn(`⚠️ Failed to enrich token info for ${position.tokenInfo.symbol}`);
            }
          }

          const enrichedPosition = {
            ...position,
            tokenInfo: enrichedTokenInfo,
            currentPrice,
            lastUpdated: new Date(),
          };

          // OPTIMIZED: Only set cost basis for tradable tokens with actual balance
          if (position.balanceUiAmount > 0 && currentPrice > 0) {
            // FAST PATH: Check if cost basis already exists to avoid expensive calls
            if (!this.costBasisTracker.hasValidCostBasis(position.mintAddress)) {
              console.log(`📊 Setting cost basis for tradable token: ${position.tokenInfo?.symbol || position.mintAddress.slice(0, 8)}...`);

              // CRITICAL FIX: Skip expensive transaction sync for performance
              await this.costBasisTracker.autoSetCostBasisForNewToken(
                position.mintAddress,
                currentPrice,
                undefined // SKIP wallet address to prevent transaction sync
              );
            }
          }

          // Add P&L calculation
          return this.costBasisTracker.enrichPositionWithPnL(enrichedPosition);
        })
      );

      return enrichedPositions;
    } catch (error) {
      console.error('❌ Error enriching positions with prices:', error);
      console.log('⚡ Falling back to basic positions without prices');
      // Use empty string as fallback for error cases
      return this.getTokenPositionsBasic(positions);
    }
  }

  private async createSolPositionBasic(solBalance: number): Promise<Position> {
    const solMint = 'So11111111111111111111111111111111111111112';

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
      currentPrice: 0, // No price fetching for rate limit safety
      lastUpdated: new Date(),
    };

    // Add P&L calculation for SOL using cost basis
    return this.costBasisTracker.enrichPositionWithPnL(solPosition);
  }

  private async getTokenPositionsBasic(positions: Position[]): Promise<Position[]> {
    // Return positions with cost basis P&L but no price fetching
    return Promise.all(
      positions.map(async (position) => {
        const enrichedPosition = {
          ...position,
          currentPrice: 0, // No price fetching for rate limit safety
          lastUpdated: new Date(),
        };

        // Auto-set cost basis for new tokens without price
        await this.costBasisTracker.autoSetCostBasisForNewToken(position.mintAddress, undefined);

        // Add P&L calculation using cost basis
        return this.costBasisTracker.enrichPositionWithPnL(enrichedPosition);
      })
    );
  }


  private calculateTotalValue(positions: Position[]): number {
    return positions.reduce((total, position) => {
      if (position.currentPrice && position.currentPrice > 0) {
        return total + (position.balanceUiAmount * position.currentPrice);
      }
      // For tokens without price, try to use cost basis for rough estimation
      if (position.entryPrice && position.entryPrice > 0) {
        console.log(`Using cost basis for ${position.tokenInfo.symbol}: $${position.entryPrice}`);
        return total + (position.balanceUiAmount * position.entryPrice);
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
      // Use current price if available, fallback to entry price
      const aPrice = (a.currentPrice && a.currentPrice > 0) ? a.currentPrice : (a.entryPrice || 0);
      const bPrice = (b.currentPrice && b.currentPrice > 0) ? b.currentPrice : (b.entryPrice || 0);

      const aValue = aPrice * a.balanceUiAmount;
      const bValue = bPrice * b.balanceUiAmount;
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
          console.log(`🔥 Updated cost basis for ${position.tokenInfo.symbol}: $${realCostBasis.averagePrice.toFixed(6)} (from ${realCostBasis.totalQuantity} transactions)`);
        } else {
          console.log(`⚪ No transaction data found for ${position.tokenInfo.symbol}`);
        }
      } catch (error) {
        console.warn(`Failed to update cost basis for ${position.tokenInfo.symbol}:`, error);
      }
    }
  }

  public async checkForNewSwaps(): Promise<void> {
    console.log('⚡ Transaction sync disabled to prevent rate limiting');
    console.log('💡 Use "npm run portfolio sync" to explicitly sync transaction history');
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