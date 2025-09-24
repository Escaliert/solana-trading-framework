import { PublicKey } from '@solana/web3.js';
import { SolanaRpcClient } from './rpc-client';
import { ConfigManager } from './config';
import { WalletConnection, Position, TokenInfo } from '../types';
import { PriceFeedManager } from '../modules/price-feed';

export class WalletManager {
  private static instance: WalletManager;
  private rpcClient: SolanaRpcClient;
  private config: ConfigManager;
  private priceFeedManager: PriceFeedManager;
  private walletConnection: WalletConnection | null = null;

  private constructor() {
    this.rpcClient = SolanaRpcClient.getInstance();
    this.config = ConfigManager.getInstance();
    this.priceFeedManager = PriceFeedManager.getInstance();
  }

  public static getInstance(): WalletManager {
    if (!WalletManager.instance) {
      WalletManager.instance = new WalletManager();
    }
    return WalletManager.instance;
  }

  public async connect(): Promise<WalletConnection> {
    try {
      const walletConfig = this.config.getWalletConfig();
      const publicKey = new PublicKey(walletConfig.publicKey);

      // Validate that the public key is valid by attempting to fetch balance
      await this.rpcClient.getBalance(publicKey);

      this.walletConnection = {
        publicKey,
        connected: true,
        isReadOnly: true,
      };

      console.log(`Connected to wallet: ${publicKey.toBase58()}`);
      return this.walletConnection;
    } catch (error) {
      console.error('Failed to connect to wallet:', error);
      throw new Error(`Invalid wallet public key: ${error}`);
    }
  }

  public getConnection(): WalletConnection | null {
    return this.walletConnection;
  }

  public isConnected(): boolean {
    return this.walletConnection?.connected || false;
  }

  public getPublicKey(): PublicKey | null {
    return this.walletConnection?.publicKey || null;
  }

  public async getSolBalance(): Promise<number> {
    if (!this.isConnected() || !this.walletConnection) {
      throw new Error('Wallet not connected');
    }

    try {
      return await this.rpcClient.getBalance(this.walletConnection.publicKey);
    } catch (error) {
      console.error('Error fetching SOL balance:', error);
      throw error;
    }
  }

  public async getAllTokenPositions(): Promise<Position[]> {
    if (!this.isConnected() || !this.walletConnection) {
      throw new Error('Wallet not connected');
    }

    try {
      // Get ALL token accounts including those with zero balances
      const tokenAccounts = await this.rpcClient.getParsedTokenAccounts(this.walletConnection.publicKey);
      const positions: Position[] = [];

      console.log(`Found ${tokenAccounts.length} token accounts in wallet`);

      // SPAM FILTER: Separate tradable tokens from spam
      const tradableTokens = tokenAccounts.filter(account => {
        const balance = parseFloat(account.tokenAmount.uiAmountString || '0');
        return balance > 0; // Only process tokens with actual balance
      });

      const zeroBalanceTokens = tokenAccounts.filter(account => {
        const balance = parseFloat(account.tokenAmount.uiAmountString || '0');
        return balance === 0;
      });

      console.log(`💰 Processing ${tradableTokens.length} tradable tokens, skipping ${zeroBalanceTokens.length} zero-balance tokens`);

      // Process tradable tokens with full metadata
      for (const account of tradableTokens) {
        try {
          // Add delay before each metadata request to prevent rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));

          // Get comprehensive token info from Jupiter/DexScreener
          const tokenInfo = await this.priceFeedManager.getTokenInfo(account.mint);

          const finalTokenInfo: TokenInfo = tokenInfo ? {
            mint: account.mint,
            symbol: tokenInfo.symbol || 'Unknown',
            name: tokenInfo.name || 'Unknown Token',
            decimals: tokenInfo.decimals || account.tokenAmount.decimals,
          } : {
            mint: account.mint,
            symbol: account.mint.slice(0, 4).toUpperCase(),
            name: `Token ${account.mint.slice(0, 8)}...`,
            decimals: account.tokenAmount.decimals,
          };

          const balance = parseFloat(account.tokenAmount.amount) || 0;
          const uiBalance = parseFloat(account.tokenAmount.uiAmountString || '0') || 0;

          const position: Position = {
            tokenInfo: finalTokenInfo,
            balance,
            balanceUiAmount: uiBalance,
            mintAddress: account.mint,
            lastUpdated: new Date(),
          };

          positions.push(position);

          console.log(`✅ Token found: ${finalTokenInfo.symbol} - Balance: ${uiBalance}`);
        } catch (error) {
          console.warn(`Failed to get metadata for token ${account.mint}:`, error);

          // Still include the token even without metadata
          const uiBalance = parseFloat(account.tokenAmount.uiAmountString || '0') || 0;
          const position: Position = {
            tokenInfo: {
              mint: account.mint,
              symbol: 'Unknown',
              name: 'Unknown Token',
              decimals: account.tokenAmount.decimals,
            },
            balance: parseFloat(account.tokenAmount.amount) || 0,
            balanceUiAmount: uiBalance,
            mintAddress: account.mint,
            lastUpdated: new Date(),
          };

          positions.push(position);
          console.log(`⚠️ Unknown token added: ${account.mint.slice(0, 8)}... - Balance: ${uiBalance}`);
        }
      }

      // OPTIMIZED: Add zero-balance tokens without expensive metadata calls for spam detection
      for (const account of zeroBalanceTokens) {
        const position: Position = {
          tokenInfo: {
            mint: account.mint,
            symbol: 'DUST',
            name: 'Dust Token',
            decimals: account.tokenAmount.decimals,
          },
          balance: 0,
          balanceUiAmount: 0,
          mintAddress: account.mint,
          lastUpdated: new Date(),
        };

        positions.push(position);
      }

      console.log(`🗑️ Added ${zeroBalanceTokens.length} dust tokens without metadata lookup`);

      console.log(`📊 Total positions detected: ${positions.length}`);
      return positions;
    } catch (error) {
      console.error('Error fetching token positions:', error);
      throw error;
    }
  }

  public async getTokenBalance(mintAddress: string): Promise<number> {
    if (!this.isConnected() || !this.walletConnection) {
      throw new Error('Wallet not connected');
    }

    try {
      const tokenAccounts = await this.rpcClient.getParsedTokenAccounts(this.walletConnection.publicKey);
      const account = tokenAccounts.find(acc => acc.mint === mintAddress);

      if (!account) {
        return 0;
      }

      return parseFloat(account.tokenAmount.uiAmountString || '0');
    } catch (error) {
      console.error(`Error fetching balance for token ${mintAddress}:`, error);
      throw error;
    }
  }

  public async refreshBalances(): Promise<{ sol: number; tokens: Position[] }> {
    if (!this.isConnected()) {
      throw new Error('Wallet not connected');
    }

    try {
      const [solBalance, tokenPositions] = await Promise.all([
        this.getSolBalance(),
        this.getAllTokenPositions(),
      ]);

      return {
        sol: solBalance,
        tokens: tokenPositions,
      };
    } catch (error) {
      console.error('Error refreshing balances:', error);
      throw error;
    }
  }

  public disconnect(): void {
    this.walletConnection = null;
    console.log('Wallet disconnected');
  }

  public async validateConnection(): Promise<boolean> {
    if (!this.walletConnection) {
      return false;
    }

    try {
      await this.rpcClient.getBalance(this.walletConnection.publicKey);
      return true;
    } catch (error) {
      console.error('Wallet connection validation failed:', error);
      this.disconnect();
      return false;
    }
  }
}