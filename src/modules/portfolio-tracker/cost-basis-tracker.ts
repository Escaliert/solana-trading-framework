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

    if (!costBasis || !position.currentPrice) {
      return null;
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
}