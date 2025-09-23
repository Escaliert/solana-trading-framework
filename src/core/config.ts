import dotenv from 'dotenv';
import { Config } from '../types';

dotenv.config();

export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): Config {
    const requiredEnvVars = ['SOLANA_RPC_URL', 'WALLET_PUBLIC_KEY'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    return {
      solana: {
        rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
        wsUrl: process.env.SOLANA_RPC_WS_URL || 'wss://api.mainnet-beta.solana.com',
      },
      wallet: {
        publicKey: process.env.WALLET_PUBLIC_KEY!,
      },
      apis: {
        jupiter: {
          baseUrl: process.env.JUPITER_API_URL || 'https://quote-api.jup.ag/v6',
        },
        birdeye: {
          ...(process.env.BIRDEYE_API_KEY && { apiKey: process.env.BIRDEYE_API_KEY }),
          baseUrl: process.env.BIRDEYE_API_URL || 'https://public-api.birdeye.so',
        },
      },
      settings: {
        portfolioRefreshInterval: parseInt(process.env.PORTFOLIO_REFRESH_INTERVAL || '5000'),
        priceCacheTtl: parseInt(process.env.PRICE_CACHE_TTL || '30000'),
        maxPositionSizePercent: parseFloat(process.env.MAX_POSITION_SIZE_PERCENT || '20'),
        defaultSlippagePercent: parseFloat(process.env.DEFAULT_SLIPPAGE_PERCENT || '1'),
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        ...(process.env.LOG_FILE && { file: process.env.LOG_FILE }),
      },
    };
  }

  public getConfig(): Config {
    return this.config;
  }

  public getSolanaConfig() {
    return this.config.solana;
  }

  public getWalletConfig() {
    return this.config.wallet;
  }

  public getApiConfig() {
    return this.config.apis;
  }

  public getSettings() {
    return this.config.settings;
  }

  public getLoggingConfig() {
    return this.config.logging;
  }

  public validateConfig(): boolean {
    try {
      if (!this.config.wallet.publicKey) {
        throw new Error('Wallet public key is required');
      }

      if (!this.config.solana.rpcUrl) {
        throw new Error('Solana RPC URL is required');
      }

      return true;
    } catch (error) {
      console.error('Configuration validation failed:', error);
      return false;
    }
  }
}

export const config = ConfigManager.getInstance().getConfig();