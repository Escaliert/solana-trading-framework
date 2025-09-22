import { PublicKey, ConfirmedSignatureInfo, ParsedTransactionWithMeta } from '@solana/web3.js';
import { SolanaRpcClient } from '../../core/rpc-client';
import { DatabaseManager, DatabaseTransaction } from '../../core/database';
import { RateLimiter, RetryManager } from '../../utils/rate-limiter';

export interface TransactionAnalysis {
  signature: string;
  type: 'buy' | 'sell' | 'transfer_in' | 'transfer_out';
  mintAddress: string;
  amount: number;
  price?: number;
  timestamp: Date;
  blockTime: number;
}

export class TransactionTracker {
  private static instance: TransactionTracker;
  private rpcClient: SolanaRpcClient;
  private dbManager: DatabaseManager;
  private rateLimiter: RateLimiter;

  private constructor() {
    this.rpcClient = SolanaRpcClient.getInstance();
    this.dbManager = DatabaseManager.getInstance();
    // Ultra-conservative Solana RPC limits: 3 requests per 60 seconds
    this.rateLimiter = new RateLimiter(3, 60000, 5000);
  }

  public static getInstance(): TransactionTracker {
    if (!TransactionTracker.instance) {
      TransactionTracker.instance = new TransactionTracker();
    }
    return TransactionTracker.instance;
  }

  public async fetchAndAnalyzeTransactions(walletAddress: PublicKey, limit: number = 100): Promise<TransactionAnalysis[]> {
    try {
      console.log(`Fetching transaction history for ${walletAddress.toBase58()}...`);

      // Get signature list
      const signatures = await this.getSignatures(walletAddress, limit);
      console.log(`Found ${signatures.length} signatures`);

      // Process transactions one by one to prevent rate limiting
      const batchSize = 1; // Process 1 transaction at a time to avoid 429 errors
      const analyses: TransactionAnalysis[] = [];

      for (let i = 0; i < signatures.length; i += batchSize) {
        const batch = signatures.slice(i, i + batchSize);
        const batchAnalyses = await this.analyzeBatch(batch, walletAddress);
        analyses.push(...batchAnalyses);

        // Progress indication
        console.log(`Analyzed ${Math.min(i + batchSize, signatures.length)}/${signatures.length} transactions`);

        // Note: Rate limiting is now handled by the RateLimiter in analyzeBatch
      }

      return analyses;
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return [];
    }
  }

  private async getSignatures(walletAddress: PublicKey, limit: number): Promise<ConfirmedSignatureInfo[]> {
    try {
      const connection = this.rpcClient.getConnection();

      // Apply rate limiting before the signature request
      await this.rateLimiter.waitIfNeeded();

      const signatures = await RetryManager.withRetry(async () => {
        return await connection.getSignaturesForAddress(walletAddress, { limit });
      }, 3, 5000, this.rateLimiter);

      return signatures;
    } catch (error) {
      console.error('Error fetching signatures:', error);
      return [];
    }
  }

  private async analyzeBatch(signatures: ConfirmedSignatureInfo[], walletAddress: PublicKey): Promise<TransactionAnalysis[]> {
    const connection = this.rpcClient.getConnection();
    const analyses: TransactionAnalysis[] = [];

    for (const sigInfo of signatures) {
      try {
        // Use rate limiter before each request
        await this.rateLimiter.waitIfNeeded();

        const transaction = await RetryManager.withRetry(async () => {
          return await connection.getParsedTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0
          });
        }, 3, 5000, this.rateLimiter);

        if (transaction) {
          const analysis = await this.analyzeTransaction(transaction, walletAddress, sigInfo);
          if (analysis) {
            analyses.push(analysis);
          }
        }
      } catch (error) {
        console.warn(`Failed to analyze transaction ${sigInfo.signature}:`, error);
      }
    }

    return analyses;
  }


  private async analyzeTransaction(
    transaction: ParsedTransactionWithMeta,
    walletAddress: PublicKey,
    sigInfo: ConfirmedSignatureInfo
  ): Promise<TransactionAnalysis | null> {
    try {
      const walletStr = walletAddress.toBase58();

      // Look for SPL token transfers
      const tokenTransfers = this.extractTokenTransfers(transaction, walletStr);

      if (tokenTransfers.length > 0) {
        // Take the first significant transfer
        const transfer = tokenTransfers[0];

        return {
          signature: sigInfo.signature,
          type: transfer.type,
          mintAddress: transfer.mintAddress,
          amount: transfer.amount,
          ...(transfer.price && { price: transfer.price }),
          timestamp: new Date((transaction.blockTime || 0) * 1000),
          blockTime: transaction.blockTime || 0,
        };
      }

      // Look for SOL transfers
      const solTransfer = this.extractSolTransfer(transaction, walletStr);
      if (solTransfer) {
        const result: TransactionAnalysis = {
          signature: sigInfo.signature,
          type: solTransfer.type,
          mintAddress: 'So11111111111111111111111111111111111111112', // SOL mint
          amount: solTransfer.amount,
          timestamp: new Date((transaction.blockTime || 0) * 1000),
          blockTime: transaction.blockTime || 0,
        };

        if (solTransfer.price) {
          result.price = solTransfer.price;
        }

        return result;
      }

      return null;
    } catch (error) {
      console.warn('Error analyzing transaction:', error);
      return null;
    }
  }

  private extractTokenTransfers(transaction: ParsedTransactionWithMeta, walletAddress: string) {
    const transfers: any[] = [];

    if (!transaction.meta?.innerInstructions) return transfers;

    for (const innerInstruction of transaction.meta.innerInstructions) {
      for (const instruction of innerInstruction.instructions) {
        if (instruction.programId.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' && 'parsed' in instruction) {
          const parsed = instruction.parsed;

          if (parsed.type === 'transfer') {
            const info = parsed.info;
            const isReceiver = info.destination && this.findTokenAccountOwner(transaction, info.destination) === walletAddress;
            const isSender = info.source && this.findTokenAccountOwner(transaction, info.source) === walletAddress;

            if (isReceiver || isSender) {
              transfers.push({
                type: isReceiver ? 'transfer_in' : 'transfer_out',
                mintAddress: this.findMintFromTokenAccount(transaction, info.source || info.destination),
                amount: parseFloat(info.amount) || 0,
                price: undefined, // Will be calculated later
              });
            }
          }
        }
      }
    }

    return transfers;
  }

  private extractSolTransfer(transaction: ParsedTransactionWithMeta, walletAddress: string) {
    if (!transaction.meta?.postBalances || !transaction.meta?.preBalances) return null;

    const accountKeys = transaction.transaction.message.accountKeys;
    const walletIndex = accountKeys.findIndex(key =>
      (typeof key === 'string' ? key : key.pubkey.toBase58()) === walletAddress
    );

    if (walletIndex === -1) return null;

    const preBalance = transaction.meta.preBalances[walletIndex];
    const postBalance = transaction.meta.postBalances[walletIndex];
    const difference = (postBalance - preBalance) / 1e9; // Convert lamports to SOL

    if (Math.abs(difference) < 0.001) return null; // Ignore dust

    return {
      type: difference > 0 ? 'transfer_in' as const : 'transfer_out' as const,
      amount: Math.abs(difference),
      price: undefined,
    };
  }

  private findTokenAccountOwner(_transaction: ParsedTransactionWithMeta, _tokenAccount: string): string | null {
    // This is simplified - in production, you'd need to look up the token account owner
    // For now, we'll make educated guesses based on pre/post token balances
    return null;
  }

  private findMintFromTokenAccount(_transaction: ParsedTransactionWithMeta, _tokenAccount: string): string {
    // This is simplified - in production, you'd need to look up the mint from the token account
    // For now, return a placeholder
    return 'Unknown';
  }

  public async saveTransactionToDatabase(analysis: TransactionAnalysis, walletAddress: string): Promise<void> {
    try {
      const dbTransaction: DatabaseTransaction = {
        signature: analysis.signature,
        walletAddress,
        mintAddress: analysis.mintAddress,
        type: analysis.type,
        amount: analysis.amount,
        ...(analysis.price && { price: analysis.price }),
        timestamp: analysis.timestamp,
        blockTime: analysis.blockTime,
        processed: false,
        createdAt: new Date(),
      };

      await this.dbManager.insertTransaction(dbTransaction);
    } catch (error) {
      console.error('Error saving transaction to database:', error);
    }
  }

  public async syncTransactionHistory(walletAddress: PublicKey): Promise<number> {
    try {
      console.log('🔄 Syncing transaction history...');

      // Ultra-reduced to 3 to prevent rate limiting completely
      const analyses = await this.fetchAndAnalyzeTransactions(walletAddress, 3);
      let savedCount = 0;

      for (const analysis of analyses) {
        try {
          await this.saveTransactionToDatabase(analysis, walletAddress.toBase58());
          savedCount++;
        } catch (error) {
          // Ignore duplicate entries
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (!errorMessage.includes('UNIQUE constraint')) {
            console.warn('Error saving transaction:', error);
          }
        }
      }

      console.log(`✅ Synced ${savedCount} new transactions`);
      return savedCount;
    } catch (error) {
      console.error('Error syncing transaction history:', error);
      return 0;
    }
  }

  public async calculateRealCostBasis(walletAddress: string, mintAddress: string): Promise<{ averagePrice: number; totalQuantity: number } | null> {
    try {
      const transactions = await this.dbManager.getTransactions(walletAddress, mintAddress);

      if (transactions.length === 0) return null;

      let totalCost = 0;
      let totalQuantity = 0;

      for (const tx of transactions) {
        if (tx.type === 'buy' || tx.type === 'transfer_in') {
          if (tx.price) {
            totalCost += tx.amount * tx.price;
            totalQuantity += tx.amount;
          }
        } else if (tx.type === 'sell' || tx.type === 'transfer_out') {
          // For sells, we reduce quantity but don't change average cost basis
          totalQuantity -= tx.amount;
        }
      }

      if (totalQuantity <= 0) return null;

      return {
        averagePrice: totalCost / totalQuantity,
        totalQuantity
      };
    } catch (error) {
      console.error('Error calculating real cost basis:', error instanceof Error ? error.message : error);
      return null;
    }
  }
}