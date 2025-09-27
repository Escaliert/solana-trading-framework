import axios from 'axios';
import { ConfigManager } from '../../core/config';
import { PriceData, ApiResponse, CacheEntry } from '../../types';
import { RateLimiter } from '../../utils/rate-limiter';

interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  swapMode: string;
  priceImpactPct: string;
  slippageBps?: number;
  swapUsdValue?: string;
}

export class JupiterPriceClient {
  private static instance: JupiterPriceClient;
  private config: ConfigManager;
  private baseUrl: string;
  private priceCache: Map<string, CacheEntry<PriceData>> = new Map();
  private cacheTtl: number;
  private rateLimiter: RateLimiter;

  private constructor() {
    this.config = ConfigManager.getInstance();
    // Hardcode correct Jupiter URL temporarily to fix issue
    this.baseUrl = 'https://quote-api.jup.ag/v6';
    this.cacheTtl = this.config.getSettings().priceCacheTtl;
    // Jupiter API allows 1 req/sec, use conservative 1 req per 1.5s to avoid rate limits
    this.rateLimiter = new RateLimiter(1, 2000, 1500, false); // Jupiter: 1 req per 2s window, 1.5s delay
    console.log(`🔧 Jupiter Client using baseUrl: ${this.baseUrl}`);
  }

  public static getInstance(): JupiterPriceClient {
    // Force new instance to pick up config changes
    JupiterPriceClient.instance = new JupiterPriceClient();
    return JupiterPriceClient.instance;
  }

  public async getPrice(mintAddress: string): Promise<ApiResponse<PriceData>> {
    try {
      // SPECIAL CASE: USDC should always be $1.00
      if (mintAddress === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
        return {
          success: true,
          data: {
            tokenMint: mintAddress,
            price: 1.0,
            source: 'coingecko',
            timestamp: new Date(),
          },
          timestamp: new Date(),
        };
      }

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

      // Fallback to Jupiter Quote API if CoinGecko fails or token not mapped
      if (!priceData) {
        try {
          // Apply rate limiting before Jupiter API call
          await this.rateLimiter.waitIfNeeded();

          // Use Quote API to get price by converting 1M units to USDC
          const inputAmount = '1000000'; // 1M units (assumes 6 decimals = 1 token)
          const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

          // Direct call without RetryManager to test circuit breaker issue
          const response = await axios.get<JupiterQuoteResponse>(`${this.baseUrl}/quote`, {
            params: {
              inputMint: mintAddress,
              outputMint: usdcMint,
              amount: inputAmount,
              slippageBps: 50, // 0.5% slippage
            },
            timeout: 10000,
          });

          const quote = response.data;
          if (quote && quote.outAmount) {
            // Calculate price: (outAmount in USDC) / (inputAmount in tokens)
            const usdcAmount = parseInt(quote.outAmount) / 1e6; // USDC has 6 decimals
            const tokenAmount = parseInt(quote.inAmount) / 1e6; // Assume 6 decimals for input token

            const tokenPriceInUSD = usdcAmount / tokenAmount;

            priceData = {
              tokenMint: mintAddress,
              price: tokenPriceInUSD,
              source: 'jupiter',
              timestamp: new Date(),
            };

            console.log(`💰 Jupiter quote: ${tokenAmount} tokens → ${usdcAmount} USDC → $${tokenPriceInUSD.toFixed(6)} per token`);
          }
        } catch (jupiterError: any) {
          // GLOBAL FIX: Handle specific error codes gracefully
          if (jupiterError.response?.status === 400 &&
              jupiterError.response?.data?.errorCode === 'COULD_NOT_FIND_ANY_ROUTE') {
            console.log(`⚠️ No liquidity route found for ${mintAddress.slice(0, 8)}... - Token may be illiquid or new`);
            // Continue to fallback rather than logging as error
          } else {
            console.error(`🚨 Jupiter API Error for ${mintAddress.slice(0, 8)}...:`, jupiterError.message || jupiterError);
            if (jupiterError.response) {
              console.error(`🚨 Status: ${jupiterError.response.status}`);
            }
          }
        }
      }

      // AGGRESSIVE FALLBACK: Try alternative sources before giving up
      if (!priceData) {
        console.log(`🔍 Jupiter failed, trying alternative sources for ${mintAddress.slice(0, 8)}...`);

        // Try DexScreener API
        priceData = await this.tryDexScreenerPrice(mintAddress);

        // Try Birdeye API if DexScreener fails
        if (!priceData) {
          priceData = await this.tryBirdeyePrice(mintAddress);
        }

        // Last resort: Try to extract price from recent transactions
        if (!priceData) {
          priceData = await this.tryTransactionBasedPrice(mintAddress);
        }
      }

      // If STILL no price found, return placeholder (should be very rare now)
      if (!priceData) {
        console.warn(`❌ NO PRICE FOUND after all attempts for ${mintAddress.slice(0, 8)}... - This should rarely happen for tradeable tokens`);

        // Return a minimal response indicating no price available
        return {
          success: true,
          data: {
            tokenMint: mintAddress,
            price: 0, // 0 indicates no price available
            source: 'unknown',
            timestamp: new Date(),
          },
          timestamp: new Date(),
        };
      }

      // Cache the successful result
      this.setCachedPrice(mintAddress, priceData);

      // Record successful request for rate limiter
      this.rateLimiter.recordSuccess();

      return {
        success: true,
        data: priceData,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error(`Error fetching price for ${mintAddress}:`, error);
      this.rateLimiter.recordError();

      return {
        success: false,
        error: `Failed to fetch price: ${error}`,
        timestamp: new Date(),
      };
    }
  }

  public async getPrices(mintAddresses: string[]): Promise<ApiResponse<PriceData[]>> {
    try {
      const prices: PriceData[] = [];

      // Process each mint address sequentially to respect rate limits
      for (const mintAddress of mintAddresses) {
        const priceResponse = await this.getPrice(mintAddress);
        if (priceResponse.success && priceResponse.data) {
          prices.push(priceResponse.data);
        }
      }

      return {
        success: true,
        data: prices,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error fetching multiple prices:', error);
      return {
        success: false,
        error: `Failed to fetch prices: ${error}`,
        timestamp: new Date(),
      };
    }
  }

  private getCachedPrice(mintAddress: string): PriceData | null {
    const cacheEntry = this.priceCache.get(mintAddress);
    if (cacheEntry && Date.now() - cacheEntry.timestamp.getTime() < this.cacheTtl) {
      return cacheEntry.data;
    }
    return null;
  }

  private setCachedPrice(mintAddress: string, priceData: PriceData): void {
    this.priceCache.set(mintAddress, {
      data: priceData,
      timestamp: new Date(),
      ttl: this.cacheTtl,
    });
  }

  public async getTokenInfo(mintAddress: string): Promise<any> {
    try {
      // First try Jupiter's token list API
      const tokenList = await this.getJupiterTokenList();
      const token = tokenList.find((t: any) => t.address === mintAddress);

      if (token) {
        return {
          mint: mintAddress,
          symbol: token.symbol || 'Unknown',
          name: token.name || 'Unknown Token',
          decimals: token.decimals || 6,
          logoURI: token.logoURI,
        };
      }

      // Fallback to DexScreener for unknown tokens
      const dexScreenerInfo = await this.getDexScreenerTokenInfo(mintAddress);
      if (dexScreenerInfo) {
        return dexScreenerInfo;
      }

      // Last resort - return basic info with shortened address
      return {
        mint: mintAddress,
        symbol: mintAddress.slice(0, 4).toUpperCase(),
        name: `Token ${mintAddress.slice(0, 8)}...`,
        decimals: 6,
      };
    } catch (error) {
      console.warn(`Failed to get token info for ${mintAddress}:`, error);
      return {
        mint: mintAddress,
        symbol: 'Unknown',
        name: 'Unknown Token',
        decimals: 6,
      };
    }
  }

  private tokenListCache: any[] | null = null;
  private tokenListCacheExpiry: number = 0;

  private async getJupiterTokenList(): Promise<any[]> {
    try {
      // Use cache if still valid (1 hour TTL)
      if (this.tokenListCache && Date.now() < this.tokenListCacheExpiry) {
        return this.tokenListCache;
      }

      console.log('🔄 Fetching Jupiter token list...');
      const response = await axios.get('https://token.jup.ag/all', {
        timeout: 15000,
      });

      this.tokenListCache = response.data || [];
      this.tokenListCacheExpiry = Date.now() + (60 * 60 * 1000); // 1 hour

      console.log(`✅ Loaded ${this.tokenListCache?.length || 0} tokens from Jupiter`);
      return this.tokenListCache || [];
    } catch (error) {
      console.warn('Failed to fetch Jupiter token list:', error);
      return this.tokenListCache || [];
    }
  }

  private async getDexScreenerTokenInfo(mintAddress: string): Promise<any | null> {
    try {
      console.log(`🔍 Searching DexScreener for ${mintAddress.slice(0, 8)}...`);

      // Optimized rate limit: Reduced from 1000ms to 750ms for better performance
      await new Promise(resolve => setTimeout(resolve, 750));

      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`, {
        timeout: 10000,
      });

      const pairs = response.data?.pairs;
      if (pairs && pairs.length > 0) {
        const pair = pairs[0]; // Take the first/most liquid pair
        const token = pair.baseToken?.address === mintAddress ? pair.baseToken : pair.quoteToken;

        if (token) {
          console.log(`✅ Found on DexScreener: ${token.symbol} - ${token.name}`);
          return {
            mint: mintAddress,
            symbol: token.symbol || 'Unknown',
            name: token.name || 'Unknown Token',
            decimals: token.decimals || 6,
          };
        }
      }

      return null;
    } catch (error) {
      console.warn(`DexScreener lookup failed for ${mintAddress}:`, error);
      return null;
    }
  }

  private async tryDexScreenerPrice(mintAddress: string): Promise<any | null> {
    try {
      console.log(`🦅 Trying DexScreener price for ${mintAddress.slice(0, 8)}...`);

      await new Promise(resolve => setTimeout(resolve, 750)); // Optimized rate limit

      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`, {
        timeout: 10000,
      });

      const pairs = response.data?.pairs;
      if (pairs && pairs.length > 0) {
        // Find the most liquid pair (highest volume)
        const bestPair = pairs.reduce((best: any, current: any) => {
          const currentVolume = parseFloat(current.volume?.h24 || '0');
          const bestVolume = parseFloat(best?.volume?.h24 || '0');
          return currentVolume > bestVolume ? current : best;
        });

        if (bestPair?.priceUsd) {
          const price = parseFloat(bestPair.priceUsd);
          console.log(`✅ DexScreener price found: $${price.toFixed(8)} (24h vol: $${bestPair.volume?.h24 || '0'})`);

          return {
            tokenMint: mintAddress,
            price: price,
            source: 'dexscreener',
            timestamp: new Date(),
          };
        }
      }

      return null;
    } catch (error) {
      console.warn(`DexScreener price lookup failed for ${mintAddress.slice(0, 8)}...`);
      return null;
    }
  }

  private async tryBirdeyePrice(mintAddress: string): Promise<any | null> {
    try {
      console.log(`🐦 Trying Birdeye price for ${mintAddress.slice(0, 8)}...`);

      await new Promise(resolve => setTimeout(resolve, 750)); // Optimized rate limit

      // Birdeye public API (no key required for basic price data)
      const response = await axios.get(`https://public-api.birdeye.so/public/price`, {
        params: {
          address: mintAddress
        },
        timeout: 10000,
      });

      if (response.data?.data?.value) {
        const price = parseFloat(response.data.data.value);
        console.log(`✅ Birdeye price found: $${price.toFixed(8)}`);

        return {
          tokenMint: mintAddress,
          price: price,
          source: 'birdeye',
          timestamp: new Date(),
        };
      }

      return null;
    } catch (error) {
      console.warn(`Birdeye price lookup failed for ${mintAddress.slice(0, 8)}...`);
      return null;
    }
  }

  private async tryTransactionBasedPrice(mintAddress: string): Promise<any | null> {
    try {
      console.log(`🔗 Trying transaction-based price for ${mintAddress.slice(0, 8)}...`);

      // Get wallet address from wallet manager
      const { WalletManager } = await import('../../core/wallet-manager');
      const walletManager = WalletManager.getInstance();
      const publicKey = walletManager.getPublicKey();
      const walletAddress = publicKey ? publicKey.toBase58() : null;

      if (!walletAddress) {
        console.warn('No wallet address available for transaction analysis');
        return null;
      }

      // Get recent transactions for this wallet
      const { SolanaRpcClient } = await import('../../core/rpc-client');
      const rpcClient = SolanaRpcClient.getInstance();
      const connection = rpcClient.getConnection();

      // Get recent signatures (last 50 transactions)
      const signatures = await connection.getSignaturesForAddress(
        new (await import('@solana/web3.js')).PublicKey(walletAddress),
        { limit: 50 }
      );

      console.log(`🔍 Analyzing ${signatures.length} recent transactions for ${mintAddress.slice(0, 8)}...`);

      // Look for recent swap transactions involving this token
      for (const sigInfo of signatures.slice(0, 10)) { // Check only last 10 transactions for speed
        try {
          const transaction = await connection.getParsedTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0
          });

          if (!transaction) continue;

          // Look for Jupiter/DEX swap instructions
          const swapPrice = this.extractSwapPriceFromTransaction(transaction, mintAddress);
          if (swapPrice) {
            console.log(`🎯 Found recent swap price for ${mintAddress.slice(0, 8)}: $${swapPrice.toFixed(8)}`);
            return {
              tokenMint: mintAddress,
              price: swapPrice,
              source: 'transaction-history',
              timestamp: new Date(),
            };
          }

          // Rate limit between transaction checks
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (txError) {
          console.warn(`Failed to analyze transaction ${sigInfo.signature.slice(0, 8)}...`);
          continue;
        }
      }

      return null;
    } catch (error) {
      console.warn(`Transaction-based price lookup failed for ${mintAddress.slice(0, 8)}...:`, error);
      return null;
    }
  }

  private extractSwapPriceFromTransaction(transaction: any, targetMint: string): number | null {
    try {
      const instructions = transaction.transaction?.message?.instructions || [];

      for (const instruction of instructions) {
        // Look for token transfers in parsed instructions
        if (instruction.parsed?.type === 'transfer' || instruction.parsed?.type === 'transferChecked') {
          const info = instruction.parsed.info;

          // Check if this involves our target token
          if (info?.mint === targetMint) {
            const amount = parseFloat(info.tokenAmount?.uiAmount || info.amount || '0');

            // Look for corresponding SOL or USDC transfer to calculate price
            // This is a simplified approach - real implementation would be more sophisticated
            if (amount > 0) {
              // For now, return null - full implementation would analyze the entire swap
              // This requires more complex parsing of Jupiter/DEX program instructions
              return null;
            }
          }
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  public clearCache(): void {
    this.priceCache.clear();
  }

  public getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.priceCache.size,
      hitRate: 0, // Simplified - could track hits/misses
    };
  }

  private getCoingeckoId(mintAddress: string): string | null {
    // Mapping of common Solana token mints to CoinGecko IDs
    const coingeckoMapping: Record<string, string> = {
      'So11111111111111111111111111111111111111112': 'solana', // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'usd-coin', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'tether', // USDT
      'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'jupiter-exchange-solana', // JUP
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'msol', // mSOL
      'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': 'blazestake-staked-sol', // bSOL
      '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj': 'lido-staked-sol', // stSOL
    };

    return coingeckoMapping[mintAddress] || null;
  }
}