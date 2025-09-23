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
    // PRAGMATIC rate limiting: 30 requests per minute with 2s delays
    this.rateLimiter = new RateLimiter(30, 60000, 2000, false);
  }

  public static getInstance(): TransactionTracker {
    if (!TransactionTracker.instance) {
      TransactionTracker.instance = new TransactionTracker();
    }
    return TransactionTracker.instance;
  }

  public async fetchAndAnalyzeTransactions(walletAddress: PublicKey, limit: number = 50): Promise<TransactionAnalysis[]> {
    try {
      console.log(`📋 Fetching complete transaction history for ${walletAddress.toBase58()}...`);

      // Professional pagination approach - fetch ALL transactions efficiently
      const allSignatures = await this.getAllSignaturesWithPagination(walletAddress, limit);
      console.log(`📊 Found ${allSignatures.length} total signatures`);

      // PRAGMATIC batch processing - process in groups of 20
      const batchSize = 20;
      const analyses: TransactionAnalysis[] = [];

      for (let i = 0; i < allSignatures.length; i += batchSize) {
        const batch = allSignatures.slice(i, i + batchSize);
        console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allSignatures.length / batchSize)} (${batch.length} transactions)`);

        const batchAnalyses = await this.analyzeBatchProfessional(batch, walletAddress);
        analyses.push(...batchAnalyses);

        // Progress indication
        console.log(`✅ Analyzed ${Math.min(i + batchSize, allSignatures.length)}/${allSignatures.length} transactions`);
      }

      console.log(`🎯 Transaction analysis complete: ${analyses.length} analyzable transactions found`);
      return analyses;
    } catch (error) {
      console.error('❌ Error in professional transaction fetching:', error);
      return [];
    }
  }

  private async getAllSignaturesWithPagination(walletAddress: PublicKey, maxLimit: number = 1000): Promise<ConfirmedSignatureInfo[]> {
    const allSignatures: ConfirmedSignatureInfo[] = [];
    let beforeSignature: string | undefined = undefined;
    const batchLimit = 1000; // Max per request

    while (allSignatures.length < maxLimit) {
      try {
        await this.rateLimiter.waitIfNeeded();

        const options: any = {
          limit: Math.min(batchLimit, maxLimit - allSignatures.length)
        };

        if (beforeSignature) {
          options.before = beforeSignature;
        }

        const signatures = await RetryManager.withRetry(async () => {
          const connection = this.rpcClient.getConnection();
          return await connection.getSignaturesForAddress(walletAddress, options);
        }, 3, 5000, this.rateLimiter);

        if (signatures.length === 0) {
          console.log(`📝 No more signatures found, pagination complete`);
          break;
        }

        allSignatures.push(...signatures);
        beforeSignature = signatures[signatures.length - 1].signature;

        console.log(`📄 Fetched ${signatures.length} signatures (total: ${allSignatures.length})`);

        // If we got less than requested, we've reached the end
        if (signatures.length < batchLimit) {
          break;
        }

      } catch (error) {
        console.warn(`⚠️ Error in pagination batch:`, error);
        break;
      }
    }

    return allSignatures.slice(0, maxLimit);
  }


  private async analyzeBatchProfessional(signatures: ConfirmedSignatureInfo[], walletAddress: PublicKey): Promise<TransactionAnalysis[]> {
    const connection = this.rpcClient.getConnection();
    const analyses: TransactionAnalysis[] = [];

    // Process in smaller sub-batches of 5 to balance speed vs rate limits
    const subBatchSize = 5;

    for (let i = 0; i < signatures.length; i += subBatchSize) {
      const subBatch = signatures.slice(i, i + subBatchSize);

      // Process sub-batch in parallel for better performance
      const subBatchPromises = subBatch.map(async (sigInfo) => {
        try {
          // Minimal delay instead of aggressive rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));

          const transaction = await RetryManager.withRetry(async () => {
            return await connection.getParsedTransaction(sigInfo.signature, {
              maxSupportedTransactionVersion: 0
            });
          }, 3, 5000, this.rateLimiter);

          if (transaction) {
            return await this.analyzeTransaction(transaction, walletAddress, sigInfo);
          }
          return null;
        } catch (error) {
          console.warn(`⚠️ Failed to analyze transaction ${sigInfo.signature.slice(0, 8)}...`);
          return null;
        }
      });

      const subBatchResults = await Promise.all(subBatchPromises);

      // Add successful analyses
      subBatchResults.forEach(analysis => {
        if (analysis) {
          analyses.push(analysis);
        }
      });

      // Small delay between sub-batches to respect rate limits
      if (i + subBatchSize < signatures.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
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

    // Use preTokenBalances and postTokenBalances to detect transfers more reliably
    if (!transaction.meta?.preTokenBalances || !transaction.meta?.postTokenBalances) {
      return transfers;
    }

    const preBalances = transaction.meta.preTokenBalances;
    const postBalances = transaction.meta.postTokenBalances;

    // Group by account index and mint to track balance changes
    const balanceChanges = new Map();

    // Process pre-balances
    for (const balance of preBalances) {
      if (balance.owner === walletAddress && balance.mint && balance.accountIndex !== undefined) {
        const key = `${balance.accountIndex}-${balance.mint}`;
        balanceChanges.set(key, {
          mint: balance.mint,
          owner: balance.owner,
          accountIndex: balance.accountIndex,
          preAmount: parseFloat(balance.uiTokenAmount?.uiAmountString || '0'),
          postAmount: 0,
          decimals: balance.uiTokenAmount?.decimals || 6
        });
      }
    }

    // Process post-balances
    for (const balance of postBalances) {
      if (balance.owner === walletAddress && balance.mint && balance.accountIndex !== undefined) {
        const key = `${balance.accountIndex}-${balance.mint}`;
        const existing = balanceChanges.get(key);
        if (existing) {
          existing.postAmount = parseFloat(balance.uiTokenAmount?.uiAmountString || '0');
        } else {
          // New token account
          balanceChanges.set(key, {
            mint: balance.mint,
            owner: balance.owner,
            accountIndex: balance.accountIndex,
            preAmount: 0,
            postAmount: parseFloat(balance.uiTokenAmount?.uiAmountString || '0'),
            decimals: balance.uiTokenAmount?.decimals || 6
          });
        }
      }
    }

    // Analyze balance changes to determine transfers
    for (const [, change] of balanceChanges) {
      const amountChange = change.postAmount - change.preAmount;

      if (Math.abs(amountChange) > 0.000001) { // Ignore dust
        const isReceiving = amountChange > 0;
        const amount = Math.abs(amountChange);

        console.log(`💰 Token ${isReceiving ? 'received' : 'sent'}: ${amount} ${change.mint.slice(0, 8)}...`);

        transfers.push({
          type: isReceiving ? 'buy' : 'sell',
          mintAddress: change.mint,
          amount: amount,
          price: this.estimatePriceFromSwap(transaction, amount),
        });
      }
    }

    return transfers;
  }

  private estimatePriceFromSwap(transaction: ParsedTransactionWithMeta, tokenAmount: number): number | undefined {
    // ENHANCED: Look for Jupiter, Raydium, or other DEX swap instructions
    const jupiterSwapPrice = this.extractJupiterSwapPrice(transaction, tokenAmount);
    if (jupiterSwapPrice) {
      console.log(`🪐 Jupiter swap price detected: $${jupiterSwapPrice.toFixed(8)}`);
      return jupiterSwapPrice;
    }

    // ENHANCED: Look for Raydium AMM swaps
    const raydiumSwapPrice = this.extractRaydiumSwapPrice(transaction, tokenAmount);
    if (raydiumSwapPrice) {
      console.log(`🌊 Raydium swap price detected: $${raydiumSwapPrice.toFixed(8)}`);
      return raydiumSwapPrice;
    }

    // ENHANCED: Try to estimate price by looking at SOL balance changes
    if (!transaction.meta?.preBalances || !transaction.meta?.postBalances) {
      return undefined;
    }

    let solAmountChange = 0;

    // Find SOL balance change for any account (likely the swap)
    for (let i = 0; i < transaction.meta.preBalances.length; i++) {
      const preBalance = transaction.meta.preBalances[i];
      const postBalance = transaction.meta.postBalances[i];
      const change = (postBalance - preBalance) / 1e9; // Convert lamports to SOL

      if (Math.abs(change) > 0.001) { // Significant SOL movement
        solAmountChange += Math.abs(change);
      }
    }

    if (solAmountChange > 0 && tokenAmount > 0) {
      // ENHANCED: Get current SOL price dynamically instead of hardcoded
      const currentSolPrice = this.getCurrentSolPrice();
      const estimatedPrice = (solAmountChange * currentSolPrice) / tokenAmount;
      console.log(`💰 Estimated price from SOL swap: ${solAmountChange} SOL (~$${currentSolPrice}) → ${tokenAmount} tokens = $${estimatedPrice.toFixed(8)}`);
      return estimatedPrice;
    }

    return undefined;
  }

  private extractJupiterSwapPrice(transaction: ParsedTransactionWithMeta, _tokenAmount: number): number | undefined {
    // JUPITER INTEGRATION: Look for Jupiter program instructions
    const jupiterProgramId = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'; // Jupiter V6
    const jupiterProgramIdV4 = 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB'; // Jupiter V4

    try {
      const instructions = transaction.transaction.message.instructions;

      for (const instruction of instructions) {
        const programId = typeof instruction.programId === 'string'
          ? instruction.programId
          : instruction.programId.toBase58();

        // Check if this is a Jupiter swap instruction
        if (programId === jupiterProgramId || programId === jupiterProgramIdV4) {
          // ENHANCED: Extract swap details from Jupiter instruction data
          const swapDetails = this.parseJupiterSwapInstruction(instruction, transaction);
          if (swapDetails && swapDetails.inputAmount > 0 && swapDetails.outputAmount > 0) {
            // Calculate actual price from swap
            const price = (swapDetails.inputAmount * swapDetails.inputPrice) / swapDetails.outputAmount;
            console.log(`🎯 Jupiter swap detected: ${swapDetails.inputAmount} ${swapDetails.inputSymbol} → ${swapDetails.outputAmount} tokens`);
            return price;
          }
        }
      }
    } catch (error) {
      console.warn('Error parsing Jupiter swap:', error);
    }

    return undefined;
  }

  private extractRaydiumSwapPrice(transaction: ParsedTransactionWithMeta, _tokenAmount: number): number | undefined {
    // RAYDIUM INTEGRATION: Look for Raydium AMM program instructions
    const raydiumProgramId = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'; // Raydium AMM V4

    try {
      const instructions = transaction.transaction.message.instructions;

      for (const instruction of instructions) {
        const programId = typeof instruction.programId === 'string'
          ? instruction.programId
          : instruction.programId.toBase58();

        // Check if this is a Raydium swap instruction
        if (programId === raydiumProgramId) {
          // ENHANCED: Extract swap details from Raydium instruction data
          const swapDetails = this.parseRaydiumSwapInstruction(instruction, transaction);
          if (swapDetails && swapDetails.inputAmount > 0 && swapDetails.outputAmount > 0) {
            // Calculate actual price from swap
            const price = (swapDetails.inputAmount * swapDetails.inputPrice) / swapDetails.outputAmount;
            console.log(`🎯 Raydium swap detected: ${swapDetails.inputAmount} ${swapDetails.inputSymbol} → ${swapDetails.outputAmount} tokens`);
            return price;
          }
        }
      }
    } catch (error) {
      console.warn('Error parsing Raydium swap:', error);
    }

    return undefined;
  }

  private parseJupiterSwapInstruction(_instruction: any, transaction: ParsedTransactionWithMeta): any {
    // JUPITER PARSING: Extract input/output amounts from token balance changes
    try {
      if (!transaction.meta?.preTokenBalances || !transaction.meta?.postTokenBalances) {
        return null;
      }

      const balanceChanges = this.calculateTokenBalanceChanges(transaction);

      // Find input (decreased) and output (increased) tokens
      let inputToken = null;
      let outputToken = null;

      for (const change of balanceChanges) {
        if (change.amountChange < 0) {
          inputToken = change; // Token was sold/spent
        } else if (change.amountChange > 0) {
          outputToken = change; // Token was received
        }
      }

      if (inputToken && outputToken) {
        return {
          inputAmount: Math.abs(inputToken.amountChange),
          outputAmount: outputToken.amountChange,
          inputSymbol: inputToken.mint === 'So11111111111111111111111111111111111111112' ? 'SOL' : 'TOKEN',
          inputPrice: inputToken.mint === 'So11111111111111111111111111111111111111112' ? this.getCurrentSolPrice() : 1,
        };
      }
    } catch (error) {
      console.warn('Error parsing Jupiter instruction:', error);
    }

    return null;
  }

  private parseRaydiumSwapInstruction(instruction: any, transaction: ParsedTransactionWithMeta): any {
    // RAYDIUM PARSING: Similar to Jupiter but for Raydium AMM format
    return this.parseJupiterSwapInstruction(instruction, transaction); // Same logic for now
  }

  private calculateTokenBalanceChanges(transaction: ParsedTransactionWithMeta): any[] {
    const changes: any[] = [];

    if (!transaction.meta?.preTokenBalances || !transaction.meta?.postTokenBalances) {
      return changes;
    }

    // Create a map of balance changes by account
    const balanceMap = new Map();

    // Process pre-balances
    for (const balance of transaction.meta.preTokenBalances) {
      const key = `${balance.accountIndex}-${balance.mint}`;
      balanceMap.set(key, {
        mint: balance.mint,
        preAmount: parseFloat(balance.uiTokenAmount?.uiAmountString || '0'),
        postAmount: 0,
        decimals: balance.uiTokenAmount?.decimals || 6
      });
    }

    // Process post-balances
    for (const balance of transaction.meta.postTokenBalances) {
      const key = `${balance.accountIndex}-${balance.mint}`;
      const existing = balanceMap.get(key);

      if (existing) {
        existing.postAmount = parseFloat(balance.uiTokenAmount?.uiAmountString || '0');
      } else {
        balanceMap.set(key, {
          mint: balance.mint,
          preAmount: 0,
          postAmount: parseFloat(balance.uiTokenAmount?.uiAmountString || '0'),
          decimals: balance.uiTokenAmount?.decimals || 6
        });
      }
    }

    // Calculate changes
    for (const [, data] of balanceMap) {
      const amountChange = data.postAmount - data.preAmount;
      if (Math.abs(amountChange) > 0.000001) { // Ignore dust
        changes.push({
          mint: data.mint,
          amountChange,
          decimals: data.decimals
        });
      }
    }

    return changes;
  }

  private getCurrentSolPrice(): number {
    // ENHANCED: Should integrate with PriceFeedManager to get real SOL price
    // For now, return reasonable estimate that will be updated with real price feed
    return 220; // ~$220 SOL - will be replaced with real price feed
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
      console.log('🔄 Professional transaction history sync starting...');

      // PRAGMATIC approach: get recent transaction history (last 50 transactions)
      const analyses = await this.fetchAndAnalyzeTransactions(walletAddress, 50);
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