import axios from 'axios';
import { ConfigManager } from '../../core/config';
import { PriceData, ApiResponse, CacheEntry } from '../../types';
import { RetryManager } from '../../utils/rate-limiter';

interface JupiterPriceResponse {
  data: {
    [mint: string]: {
      id: string;
      mintSymbol: string;
      vsToken: string;
      vsTokenSymbol: string;
      price: number;
    };
  };
  timeTaken: number;
}

export class JupiterPriceClient {
  private static instance: JupiterPriceClient;
  private config: ConfigManager;
  private baseUrl: string;
  private priceCache: Map<string, CacheEntry<PriceData>> = new Map();
  private cacheTtl: number;

  private constructor() {
    this.config = ConfigManager.getInstance();
    this.baseUrl = this.config.getApiConfig().jupiter.baseUrl;
    this.cacheTtl = this.config.getSettings().priceCacheTtl;
  }

  public static getInstance(): JupiterPriceClient {
    if (!JupiterPriceClient.instance) {
      JupiterPriceClient.instance = new JupiterPriceClient();
    }
    return JupiterPriceClient.instance;
  }

  public async getPrice(mintAddress: string): Promise<ApiResponse<PriceData>> {
    try {
      // Check cache first
      const cached = this.getCachedPrice(mintAddress);
      if (cached) {
        return {
          success: true,
          data: cached,
          timestamp: new Date(),
        };
      }

      // Try CoinGecko first for major tokens (more reliable)
      let priceData: PriceData | null = null;
      const coingeckoId = this.getCoingeckoId(mintAddress);
      if (coingeckoId) {
        try {
          const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price`, {
            params: {
              ids: coingeckoId,
              vs_currencies: 'usd'
            },
            timeout: 10000,
          });

          const price = response.data[coingeckoId]?.usd;
          if (price) {
            priceData = {
              tokenMint: mintAddress,
              price: price,
              source: 'coingecko',
              timestamp: new Date(),
            };
          }
        } catch (coingeckoError) {
          console.warn(`CoinGecko failed for ${mintAddress}, trying Jupiter fallback`);
        }
      }

      // Fallback to Jupiter API if CoinGecko fails or token not mapped
      if (!priceData) {
        try {
          const response = await RetryManager.withRetry(async () => {
            return await axios.get<JupiterPriceResponse>(`${this.baseUrl}/price`, {
              params: {
                ids: mintAddress,
              },
              timeout: 10000,
            });
          });

          const priceInfo = response.data.data[mintAddress];
          if (priceInfo) {
            priceData = {
              tokenMint: mintAddress,
              price: priceInfo.price,
              source: 'jupiter',
              timestamp: new Date(),
            };
          }
        } catch (jupiterError) {
          console.warn(`Jupiter API also failed for ${mintAddress}`);
        }
      }

      if (!priceData) {
        return {
          success: false,
          error: `Price not found for token: ${mintAddress}`,
          timestamp: new Date(),
        };
      }

      // Cache the result
      this.setCachedPrice(mintAddress, priceData);

      return {
        success: true,
        data: priceData,
        timestamp: new Date(),
      };
    } catch (error) {
      // Reduce error noise for network issues
      if (error instanceof Error && error.message.includes('ENOTFOUND')) {
        return {
          success: false,
          error: 'Price APIs unavailable',
          timestamp: new Date(),
        };
      }
      console.error(`Error fetching price for ${mintAddress}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  public async getPrices(mintAddresses: string[]): Promise<ApiResponse<PriceData[]>> {
    try {
      // Check cache for all tokens
      const cachedPrices: PriceData[] = [];
      const uncachedMints: string[] = [];

      for (const mint of mintAddresses) {
        const cached = this.getCachedPrice(mint);
        if (cached) {
          cachedPrices.push(cached);
        } else {
          uncachedMints.push(mint);
        }
      }

      // Fetch uncached prices individually to handle mixed Jupiter/CoinGecko responses
      const freshPrices: PriceData[] = [];
      if (uncachedMints.length > 0) {
        for (const mint of uncachedMints) {
          const priceResponse = await this.getPrice(mint);
          if (priceResponse.success && priceResponse.data) {
            freshPrices.push(priceResponse.data);
          } else {
            // Add zero price for tokens that couldn't be priced
            freshPrices.push({
              tokenMint: mint,
              price: 0,
              source: 'unknown' as const,
              timestamp: new Date(),
            });
          }
        }
      }

      const allPrices = [...cachedPrices, ...freshPrices];

      return {
        success: true,
        data: allPrices,
        timestamp: new Date(),
      };
    } catch (error) {
      // Reduce error noise for network issues
      if (error instanceof Error && error.message.includes('ENOTFOUND')) {
        return {
          success: false,
          error: 'Price APIs unavailable',
          timestamp: new Date(),
        };
      }
      console.error('Error fetching prices:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  public async getTokenInfo(mintAddress: string) {
    try {
      // Jupiter doesn't provide detailed token info in price API
      // This would need to be enhanced with Jupiter's token list API
      const response = await axios.get(`${this.baseUrl}/tokens`, {
        timeout: 10000,
      });

      // Find token in the list (simplified implementation)
      const tokenList = response.data;
      const token = tokenList.find((t: any) => t.address === mintAddress);

      if (token) {
        return {
          mint: mintAddress,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          logoURI: token.logoURI,
        };
      }

      return null;
    } catch (error) {
      // Silently fail for network issues
      if (error instanceof Error && error.message.includes('ENOTFOUND')) {
        return null;
      }
      console.error(`Error fetching token info from Jupiter for ${mintAddress}:`, error);
      return null;
    }
  }

  private getCachedPrice(mintAddress: string): PriceData | null {
    const cached = this.priceCache.get(mintAddress);
    if (!cached) {
      return null;
    }

    const now = Date.now();
    const cacheAge = now - cached.timestamp.getTime();

    if (cacheAge > cached.ttl) {
      this.priceCache.delete(mintAddress);
      return null;
    }

    return cached.data;
  }

  private setCachedPrice(mintAddress: string, priceData: PriceData): void {
    this.priceCache.set(mintAddress, {
      data: priceData,
      timestamp: new Date(),
      ttl: this.cacheTtl,
    });
  }

  public clearCache(): void {
    this.priceCache.clear();
  }

  public getCacheStats() {
    return {
      size: this.priceCache.size,
      entries: Array.from(this.priceCache.keys()),
    };
  }

  private getCoingeckoId(mintAddress: string): string | null {
    const mapping: { [key: string]: string } = {
      'So11111111111111111111111111111111111111112': 'solana', // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'usd-coin', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'tether', // USDT
      'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'jupiter-exchange-solana', // JUP
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'marinade-staked-sol', // mSOL
      'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': 'blazestake-staked-sol', // bSOL
    };

    return mapping[mintAddress] || null;
  }
}