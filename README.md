# Solana Trading Framework

A modular TypeScript framework for Solana portfolio monitoring, analytics, and automated trading.

## Features

### Phase 1 - Core Portfolio Monitoring ✅ **COMPLETED**
- ✅ Project setup with TypeScript and modular architecture
- ✅ Wallet connection and SPL token detection
- ✅ Real-time price feeds (Jupiter API + Offline mode)
- ✅ P&L calculation and position tracking
- ✅ CLI interface for portfolio overview
- ✅ SOL balance integration in portfolio table
- ✅ Cost basis tracking with unrealized P&L

### Phase 2 - Enhanced Analytics & Persistence ✅ **COMPLETED**
- ✅ SQLite database for local storage
- ✅ Real transaction history tracking from Solana blockchain
- ✅ Database-driven cost basis calculation
- ✅ Portfolio snapshots for historical analysis
- ✅ Enhanced CLI with sync and history commands

### Phase 3 - Trading Engine Foundation ✅ **COMPLETED**
- ✅ Jupiter Aggregator API integration
- ✅ Swap quote functionality with simulation
- ✅ Trading rules engine (take-profit, stop-loss)
- ✅ Rate limiting and retry mechanisms
- ✅ Comprehensive safety and risk management

### Phase 4 - Automated Trading Strategies ✅ **COMPLETED**
- ✅ DCA (Dollar Cost Averaging) strategy engine
- ✅ Grid Trading with buy/sell ladders
- ✅ Portfolio Rebalancing automation
- ✅ Strategy management and automation framework
- ✅ Backtesting framework with performance metrics

### Future Phases
- **Phase 5**: Web dashboard and advanced features
- **Phase 6**: Production readiness and scaling
- **Phase 7**: AI/ML integrations and external APIs

## Quick Start

1. **Clone and setup**:
   ```bash
   npm install
   cp .env.example .env
   ```

2. **Configure your wallet**:
   The `.env` file is already configured with a demo wallet:
   ```
   WALLET_PUBLIC_KEY=AA2doirEUhdVoAHueKNDBDt4N3nKLYiJh3e2CRWSx2R9
   ```
   Replace with your own wallet public key if needed.

3. **Run portfolio monitoring**:
   ```bash
   # Rate-limit safe commands (fast, reliable)
   npm run portfolio           # Quick portfolio status (15s) ⚡
   npm run portfolio status    # Quick portfolio status (15s) ⚡
   npm run portfolio show      # Portfolio with metadata (20s) ⚡

   # Full sync operations (slower, rate-limited)
   npm run portfolio sync      # Sync blockchain transactions 🐌
   npm run portfolio watch     # Real-time monitoring
   npm run portfolio history   # Show portfolio history

   # Trading and analysis
   npm run portfolio rules     # Show trading rules
   npm run portfolio simulate SOL USDC 0.1  # Simulate swap
   npm run portfolio strategies # Show automated strategies
   npm run portfolio strategy create-dca SOL 10 24  # Create DCA strategy
   ```

## Project Structure

```
src/
├── core/               # Core system components
│   ├── wallet-manager.ts
│   ├── rpc-client.ts
│   └── config.ts
├── modules/            # Feature modules
│   ├── portfolio-tracker/
│   ├── price-feed/
│   └── analytics/
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── cli/                # Command-line interfaces
```

## Scripts

- `npm run dev` - Development mode with auto-reload
- `npm run build` - Build for production
- `npm run start` - Run built application
- `npm run portfolio` - Run portfolio CLI tool

## Security

- This framework only requires **read-only** access to your wallet
- Private keys are never stored or transmitted
- All transactions include simulation before execution
- Environment variables keep sensitive data secure

## Current Status

**Phase 1, 2, 3 & 4 are COMPLETE and fully functional!** 🎉

### Working Features:
- **Portfolio monitoring** with complete SPL token detection
- **Rate-limit safe commands** - Fast, reliable portfolio views (15-20s)
- **Database-driven P&L** calculation with real blockchain data
- **Transaction history sync** - Explicit sync command for blockchain data
- **Portfolio snapshots** and historical analysis
- **Jupiter trading integration** with swap simulation
- **Trading rules engine** (take-profit, stop-loss)
- **Automated trading strategies** (DCA, Grid, Rebalancing)
- **Strategy management** and automation framework
- **Backtesting framework** with performance metrics
- **Enhanced CLI** interface with optimized command structure
- 🆕 **Complete token detection** - All tokens in wallet (including empty/swapped)
- 🆕 **PumpFun token support** - Auto-recognizes and tracks pump tokens
- 🆕 **Ultra-robust rate limiting** - Circuit breaker + exponential backoff
- 🆕 **Smart cost basis tracking** - Automatic cost basis for new tokens
- 🆕 **Architectural optimization** - Clean separation of fast vs. sync operations

### Example Output:
```
Portfolio Summary - AA2d...x2R9
Last Updated: 09/22/2025, 11:43:42 AM

Total Portfolio Value: $12.22
SOL Balance: 0.0439 SOL
Number of Positions: 3
Unrealized P&L: $3.60 (+29.46%)

Token Positions:
| Token        | Symbol | Amount         | Price       | Value | P&L      | %        |
|--------------|--------|----------------|-------------|-------|----------|----------|
| Solana       | SOL    | 0.0439         | $221.550000 | $9.72 | +$4.46   | +84.63%  |
| Token CAnihS | CANI   | 1,838,613.2257 | N/A         | $0.00 | N/A      | N/A      |
| Jupiter      | JUP    | 4.8719         | $0.473911   | $2.31 | -$0.86   | -27.09%  |

💎 Profit Taking Analysis:
🎯 PROFIT TAKING OPPORTUNITIES:
1. SOL: +84.6%
   Entry: $120.0000 → Current: $221.5500
   💰 SELL - Excellent profit opportunity

🔥 1 token(s) with 50%+ profit - Consider taking profits!

Portfolio History:
09/21/2025, 01:48:24 PM | Value: $10.50 | P&L: +$1.67 | Positions: 3
```

### Available Commands:
```bash
# Portfolio Commands
npm run portfolio           # Show current portfolio
npm run portfolio sync      # Sync blockchain transactions
npm run portfolio history   # Show portfolio history
npm run portfolio watch     # Real-time monitoring

# Trading Commands
npm run portfolio rules     # Show trading rules
npm run portfolio simulate SOL USDC 0.1  # Simulate swap

# Strategy Commands (Phase 4)
npm run portfolio strategies # Show automated strategies
npm run portfolio strategy create-dca SOL 10 24  # Create DCA strategy
npm run portfolio strategy start # Start automation
npm run portfolio help      # Full command reference
```

## Development Continuation

See `PHASE_4_COMPLETE.md` for the latest session and complete Phase 4 documentation.

**Ready for Phase 5:** Web dashboard, advanced analytics, and production features.