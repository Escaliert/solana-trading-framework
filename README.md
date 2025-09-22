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
   npm run portfolio           # Show current portfolio
   npm run portfolio sync      # Sync blockchain transactions
   npm run portfolio history   # Show portfolio history
   npm run portfolio watch     # Real-time monitoring (rate-limited)
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
- Portfolio monitoring with SOL + SPL tokens
- Real-time price feeds (with offline fallback)
- **Database-driven P&L** calculation with real blockchain data
- **Transaction history sync** from Solana blockchain
- **Portfolio snapshots** and historical analysis
- **Jupiter trading integration** with swap simulation
- **Trading rules engine** (take-profit, stop-loss)
- **Automated trading strategies** (DCA, Grid, Rebalancing)
- **Strategy management** and automation framework
- **Backtesting framework** with performance metrics
- **Rate limiting** and comprehensive error handling
- **Enhanced CLI** interface with 11 commands

### Example Output:
```
Portfolio Summary - AA2d...x2R9
Total Portfolio Value: $10.50
Unrealized P&L: +$1.67 (+15.94%)

Token Positions:
| Token   | Amount | Price   | Value | P&L      | %        |
|---------|--------|---------|-------|----------|----------|
| SOL     | 0.0471 | $140.00 | $6.60 | +$0.94   | +16.67%  |
| JUP     | 4.8719 | $0.80   | $3.90 | +$0.73   | +23.08%  |

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