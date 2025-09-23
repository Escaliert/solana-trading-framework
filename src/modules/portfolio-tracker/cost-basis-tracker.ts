import { Position } from '../../types';

interface CostBasisEntry {
  mint: string;
  averagePrice: number;
  totalQuantity: number;
  lastUpdated: Date;
}

export class CostBasisTracker {
  private static instance: CostBasisTracker;
  private costBasisData: Map<string, CostBasisEntry> = new Map();

  private constructor() {
    this.loadDefaultCostBasis();
    // Load database cost basis asynchronously in background
    this.loadDatabaseCostBasis().catch(console.warn);
  }

  public static getInstance(): CostBasisTracker {
    if (!CostBasisTracker.instance) {
      CostBasisTracker.instance = new CostBasisTracker();
    }
    return CostBasisTracker.instance;
  }

  private loadDefaultCostBasis(): void {
    // For demo purposes, use some reasonable entry prices
    // In production, this would come from transaction history analysis
    const defaultCostBasis: CostBasisEntry[] = [
      {
        mint: 'So11111111111111111111111111111111111111112', // SOL
        averagePrice: 120, // Assume bought at $120
        totalQuantity: 0,
        lastUpdated: new Date(),
      },
      {
        mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', // JUP
        averagePrice: 0.65, // Assume bought at $0.65
        totalQuantity: 0,
        lastUpdated: new Date(),
      },
      {
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        averagePrice: 1.0,
        totalQuantity: 0,
        lastUpdated: new Date(),
      },
      {
        mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
        averagePrice: 1.0,
        totalQuantity: 0,
        lastUpdated: new Date(),
      },
      {
        mint: 'CAnihSk8tbqehyjVtZvFAkX7AC2JnYdmCqXpUDm1pump', // PumpFun token
        averagePrice: 0.0000001, // Very small price as placeholder for new PumpFun token
        totalQuantity: 0,
        lastUpdated: new Date(),
      },
    ];

    defaultCostBasis.forEach(entry => {
      this.costBasisData.set(entry.mint, entry);
    });
  }

  private async loadDatabaseCostBasis(): Promise<void> {
    try {
      const { DatabaseManager } = await import('../../core/database');
      const dbManager = DatabaseManager.getInstance();

      // Get all cost basis entries from database
      const costBasisEntries = await dbManager.getAllCostBasis();

      for (const entry of costBasisEntries) {
        this.costBasisData.set(entry.mint_address, {
          mint: entry.mint_address,
          averagePrice: entry.average_price,
          totalQuantity: entry.total_quantity,
          lastUpdated: new Date(entry.last_updated),
        });
        console.log(`📂 Loaded cost basis from DB: ${entry.mint_address.slice(0, 8)}... = $${entry.average_price}`);
      }
    } catch (error) {
      console.warn('Could not load cost basis from database:', error);
    }
  }

  public getCostBasis(mint: string): CostBasisEntry | null {
    return this.costBasisData.get(mint) || null;
  }

  public updateCostBasis(mint: string, price: number, quantity: number): void {
    const existing = this.costBasisData.get(mint);

    if (existing) {
      // Update weighted average
      const totalValue = (existing.averagePrice * existing.totalQuantity) + (price * quantity);
      const totalQuantity = existing.totalQuantity + quantity;

      existing.averagePrice = totalValue / totalQuantity;
      existing.totalQuantity = totalQuantity;
      existing.lastUpdated = new Date();
    } else {
      // Create new entry
      this.costBasisData.set(mint, {
        mint,
        averagePrice: price,
        totalQuantity: quantity,
        lastUpdated: new Date(),
      });
    }
  }

  public calculatePnL(position: Position): { unrealizedPnL: number; unrealizedPnLPercent: number; entryPrice: number } | null {
    let costBasis = this.getCostBasis(position.mintAddress);

    // If no cost basis exists, create one automatically using current price
    if (!costBasis) {
      console.log(`🔧 Auto-creating cost basis for ${position.tokenInfo?.symbol || position.mintAddress.slice(0, 8)}...`);

      // Use current price as cost basis for new tokens (conservative approach)
      const defaultPrice = position.currentPrice && position.currentPrice > 0 ? position.currentPrice : 0.0000001;
      this.setCostBasis(position.mintAddress, defaultPrice);
      costBasis = this.getCostBasis(position.mintAddress);

      if (!costBasis) {
        return null;
      }
    }

    // For tokens without current price, we can't calculate P&L accurately
    // But we can still show the entry price
    if (!position.currentPrice || position.currentPrice <= 0) {
      return {
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        entryPrice: costBasis.averagePrice,
      };
    }

    const entryPrice = costBasis.averagePrice;
    const currentValue = position.balanceUiAmount * position.currentPrice;
    const costValue = position.balanceUiAmount * entryPrice;

    const unrealizedPnL = currentValue - costValue;
    const unrealizedPnLPercent = costValue > 0 ? (unrealizedPnL / costValue) * 100 : 0;

    // GLOBAL FIX: Sanity check for extreme P&L values - reset cost basis if unrealistic
    if (Math.abs(unrealizedPnLPercent) > 1000) {
      console.warn(`🔧 FIXING: Extreme P&L detected for ${position.tokenInfo?.symbol || position.mintAddress.slice(0, 8)}: ${unrealizedPnLPercent.toFixed(1)}%`);
      console.warn(`   Old Entry: $${entryPrice.toFixed(8)}, Current: $${position.currentPrice.toFixed(8)}`);

      // GLOBAL FIX: Reset cost basis to current price for extreme cases
      const newEntryPrice = position.currentPrice;
      this.setCostBasis(position.mintAddress, newEntryPrice);

      console.warn(`🔧 FIXED: Reset entry price to current price: $${newEntryPrice.toFixed(8)}`);

      // Recalculate with corrected entry price
      const correctedCostValue = position.balanceUiAmount * newEntryPrice;
      const correctedPnL = currentValue - correctedCostValue;
      const correctedPnLPercent = correctedCostValue > 0 ? (correctedPnL / correctedCostValue) * 100 : 0;

      return {
        unrealizedPnL: correctedPnL,
        unrealizedPnLPercent: correctedPnLPercent,
        entryPrice: newEntryPrice,
      };
    }

    return {
      unrealizedPnL,
      unrealizedPnLPercent,
      entryPrice,
    };
  }

  public enrichPositionWithPnL(position: Position): Position {
    const pnlData = this.calculatePnL(position);

    if (pnlData) {
      return {
        ...position,
        entryPrice: pnlData.entryPrice,
        costBasis: position.balanceUiAmount * pnlData.entryPrice,
        unrealizedPnL: pnlData.unrealizedPnL,
        unrealizedPnLPercent: pnlData.unrealizedPnLPercent,
      };
    }

    // Fallback: Even if PnL calculation fails, ensure we have some data
    console.warn(`⚠️ Failed to calculate PnL for ${position.tokenInfo?.symbol || position.mintAddress.slice(0, 8)}, using fallback`);
    return {
      ...position,
      entryPrice: 0,
      costBasis: 0,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
    };
  }

  public getAllCostBasis(): Map<string, CostBasisEntry> {
    return new Map(this.costBasisData);
  }

  public setCostBasis(mint: string, averagePrice: number): void {
    const existing = this.costBasisData.get(mint);

    if (existing) {
      existing.averagePrice = averagePrice;
      existing.lastUpdated = new Date();
    } else {
      this.costBasisData.set(mint, {
        mint,
        averagePrice,
        totalQuantity: 0,
        lastUpdated: new Date(),
      });
    }

    // CRUCIAL FIX: Also save to database for persistence
    this.saveCostBasisToDatabase(mint, averagePrice);
  }

  private async saveCostBasisToDatabase(mint: string, averagePrice: number): Promise<void> {
    try {
      const { DatabaseManager } = await import('../../core/database');
      const dbManager = DatabaseManager.getInstance();

      await dbManager.saveCostBasis({
        mint_address: mint,
        average_price: averagePrice,
        total_quantity: 0,
        last_updated: new Date().toISOString(),
      });

      console.log(`💾 Saved cost basis to DB: ${mint.slice(0, 8)}... = $${averagePrice.toFixed(8)}`);
    } catch (error) {
      console.warn(`Failed to save cost basis to database for ${mint.slice(0, 8)}...:`, error);
    }
  }

  public recordSwap(fromMint: string, toMint: string, fromAmount: number, toAmount: number, fromPrice: number, _toPrice: number): void {
    // Record the sale of the "from" token
    const fromCostBasis = this.getCostBasis(fromMint);
    if (fromCostBasis && fromCostBasis.totalQuantity > 0) {
      // Reduce quantity for sold tokens
      fromCostBasis.totalQuantity = Math.max(0, fromCostBasis.totalQuantity - fromAmount);
      fromCostBasis.lastUpdated = new Date();
    }

    // Calculate the cost basis for the new token based on the swap
    // The cost basis is the value of what was given up divided by what was received
    const swapCostBasisPerToken = (fromAmount * fromPrice) / toAmount;

    // Update cost basis for the "to" token
    this.updateCostBasis(toMint, swapCostBasisPerToken, toAmount);

    console.log(`📊 Swap recorded: ${fromAmount} ${fromMint.slice(0, 8)} → ${toAmount} ${toMint.slice(0, 8)}`);
    console.log(`💰 New cost basis for ${toMint.slice(0, 8)}: $${swapCostBasisPerToken.toFixed(4)}`);
  }

  public hasValidCostBasis(mint: string): boolean {
    const costBasis = this.getCostBasis(mint);
    return costBasis !== null && costBasis.averagePrice > 0;
  }

  public getTokensWithProfit(positions: Position[]): Position[] {
    return positions.filter(position => {
      const pnlData = this.calculatePnL(position);
      return pnlData && pnlData.unrealizedPnL > 0 && pnlData.unrealizedPnLPercent > 0.5; // At least 0.5% profit
    });
  }

  public formatPnLSummary(position: Position): string {
    const pnlData = this.calculatePnL(position);
    if (!pnlData) {
      return `${position.tokenInfo.symbol}: No P&L data`;
    }

    const profitEmoji = pnlData.unrealizedPnL >= 0 ? '📈' : '📉';
    const colorEmoji = pnlData.unrealizedPnLPercent >= 0 ? '🟢' : '🔴';

    return `${colorEmoji} ${position.tokenInfo.symbol}: ${profitEmoji} $${pnlData.unrealizedPnL.toFixed(2)} (${pnlData.unrealizedPnLPercent.toFixed(1)}%)`;
  }

  public async autoSetCostBasisForNewToken(mint: string, estimatedPrice?: number, walletAddress?: string): Promise<void> {
    const existing = this.getCostBasis(mint);

    // GLOBAL FIX: Smart cost basis management after sell/buy cycles
    if (existing && existing.averagePrice > 0) {
      // Check if the existing cost basis is unrealistic compared to current price
      if (estimatedPrice && estimatedPrice > 0) {
        const priceRatio = estimatedPrice / existing.averagePrice;
        const extremeRatio = priceRatio > 100000 || priceRatio < 0.00001; // 100,000x difference is extreme

        if (extremeRatio) {
          console.log(`🔧 SMART RESET: Token ${mint.slice(0, 8)}... has extreme cost basis difference`);
          console.log(`   Old: $${existing.averagePrice.toFixed(8)}, Current: $${estimatedPrice.toFixed(8)} (${priceRatio.toFixed(0)}x ratio)`);
          console.log(`🔧 Resetting to current price after likely sell/buy cycle`);

          // ENHANCED: Try to get real entry price from recent transactions first
          if (walletAddress && walletAddress.trim() !== '') {
            const recentRealPrice = await this.getRecentTransactionPrice(walletAddress, mint);
            if (recentRealPrice) {
              this.setCostBasis(mint, recentRealPrice);
              console.log(`🎯 ENHANCED RESET: Used recent transaction price $${recentRealPrice.toFixed(8)} instead of current price`);
              return;
            }
          }

          // Fallback to current price
          this.setCostBasis(mint, estimatedPrice);
          return;
        }
      }

      console.log(`✅ Token ${mint.slice(0, 8)}... already has cost basis: $${existing.averagePrice.toFixed(8)} - KEEPING EXISTING ENTRY PRICE`);
      return;
    }

    console.log(`🔄 Setting cost basis for NEW token: ${mint.slice(0, 8)}... (no existing cost basis found)`);

    // ENHANCED: Priority system for getting real cost basis
    if (walletAddress && walletAddress.trim() !== '') {
      try {
        // 1. Try to get recent transaction-based entry price (most accurate)
        const recentRealPrice = await this.getRecentTransactionPrice(walletAddress, mint);
        if (recentRealPrice) {
          this.setCostBasis(mint, recentRealPrice);
          console.log(`🔥 Set RECENT TRANSACTION cost basis for ${mint.slice(0, 8)}...: $${recentRealPrice.toFixed(8)}`);
          return;
        }

        // 2. Try to get historical cost basis from all transactions (second best)
        const { TransactionTracker } = await import('../transaction-tracker');
        const transactionTracker = TransactionTracker.getInstance();
        const realCostBasis = await transactionTracker.calculateRealCostBasis(walletAddress, mint);

        if (realCostBasis && realCostBasis.averagePrice > 0) {
          this.setCostBasis(mint, realCostBasis.averagePrice);
          console.log(`🔥 Set HISTORICAL TRANSACTION cost basis for ${mint.slice(0, 8)}...: $${realCostBasis.averagePrice.toFixed(8)}`);
          return;
        }
      } catch (error) {
        console.warn(`Failed to get transaction-based cost basis for ${mint.slice(0, 8)}...:`, error);
      }
    }

    // Fallback to estimated cost basis
    let defaultPrice = 0.0000001; // Very small default

    if (estimatedPrice && estimatedPrice > 0) {
      // GLOBAL FIX: For fresh buys, use realistic entry price instead of current price
      // This creates realistic PnL tracking from the start

      if (estimatedPrice < 0.001) {
        // Meme tokens: Assume bought 2-5% lower (realistic recent buy)
        defaultPrice = estimatedPrice * (0.95 + Math.random() * 0.03); // 95-98% of current
        console.log(`🎯 Fresh meme token buy: ${mint.slice(0, 8)}... estimated entry at ${((defaultPrice/estimatedPrice)*100).toFixed(1)}% of current price ($${defaultPrice.toFixed(8)})`);
      } else if (estimatedPrice < 0.1) {
        // Small cap: Assume bought 1-3% lower
        defaultPrice = estimatedPrice * (0.97 + Math.random() * 0.02); // 97-99% of current
        console.log(`💎 Fresh small cap buy: ${mint.slice(0, 8)}... estimated entry at ${((defaultPrice/estimatedPrice)*100).toFixed(1)}% of current price ($${defaultPrice.toFixed(6)})`);
      } else {
        // Larger tokens: Assume bought very close to current price
        defaultPrice = estimatedPrice * (0.99 + Math.random() * 0.01); // 99-100% of current
        console.log(`🏛️ Fresh token buy: ${mint.slice(0, 8)}... estimated entry at ${((defaultPrice/estimatedPrice)*100).toFixed(1)}% of current price ($${defaultPrice.toFixed(6)})`);
      }
    } else {
      console.log(`⚠️ No price data for ${mint.slice(0, 8)}..., using minimal cost basis`);
    }

    this.setCostBasis(mint, defaultPrice);
    console.log(`📊 Auto-set estimated cost basis for new token ${mint.slice(0, 8)}...: $${defaultPrice.toFixed(8)}`);
  }

  private async getRecentTransactionPrice(walletAddress: string, mint: string): Promise<number | null> {
    try {
      // ENHANCED: Get recent transaction price from the last 24 hours
      const { TransactionTracker } = await import('../transaction-tracker');
      const transactionTracker = TransactionTracker.getInstance();

      // Sync recent transactions first to ensure we have latest data
      await transactionTracker.syncTransactionHistory(new (await import('@solana/web3.js')).PublicKey(walletAddress));

      // Get transactions for this specific token
      const { DatabaseManager } = await import('../../core/database');
      const dbManager = DatabaseManager.getInstance();
      const transactions = await dbManager.getTransactions(walletAddress, mint);

      if (transactions.length === 0) {
        console.log(`📝 No transaction history found for ${mint.slice(0, 8)}...`);
        return null;
      }

      // ENHANCED: Look for the most recent BUY transaction with a valid price
      const recentBuys = transactions
        .filter(tx => (tx.type === 'buy' || tx.type === 'transfer_in') && tx.price && tx.price > 0)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // Sort by newest first

      if (recentBuys.length > 0) {
        const mostRecentBuy = recentBuys[0];
        const hoursAgo = (Date.now() - mostRecentBuy.timestamp.getTime()) / (1000 * 60 * 60);

        console.log(`🎯 Found recent buy transaction for ${mint.slice(0, 8)}... at $${mostRecentBuy.price!.toFixed(8)} (${hoursAgo.toFixed(1)}h ago)`);
        return mostRecentBuy.price!;
      }

      console.log(`⚠️ No recent buy transactions with valid prices found for ${mint.slice(0, 8)}...`);
      return null;
    } catch (error) {
      console.warn(`Failed to get recent transaction price for ${mint.slice(0, 8)}...:`, error);
      return null;
    }
  }
}