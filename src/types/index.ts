import { PublicKey } from '@solana/web3.js';

export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export interface Position {
  tokenInfo: TokenInfo;
  balance: number;
  balanceUiAmount: number;
  mintAddress: string;
  entryPrice?: number;
  currentPrice?: number;
  costBasis?: number;
  unrealizedPnL?: number;
  unrealizedPnLPercent?: number;
  portfolioPercent?: number;
  lastUpdated: Date;
}

export interface Portfolio {
  walletAddress: string;
  positions: Position[];
  totalValue: number;
  totalUnrealizedPnL: number;
  totalUnrealizedPnLPercent: number;
  solBalance: number;
  lastUpdated: Date;
}

export interface PriceData {
  tokenMint: string;
  price: number;
  priceChange24h?: number;
  priceChangePercent24h?: number;
  volume24h?: number;
  marketCap?: number;
  source: 'jupiter' | 'birdeye' | 'coingecko' | 'unknown';
  timestamp: Date;
}

export interface Config {
  solana: {
    rpcUrl: string;
    wsUrl: string;
  };
  wallet: {
    publicKey: string;
  };
  apis: {
    jupiter: {
      baseUrl: string;
    };
    birdeye: {
      apiKey?: string;
      baseUrl: string;
    };
  };
  settings: {
    portfolioRefreshInterval: number;
    priceCacheTtl: number;
    maxPositionSizePercent: number;
    defaultSlippagePercent: number;
  };
  logging: {
    level: string;
    file?: string;
  };
}

export interface PerformanceMetrics {
  totalReturn: number;
  totalReturnPercent: number;
  dayReturn: number;
  dayReturnPercent: number;
  weekReturn: number;
  weekReturnPercent: number;
  bestPerformer?: Position;
  worstPerformer?: Position;
  portfolioDiversification: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: Date;
  ttl: number;
}

export interface WalletConnection {
  publicKey: PublicKey;
  connected: boolean;
  isReadOnly: boolean;
}