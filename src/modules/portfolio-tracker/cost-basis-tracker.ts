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
    const costBasis = this.getCostBasis(position.mintAddress);

    if (!costBasis) {
      return null;
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

    return position;
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

  public autoSetCostBasisForNewToken(mint: string, estimatedPrice?: number): void {
    const existing = this.getCostBasis(mint);
    if (existing) {
      console.log(`Token ${mint.slice(0, 8)}... already has cost basis: $${existing.averagePrice}`);
      return; // Already has cost basis
    }

    console.log(`Setting cost basis for new token: ${mint.slice(0, 8)}...`);

    // For new tokens, set a very small estimated cost basis
    // This could be improved with DEX price lookups
    let defaultPrice = 0.0000001; // Very small default

    if (estimatedPrice && estimatedPrice > 0) {
      defaultPrice = estimatedPrice;
    }

    // Check if it's a PumpFun token (ending with "pump")
    if (mint.endsWith('pump')) {
      defaultPrice = 0.0000001; // PumpFun tokens are usually very cheap initially
      console.log(`🎯 Detected PumpFun token: ${mint.slice(0, 8)}... setting micro cost basis`);
    }

    this.setCostBasis(mint, defaultPrice);
    console.log(`📊 Auto-set cost basis for new token ${mint.slice(0, 8)}...: $${defaultPrice}`);
  }
}