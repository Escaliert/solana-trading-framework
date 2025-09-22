import { Connection, PublicKey, ParsedAccountData, GetProgramAccountsFilter } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, AccountLayout } from '@solana/spl-token';
import { ConfigManager } from './config';

export class SolanaRpcClient {
  private static instance: SolanaRpcClient;
  private connection: Connection;
  private config: ConfigManager;

  private constructor() {
    this.config = ConfigManager.getInstance();
    const solanaConfig = this.config.getSolanaConfig();
    this.connection = new Connection(solanaConfig.rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: solanaConfig.wsUrl,
    });
  }

  public static getInstance(): SolanaRpcClient {
    if (!SolanaRpcClient.instance) {
      SolanaRpcClient.instance = new SolanaRpcClient();
    }
    return SolanaRpcClient.instance;
  }

  public getConnection(): Connection {
    return this.connection;
  }

  public async getBalance(publicKey: PublicKey): Promise<number> {
    try {
      const balance = await this.connection.getBalance(publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      console.error('Error fetching SOL balance:', error);
      throw error;
    }
  }

  public async getTokenAccounts(walletAddress: PublicKey) {
    try {
      const filters: GetProgramAccountsFilter[] = [
        {
          dataSize: 165, // Size of account (AccountLayout)
        },
        {
          memcmp: {
            offset: 32, // Owner field offset
            bytes: walletAddress.toBase58(),
          },
        },
      ];

      const accounts = await this.connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
        filters: filters,
        encoding: 'base64',
      });

      return accounts.map(account => {
        const accountData = AccountLayout.decode(account.account.data);
        return {
          pubkey: account.pubkey,
          mint: new PublicKey(accountData.mint),
          owner: new PublicKey(accountData.owner),
          amount: accountData.amount,
          delegate: accountData.delegateOption ? new PublicKey(accountData.delegate) : null,
          state: accountData.state,
          isNative: accountData.isNativeOption ? accountData.isNative : null,
          delegatedAmount: accountData.delegatedAmount,
          closeAuthority: accountData.closeAuthorityOption ? new PublicKey(accountData.closeAuthority) : null,
        };
      });
    } catch (error) {
      console.error('Error fetching token accounts:', error);
      throw error;
    }
  }

  public async getParsedTokenAccounts(walletAddress: PublicKey) {
    try {
      const response = await this.connection.getParsedTokenAccountsByOwner(
        walletAddress,
        {
          programId: TOKEN_PROGRAM_ID,
        },
        'confirmed'
      );

      return response.value.map(accountInfo => {
        const parsedData = accountInfo.account.data as ParsedAccountData;
        const info = parsedData.parsed.info;

        return {
          pubkey: accountInfo.pubkey,
          mint: info.mint,
          owner: info.owner,
          tokenAmount: info.tokenAmount,
          state: info.state,
          isNative: info.isNative,
          rentExemptReserve: info.rentExemptReserve,
        };
      });
    } catch (error) {
      console.error('Error fetching parsed token accounts:', error);
      throw error;
    }
  }

  public async getTokenMetadata(mintAddress: PublicKey) {
    try {
      const accountInfo = await this.connection.getAccountInfo(mintAddress);
      if (!accountInfo) {
        return {
          mint: mintAddress.toBase58(),
          decimals: 6,
          name: 'Unknown Token',
          symbol: 'UNK',
        };
      }

      // Parse mint account to get decimals
      let decimals = 6; // default
      try {
        // Mint account data layout: [36 bytes mint authority] [4 bytes supply] [1 byte decimals] [...]
        if (accountInfo.data.length >= 44) {
          decimals = accountInfo.data[44];
        }
      } catch (error) {
        console.warn('Could not parse mint decimals:', error);
      }

      // Check for known token mints with hardcoded metadata
      const knownTokens = this.getKnownTokenMetadata();
      const mintStr = mintAddress.toBase58();

      if (knownTokens[mintStr]) {
        return {
          mint: mintStr,
          decimals: knownTokens[mintStr].decimals || decimals,
          name: knownTokens[mintStr].name,
          symbol: knownTokens[mintStr].symbol,
        };
      }

      return {
        mint: mintStr,
        decimals,
        name: 'Unknown Token',
        symbol: 'UNK',
      };
    } catch (error) {
      console.error('Error fetching token metadata:', error);
      return {
        mint: mintAddress.toBase58(),
        decimals: 6,
        name: 'Unknown Token',
        symbol: 'UNK',
      };
    }
  }

  private getKnownTokenMetadata(): Record<string, { name: string; symbol: string; decimals?: number }> {
    return {
      'So11111111111111111111111111111111111111112': {
        name: 'Wrapped SOL',
        symbol: 'SOL',
        decimals: 9,
      },
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
      },
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': {
        name: 'Tether',
        symbol: 'USDT',
        decimals: 6,
      },
      'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': {
        name: 'Jupiter',
        symbol: 'JUP',
        decimals: 6,
      },
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': {
        name: 'Marinade Staked SOL',
        symbol: 'mSOL',
        decimals: 9,
      },
      'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': {
        name: 'BlazeStake Staked SOL',
        symbol: 'bSOL',
        decimals: 9,
      },
      '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj': {
        name: 'Lido Staked SOL',
        symbol: 'stSOL',
        decimals: 9,
      },
    };
  }

  public async isHealthy(): Promise<boolean> {
    try {
      // Test connection by fetching latest blockhash
      await this.connection.getLatestBlockhash();
      return true;
    } catch (error) {
      console.error('RPC health check failed:', error);
      return false;
    }
  }

  public async getLatestBlockhash() {
    try {
      return await this.connection.getLatestBlockhash('confirmed');
    } catch (error) {
      console.error('Error fetching latest blockhash:', error);
      throw error;
    }
  }

  public async confirmTransaction(signature: string) {
    try {
      const latestBlockhash = await this.getLatestBlockhash();
      return await this.connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      });
    } catch (error) {
      console.error('Error confirming transaction:', error);
      throw error;
    }
  }
}