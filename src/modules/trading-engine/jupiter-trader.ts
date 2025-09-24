import axios from 'axios';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SolanaRpcClient } from '../../core/rpc-client';
import { RateLimiter, RetryManager } from '../../utils/rate-limiter';
import { WalletManager } from '../../core/wallet-manager';

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
  otherAmountThreshold: string;
  swapMode: 'ExactIn' | 'ExactOut';
  priceImpactPct: string;
  routePlan: RoutePlan[];
}

export interface RoutePlan {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

export interface SwapInstruction {
  swapInstruction: string;
  addressLookupTableAddresses: string[];
}

export interface SwapResult {
  success: boolean;
  signature?: string;
  error?: string;
  inputAmount: number;
  outputAmount: number;
  priceImpact: number;
  timestamp: Date;
}

export class JupiterTrader {
  private static instance: JupiterTrader;
  private rpcClient: SolanaRpcClient;
  private walletManager: WalletManager;
  private rateLimiter: RateLimiter;
  private baseUrl: string;

  private constructor() {
    this.rpcClient = SolanaRpcClient.getInstance();
    this.walletManager = WalletManager.getInstance();
    this.rateLimiter = new RateLimiter(3, 60000, 3000); // 3 requests per minute, 3s between
    this.baseUrl = 'https://quote-api.jup.ag/v6';
  }

  public static getInstance(): JupiterTrader {
    if (!JupiterTrader.instance) {
      JupiterTrader.instance = new JupiterTrader();
    }
    return JupiterTrader.instance;
  }

  public async getSwapQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 100
  ): Promise<SwapQuote | null> {
    try {
      await this.rateLimiter.waitIfNeeded();

      console.log(`🔍 Getting swap quote: ${amount} ${inputMint} → ${outputMint}`);

      const response = await RetryManager.withRetry(async () => {
        return await axios.get(`${this.baseUrl}/quote`, {
          params: {
            inputMint,
            outputMint,
            amount: amount.toString(),
            slippageBps,
            swapMode: 'ExactIn',
          },
          timeout: 10000,
        });
      });

      const quote = response.data as SwapQuote;
      console.log(`✅ Quote received: ${quote.otherAmountThreshold} output, ${quote.priceImpactPct}% impact`);

      return quote;
    } catch (error) {
      console.error('Error getting swap quote:', error);
      return null;
    }
  }

  public async getSwapInstruction(
    quote: SwapQuote,
    userPublicKey: PublicKey,
    wrapAndUnwrapSol: boolean = true
  ): Promise<SwapInstruction | null> {
    try {
      await this.rateLimiter.waitIfNeeded();

      console.log('📋 Getting swap instruction...');

      const response = await RetryManager.withRetry(async () => {
        return await axios.post(`${this.baseUrl}/swap`, {
          quoteResponse: quote,
          userPublicKey: userPublicKey.toBase58(),
          wrapAndUnwrapSol,
          computeUnitPriceMicroLamports: 'auto',
          dynamicComputeUnitLimit: true,
        }, {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        });
      });

      console.log('✅ Swap instruction received');
      return response.data as SwapInstruction;
    } catch (error) {
      console.error('Error getting swap instruction:', error);
      return null;
    }
  }

  public async simulateSwap(
    inputMint: string,
    outputMint: string,
    amount: number,
    userPublicKey: PublicKey,
    slippageBps: number = 100
  ): Promise<{ quote: SwapQuote; simulation: any } | null> {
    try {
      console.log('🧪 Simulating swap...');

      // Get quote
      const quote = await this.getSwapQuote(inputMint, outputMint, amount, slippageBps);
      if (!quote) {
        console.error('Failed to get quote for simulation');
        return null;
      }

      // Get swap instruction
      const swapInstruction = await this.getSwapInstruction(quote, userPublicKey);
      if (!swapInstruction) {
        console.error('Failed to get swap instruction for simulation');
        return null;
      }

      // Deserialize transaction
      const swapTransactionBuf = Buffer.from(swapInstruction.swapInstruction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      // Simulate transaction
      const connection = this.rpcClient.getConnection();
      const simulation = await connection.simulateTransaction(transaction, {
        replaceRecentBlockhash: true,
        commitment: 'confirmed',
      });

      console.log('✅ Simulation completed');

      return {
        quote,
        simulation: simulation.value,
      };
    } catch (error) {
      console.error('Error simulating swap:', error);
      return null;
    }
  }

  public async executeSwap(
    inputMint: string,
    outputMint: string,
    amount: number,
    userPublicKey: PublicKey,
    slippageBps: number = 100,
    dryRun: boolean = true
  ): Promise<SwapResult> {
    try {
      console.log(`${dryRun ? '🧪 DRY RUN:' : '🔄'} Executing swap...`);

      // Get quote
      const quote = await this.getSwapQuote(inputMint, outputMint, amount, slippageBps);
      if (!quote) {
        return {
          success: false,
          error: 'Failed to get swap quote',
          inputAmount: amount,
          outputAmount: 0,
          priceImpact: 0,
          timestamp: new Date(),
        };
      }

      const priceImpact = parseFloat(quote.priceImpactPct);
      const outputAmount = parseInt(quote.otherAmountThreshold);

      // Safety checks
      if (priceImpact > 5) {
        return {
          success: false,
          error: `Price impact too high: ${priceImpact}%`,
          inputAmount: amount,
          outputAmount,
          priceImpact,
          timestamp: new Date(),
        };
      }

      if (dryRun) {
        console.log('✅ DRY RUN completed successfully');
        return {
          success: true,
          signature: 'DRY_RUN_SIMULATION',
          inputAmount: amount,
          outputAmount,
          priceImpact,
          timestamp: new Date(),
        };
      }

      // Get swap instruction
      const swapInstruction = await this.getSwapInstruction(quote, userPublicKey);
      if (!swapInstruction) {
        return {
          success: false,
          error: 'Failed to get swap instruction',
          inputAmount: amount,
          outputAmount,
          priceImpact,
          timestamp: new Date(),
        };
      }

      // Try to execute the real transaction if wallet can sign
      if (this.walletManager.canSign()) {
        try {
          console.log('🔑 Executing real transaction...');

          // Deserialize transaction
          const swapTransactionBuf = Buffer.from(swapInstruction.swapInstruction, 'base64');
          const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

          // Sign and send transaction
          const signature = await this.walletManager.signAndSendTransaction(transaction);

          return {
            success: true,
            signature,
            inputAmount: amount,
            outputAmount,
            priceImpact,
            timestamp: new Date(),
          };

        } catch (error) {
          console.error('❌ Real transaction failed:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Transaction failed',
            inputAmount: amount,
            outputAmount,
            priceImpact,
            timestamp: new Date(),
          };
        }
      } else {
        // Fallback to simulation
        console.log('⚠️ Wallet cannot sign - falling back to simulation');
        return {
          success: true,
          signature: 'SIMULATED_EXECUTION',
          inputAmount: amount,
          outputAmount,
          priceImpact,
          timestamp: new Date(),
        };
      }

    } catch (error) {
      console.error('Error executing swap:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        inputAmount: amount,
        outputAmount: 0,
        priceImpact: 0,
        timestamp: new Date(),
      };
    }
  }

  public async getTokenList(): Promise<any[]> {
    try {
      await this.rateLimiter.waitIfNeeded();

      const response = await RetryManager.withRetry(async () => {
        return await axios.get('https://token.jup.ag/all', {
          timeout: 10000,
        });
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching token list:', error);
      return [];
    }
  }

  public async findTokenBySymbol(symbol: string): Promise<any | null> {
    try {
      const tokens = await this.getTokenList();
      return tokens.find(token =>
        token.symbol.toLowerCase() === symbol.toLowerCase()
      ) || null;
    } catch (error) {
      console.error('Error finding token by symbol:', error);
      return null;
    }
  }

  public calculateSlippageBps(slippagePercent: number): number {
    return Math.round(slippagePercent * 100); // Convert percentage to basis points
  }

  public formatSwapResult(result: SwapResult): string {
    const lines = [
      `Swap Result:`,
      `Success: ${result.success ? '✅' : '❌'}`,
      `Input Amount: ${result.inputAmount}`,
      `Output Amount: ${result.outputAmount}`,
      `Price Impact: ${result.priceImpact.toFixed(4)}%`,
    ];

    if (result.signature) {
      lines.push(`Signature: ${result.signature}`);
    }

    if (result.error) {
      lines.push(`Error: ${result.error}`);
    }

    return lines.join('\n');
  }
}