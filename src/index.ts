export { WalletManager } from './core/wallet-manager';
export { SolanaRpcClient } from './core/rpc-client';
export { ConfigManager } from './core/config';

export { PortfolioTracker } from './modules/portfolio-tracker';
export { PriceFeedManager, JupiterPriceClient } from './modules/price-feed';

export { Formatter } from './utils/formatter';

export * from './types';

// Example usage
async function example() {
  const { WalletManager } = await import('./core/wallet-manager');
  const { PortfolioTracker } = await import('./modules/portfolio-tracker');

  const walletManager = WalletManager.getInstance();
  const portfolioTracker = PortfolioTracker.getInstance();

  try {
    // Connect wallet
    await walletManager.connect();
    console.log('Wallet connected successfully');

    // Get portfolio
    const portfolio = await portfolioTracker.updatePortfolio();
    console.log('Portfolio:', portfolio);

  } catch (error) {
    console.error('Error:', error);
  }
}

if (require.main === module) {
  example();
}