import { Position } from '../types';

export const DUST_THRESHOLDS = {
  SOL_DUST_THRESHOLD: 0.001, // 0.001 SOL (minimal für Gebühren)
  USD_DUST_THRESHOLD: 0.01,  // $0.01 USD value
};

export class DustFilter {
  public static isSolDust(solAmount: number): boolean {
    return solAmount < DUST_THRESHOLDS.SOL_DUST_THRESHOLD;
  }

  public static isTokenDust(position: Position): boolean {
    // Check if token value is dust based on USD value
    const tokenValue = (position.balanceUiAmount || 0) * (position.currentPrice || 0);
    return tokenValue < DUST_THRESHOLDS.USD_DUST_THRESHOLD;
  }

  public static filterDustPositions(positions: Position[]): {
    tradeable: Position[];
    dust: Position[];
  } {
    const tradeable: Position[] = [];
    const dust: Position[] = [];

    for (const position of positions) {
      // Check for SOL specifically
      if (position.mintAddress === 'So11111111111111111111111111111111111111112') {
        if (this.isSolDust(position.balanceUiAmount || 0)) {
          dust.push(position);
        } else {
          tradeable.push(position);
        }
      } else {
        // Check for token dust
        if (this.isTokenDust(position)) {
          dust.push(position);
        } else {
          tradeable.push(position);
        }
      }
    }

    return { tradeable, dust };
  }

  public static filterTradingOpportunities(positions: Position[], minTradeValue: number = 0.01): Position[] {
    return positions.filter(position => {
      // For SOL, use SOL dust threshold - nur 0.001 SOL für Gebühren reservieren
      if (position.mintAddress === 'So11111111111111111111111111111111111111112') {
        return !this.isSolDust(position.balanceUiAmount || 0);
      }

      // Für alle anderen Token: Nur sehr kleine Werte (< $0.01) als Dust betrachten
      const tokenValue = (position.balanceUiAmount || 0) * (position.currentPrice || 0);
      return tokenValue >= minTradeValue;
    });
  }

  public static formatDustSummary(dustPositions: Position[]): string {
    if (dustPositions.length === 0) {
      return '✨ No dust positions found';
    }

    const solDust = dustPositions.filter(p =>
      p.mintAddress === 'So11111111111111111111111111111111111111112'
    );

    const tokenDust = dustPositions.filter(p =>
      p.mintAddress !== 'So11111111111111111111111111111111111111112'
    );

    let summary = `🗑️ Found ${dustPositions.length} dust positions:\n`;

    if (solDust.length > 0) {
      summary += `  • SOL dust: ${solDust.length} positions (< ${DUST_THRESHOLDS.SOL_DUST_THRESHOLD} SOL)\n`;
    }

    if (tokenDust.length > 0) {
      summary += `  • Token dust: ${tokenDust.length} positions (< $${DUST_THRESHOLDS.USD_DUST_THRESHOLD})\n`;
    }

    return summary;
  }

  public static shouldSkipTrading(position: Position, minimumTradeValue: number = 5.0): boolean {
    // Check if position is below minimum trading threshold
    if (position.mintAddress === 'So11111111111111111111111111111111111111112') {
      // For SOL, we need at least enough to cover fees + minimum trade
      return (position.balanceUiAmount || 0) < (DUST_THRESHOLDS.SOL_DUST_THRESHOLD + 0.01);
    }

    // For tokens, check if USD value is below minimum
    const tokenValue = (position.balanceUiAmount || 0) * (position.currentPrice || 0);
    return tokenValue < minimumTradeValue;
  }
}