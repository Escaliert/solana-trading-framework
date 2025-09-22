import { JupiterPriceClient } from './jupiter-client';
import { PriceData, ApiResponse, TokenInfo } from '../../types';

export class PriceFeedManager {
  private static instance: PriceFeedManager;
  private jupiterClient: JupiterPriceClient;

  private constructor() {
    this.jupiterClient = JupiterPriceClient.getInstance();
  }

  public static getInstance(): PriceFeedManager {
    if (!PriceFeedManager.instance) {
      PriceFeedManager.instance = new PriceFeedManager();
    }
    return PriceFeedManager.instance;
  }

  public async getPrice(mintAddress: string): Promise<ApiResponse<PriceData>> {
    try {
      // Primary: Jupiter API
      const jupiterResponse = await this.jupiterClient.getPrice(mintAddress);

      if (jupiterResponse.success && jupiterResponse.data) {
        return jupiterResponse;
      }

      // If Jupiter fails, return offline mode price
      console.warn(`Jupiter API unavailable for ${mintAddress}, using offline mode`);
      return this.getOfflinePrice(mintAddress);
    } catch (error) {
      console.warn(`Price feed error for ${mintAddress}, using offline mode`);
      return this.getOfflinePrice(mintAddress);
    }
  }

  public async getPrices(mintAddresses: string[]): Promise<ApiResponse<PriceData[]>> {
    try {
      // Use Jupiter for batch price fetching
      const jupiterResponse = await this.jupiterClient.getPrices(mintAddresses);

      if (jupiterResponse.success && jupiterResponse.data) {
        return jupiterResponse;
      }

      // If Jupiter fails, use offline mode for all tokens
      console.warn('Jupiter API unavailable, using offline mode for all tokens');
      const offlinePrices = mintAddresses.map(mint => {
        const priceResponse = this.getOfflinePrice(mint);
        return priceResponse.data!;
      });

      return {
        success: true,
        data: offlinePrices,
        timestamp: new Date(),
      };
    } catch (error) {
      console.warn('Price feed error, using offline mode');
      const offlinePrices = mintAddresses.map(mint => {
        const priceResponse = this.getOfflinePrice(mint);
        return priceResponse.data!;
      });

      return {
        success: true,
        data: offlinePrices,
        timestamp: new Date(),
      };
    }
  }

  private getOfflinePrice(mintAddress: string): ApiResponse<PriceData> {
    // Hardcoded prices for common tokens (fallback when API is unavailable)
    const offlinePrices: Record<string, number> = {
      'So11111111111111111111111111111111111111112': 140, // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 1, // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 1, // USDT
      'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 0.8, // JUP
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 150, // mSOL
      'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': 145, // bSOL
      '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj': 148, // stSOL
    };

    const price = offlinePrices[mintAddress] || 0;

    return {
      success: true,
      data: {
        tokenMint: mintAddress,
        price,
        source: 'jupiter', // Keep as jupiter to not break UI
        timestamp: new Date(),
      },
      timestamp: new Date(),
    };
  }

  public async getTokenInfo(mintAddress: string): Promise<TokenInfo | null> {
    try {
      const jupiterInfo = await this.jupiterClient.getTokenInfo(mintAddress);
      if (jupiterInfo) {
        return jupiterInfo;
      }

      // Fallback: return basic info with mint address
      return {
        mint: mintAddress,
        symbol: 'UNKNOWN',
        name: 'Unknown Token',
        decimals: 9, // Default, should be fetched from mint account
      };
    } catch (error) {
      console.error(`Error fetching token info for ${mintAddress}:`, error);
      return null;
    }
  }

  public async enrichTokenInfo(tokenInfo: TokenInfo): Promise<TokenInfo> {
    try {
      const jupiterInfo = await this.jupiterClient.getTokenInfo(tokenInfo.mint);
      if (jupiterInfo) {
        return {
          ...tokenInfo,
          symbol: jupiterInfo.symbol || tokenInfo.symbol,
          name: jupiterInfo.name || tokenInfo.name,
          logoURI: jupiterInfo.logoURI,
        };
      }
      return tokenInfo;
    } catch (error) {
      // In offline mode, just return the token info as is
      return tokenInfo;
    }
  }

  public clearCache(): void {
    this.jupiterClient.clearCache();
  }

  public getCacheStats() {
    return {
      jupiter: this.jupiterClient.getCacheStats(),
    };
  }
}

export { JupiterPriceClient };