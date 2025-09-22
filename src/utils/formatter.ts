import { Position, Portfolio } from '../types';

export class Formatter {
  public static formatCurrency(amount: number, decimals: number = 2): string {
    return `$${amount.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }

  public static formatPercent(percent: number, decimals: number = 2): string {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(decimals)}%`;
  }

  public static formatNumber(number: number, decimals: number = 2): string {
    return number.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  public static formatTokenAmount(amount: number, symbol: string, decimals: number = 4): string {
    return `${this.formatNumber(amount, decimals)} ${symbol}`;
  }

  public static formatTimestamp(date: Date): string {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  public static formatWalletAddress(address: string, start: number = 4, end: number = 4): string {
    if (address.length <= start + end) {
      return address;
    }
    return `${address.slice(0, start)}...${address.slice(-end)}`;
  }

  public static colorizePercentage(percent: number, text: string): string {
    if (percent > 0) {
      return `\x1b[32m${text}\x1b[0m`; // Green
    } else if (percent < 0) {
      return `\x1b[31m${text}\x1b[0m`; // Red
    } else {
      return `\x1b[37m${text}\x1b[0m`; // White
    }
  }

  public static colorizeValue(value: number, text: string): string {
    if (value > 0) {
      return `\x1b[32m${text}\x1b[0m`; // Green
    } else if (value < 0) {
      return `\x1b[31m${text}\x1b[0m`; // Red
    } else {
      return `\x1b[37m${text}\x1b[0m`; // White
    }
  }

  public static createTable(headers: string[], rows: string[][]): string {
    if (rows.length === 0) {
      return 'No data to display';
    }

    // Calculate column widths
    const colWidths = headers.map((header, i) => {
      const maxRowWidth = Math.max(...rows.map(row => (row[i] || '').length));
      return Math.max(header.length, maxRowWidth);
    });

    // Create separator
    const separator = '+' + colWidths.map(width => '-'.repeat(width + 2)).join('+') + '+';

    // Create header row
    const headerRow = '|' + headers.map((header, i) => {
      return ` ${header.padEnd(colWidths[i])} `;
    }).join('|') + '|';

    // Create data rows
    const dataRows = rows.map(row => {
      return '|' + row.map((cell, i) => {
        const cellStr = cell || '';
        return ` ${cellStr.padEnd(colWidths[i])} `;
      }).join('|') + '|';
    });

    return [separator, headerRow, separator, ...dataRows, separator].join('\n');
  }

  public static createPortfolioSummary(portfolio: Portfolio): string {
    const lines = [
      `Portfolio Summary - ${this.formatWalletAddress(portfolio.walletAddress)}`,
      `Last Updated: ${this.formatTimestamp(portfolio.lastUpdated)}`,
      '',
      `Total Portfolio Value: ${this.formatCurrency(portfolio.totalValue)}`,
      `SOL Balance: ${this.formatTokenAmount(portfolio.solBalance, 'SOL')}`,
      `Number of Positions: ${portfolio.positions.length}`,
    ];

    if (portfolio.totalUnrealizedPnL !== 0) {
      const pnlText = `${this.formatCurrency(Math.abs(portfolio.totalUnrealizedPnL))} (${this.formatPercent(portfolio.totalUnrealizedPnLPercent)})`;
      lines.push(`Unrealized P&L: ${this.colorizeValue(portfolio.totalUnrealizedPnL, pnlText)}`);
    }

    return lines.join('\n');
  }

  public static createPositionsTable(positions: Position[]): string {
    if (positions.length === 0) {
      return 'No token positions found.';
    }

    const headers = ['Token', 'Symbol', 'Amount', 'Price', 'Value', 'P&L', '%'];
    const rows = positions.map(position => {
      const value = (position.currentPrice || 0) * position.balanceUiAmount;
      const pnl = position.unrealizedPnL || 0;
      const pnlPercent = position.unrealizedPnLPercent || 0;

      return [
        position.tokenInfo.name.substring(0, 12), // Truncate long names
        position.tokenInfo.symbol.substring(0, 8),
        this.formatNumber(position.balanceUiAmount, 4),
        position.currentPrice ? this.formatCurrency(position.currentPrice, 6) : 'N/A',
        this.formatCurrency(value),
        pnl !== 0 ? this.colorizeValue(pnl, this.formatCurrency(Math.abs(pnl))) : 'N/A',
        pnlPercent !== 0 ? this.colorizePercentage(pnlPercent, this.formatPercent(pnlPercent)) : 'N/A',
      ];
    });

    return this.createTable(headers, rows);
  }
}