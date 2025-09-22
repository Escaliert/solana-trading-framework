import { PublicKey } from '@solana/web3.js';
import { SolanaRpcClient } from './rpc-client';
import { ConfigManager } from './config';
import { WalletConnection, Position, TokenInfo } from '../types';

export class WalletManager {
  private static instance: WalletManager;
  private rpcClient: SolanaRpcClient;
  private config: ConfigManager;
  private walletConnection: WalletConnection | null = null;

  private constructor() {
    this.rpcClient = SolanaRpcClient.getInstance();
    this.config = ConfigManager.getInstance();
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
      const tokenAccounts = await this.rpcClient.getParsedTokenAccounts(this.walletConnection.publicKey);
      const positions: Position[] = [];

      for (const account of tokenAccounts) {
        // Skip accounts with zero balance
        if (parseFloat(account.tokenAmount.amount) === 0) {
          continue;
        }

        // Get token metadata from RPC client
        const metadata = await this.rpcClient.getTokenMetadata(new PublicKey(account.mint));

        const tokenInfo: TokenInfo = {
          mint: account.mint,
          symbol: metadata.symbol,
          name: metadata.name,
          decimals: metadata.decimals,
        };

        const position: Position = {
          tokenInfo,
          balance: parseFloat(account.tokenAmount.amount),
          balanceUiAmount: parseFloat(account.tokenAmount.uiAmountString || '0'),
          mintAddress: account.mint,
          lastUpdated: new Date(),
        };

        positions.push(position);
      }

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