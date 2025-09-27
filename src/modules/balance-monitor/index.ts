import { PublicKey } from '@solana/web3.js';
import { SolanaRpcClient } from '../../core/rpc-client';
import { PortfolioTracker } from '../portfolio-tracker';
import { RateLimiter } from '../../utils/rate-limiter';

export interface BalanceSnapshot {
  timestamp: Date;
  tokens: Map<string, {
    mint: string;
    balance: number;
    decimals: number;
    price?: number;
  }>;
  solBalance: number;
}

export interface ExternalTransactionEvent {
  type: 'external_transaction_detected';
  transactionType: 'buy' | 'sell' | 'transfer_in' | 'transfer_out';
  mintAddress: string;
  amount: number;
  balanceChange: number;
  timestamp: Date;
  signature?: string;
}

export class BalanceMonitor {
  private static instance: BalanceMonitor;
  private rpcClient: SolanaRpcClient;
  private portfolioTracker: PortfolioTracker;
  private rateLimiter: RateLimiter;

  private isMonitoring: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastSnapshot: BalanceSnapshot | null = null;
  private walletAddress: PublicKey | null = null;
  private eventListeners: ((event: ExternalTransactionEvent) => void)[] = [];

  // Configuration
  private readonly MONITOR_INTERVAL_MS = 30000; // 30 seconds
  private readonly BALANCE_CHANGE_THRESHOLD = 0.000001; // Minimum balance change to detect

  private constructor() {
    this.rpcClient = SolanaRpcClient.getInstance();
    this.portfolioTracker = PortfolioTracker.getInstance();
    this.rateLimiter = new RateLimiter(20, 60000, 3000, true); // Conservative for monitoring
  }

  public static getInstance(): BalanceMonitor {
    if (!BalanceMonitor.instance) {
      BalanceMonitor.instance = new BalanceMonitor();
    }
    return BalanceMonitor.instance;
  }

  public async startMonitoring(walletAddress: PublicKey): Promise<void> {
    if (this.isMonitoring) {
      console.log('⚠️ Balance monitoring already active');
      return;
    }

    this.walletAddress = walletAddress;
    this.isMonitoring = true;

    console.log('🔍 Starting balance monitoring for external transactions...');
    console.log(`📊 Wallet: ${walletAddress.toBase58()}`);
    console.log(`⏱️ Interval: ${this.MONITOR_INTERVAL_MS / 1000}s`);

    // Take initial snapshot
    this.lastSnapshot = await this.takeBalanceSnapshot();

    // Start monitoring loop
    this.monitoringInterval = setInterval(async () => {
      await this.performMonitoringCycle();
    }, this.MONITOR_INTERVAL_MS);

    console.log('✅ Balance monitoring started');
  }

  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    console.log('🛑 Stopping balance monitoring...');

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.walletAddress = null;
    this.lastSnapshot = null;

    console.log('✅ Balance monitoring stopped');
  }

  public addEventListener(listener: (event: ExternalTransactionEvent) => void): void {
    this.eventListeners.push(listener);
  }

  public removeEventListener(listener: (event: ExternalTransactionEvent) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  private async performMonitoringCycle(): Promise<void> {
    if (!this.isMonitoring || !this.walletAddress) {
      return;
    }

    try {
      console.log('🔄 Performing balance monitoring cycle...');

      // Take new snapshot
      const currentSnapshot = await this.takeBalanceSnapshot();

      if (this.lastSnapshot) {
        // Compare snapshots and detect changes
        const changes = this.detectBalanceChanges(this.lastSnapshot, currentSnapshot);

        if (changes.length > 0) {
          console.log(`🚨 ${changes.length} external balance changes detected!`);

          // Process each change
          for (const change of changes) {
            await this.processBalanceChange(change);
          }

          // Trigger portfolio refresh
          await this.triggerPortfolioRefresh();
        } else {
          console.log('✅ No external balance changes detected');
        }
      }

      // Update last snapshot
      this.lastSnapshot = currentSnapshot;

    } catch (error) {
      console.error('❌ Error in balance monitoring cycle:', error);
    }
  }

  private async takeBalanceSnapshot(): Promise<BalanceSnapshot> {
    if (!this.walletAddress) {
      throw new Error('Wallet address not set');
    }

    await this.rateLimiter.waitIfNeeded();

    try {
      // Get current portfolio to leverage existing token detection
      const portfolio = this.portfolioTracker.getCurrentPortfolio();
      const tokens = new Map();

      if (portfolio && portfolio.positions) {
        for (const position of portfolio.positions) {
          tokens.set(position.mintAddress, {
            mint: position.mintAddress,
            balance: position.balanceUiAmount,
            decimals: position.tokenInfo.decimals,
            price: position.currentPrice
          });
        }
      }

      // Get SOL balance
      const connection = this.rpcClient.getConnection();
      const solBalance = await connection.getBalance(this.walletAddress);

      return {
        timestamp: new Date(),
        tokens,
        solBalance: solBalance / 1e9 // Convert lamports to SOL
      };

    } catch (error) {
      console.error('❌ Error taking balance snapshot:', error);
      throw error;
    }
  }

  private detectBalanceChanges(
    previousSnapshot: BalanceSnapshot,
    currentSnapshot: BalanceSnapshot
  ): ExternalTransactionEvent[] {
    const changes: ExternalTransactionEvent[] = [];

    // Check SOL balance changes
    const solDifference = currentSnapshot.solBalance - previousSnapshot.solBalance;
    if (Math.abs(solDifference) > this.BALANCE_CHANGE_THRESHOLD) {
      const isIncoming = solDifference > 0;

      changes.push({
        type: 'external_transaction_detected',
        transactionType: isIncoming ? 'transfer_in' : 'transfer_out',
        mintAddress: 'So11111111111111111111111111111111111111112', // SOL mint
        amount: Math.abs(solDifference),
        balanceChange: solDifference,
        timestamp: new Date()
      });

      console.log(`💰 SOL balance change: ${solDifference > 0 ? '+' : ''}${solDifference.toFixed(6)} SOL`);
    }

    // Check token balance changes
    const allMints = new Set([
      ...previousSnapshot.tokens.keys(),
      ...currentSnapshot.tokens.keys()
    ]);

    for (const mint of allMints) {
      const prevToken = previousSnapshot.tokens.get(mint);
      const currToken = currentSnapshot.tokens.get(mint);

      const prevBalance = prevToken?.balance || 0;
      const currBalance = currToken?.balance || 0;
      const difference = currBalance - prevBalance;

      if (Math.abs(difference) > this.BALANCE_CHANGE_THRESHOLD) {
        const isIncoming = difference > 0;

        changes.push({
          type: 'external_transaction_detected',
          transactionType: isIncoming ?
            (prevBalance === 0 ? 'buy' : 'transfer_in') :
            (currBalance === 0 ? 'sell' : 'transfer_out'),
          mintAddress: mint,
          amount: Math.abs(difference),
          balanceChange: difference,
          timestamp: new Date()
        });

        const symbol = currToken?.mint.slice(0, 8) || prevToken?.mint.slice(0, 8) || 'UNKNOWN';
        console.log(`💰 ${symbol}... balance change: ${difference > 0 ? '+' : ''}${difference.toFixed(6)}`);
      }
    }

    return changes;
  }

  private async processBalanceChange(change: ExternalTransactionEvent): Promise<void> {
    try {
      console.log(`🔄 Processing external ${change.transactionType} for ${change.mintAddress.slice(0, 8)}...`);

      // Notify event listeners
      this.eventListeners.forEach(listener => {
        try {
          listener(change);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      });

      // Try to find the actual transaction signature
      const signature = await this.findRecentTransactionSignature(change);
      if (signature) {
        change.signature = signature;
        console.log(`🔗 Found transaction signature: ${signature.slice(0, 8)}...`);
      }

      // Log the external transaction event
      console.log(`📝 External transaction detected:`, {
        type: change.transactionType,
        token: change.mintAddress.slice(0, 8) + '...',
        amount: change.amount.toFixed(6),
        timestamp: change.timestamp.toISOString()
      });

    } catch (error) {
      console.error('❌ Error processing balance change:', error);
    }
  }

  private async findRecentTransactionSignature(change: ExternalTransactionEvent): Promise<string | undefined> {
    if (!this.walletAddress) return undefined;

    try {
      await this.rateLimiter.waitIfNeeded();

      // Get recent signatures (last 5 minutes)
      const connection = this.rpcClient.getConnection();
      const signatures = await connection.getSignaturesForAddress(
        this.walletAddress,
        { limit: 10 } // Check last 10 transactions
      );

      // Find signatures from the time window around the balance change
      const changeTime = change.timestamp.getTime();
      const timeWindow = 120000; // 2 minutes window

      for (const sigInfo of signatures) {
        if (sigInfo.blockTime) {
          const txTime = sigInfo.blockTime * 1000;
          if (Math.abs(txTime - changeTime) <= timeWindow) {
            return sigInfo.signature;
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not find transaction signature:', error);
    }

    return undefined;
  }

  private async triggerPortfolioRefresh(): Promise<void> {
    try {
      console.log('🔄 Triggering portfolio refresh due to external transactions...');

      // Update portfolio with fresh data
      await this.portfolioTracker.updatePortfolioWithPrices();

      console.log('✅ Portfolio refreshed after external transaction detection');
    } catch (error) {
      console.error('❌ Error refreshing portfolio:', error);
    }
  }

  public getStatus(): any {
    return {
      isMonitoring: this.isMonitoring,
      walletAddress: this.walletAddress?.toBase58(),
      intervalMs: this.MONITOR_INTERVAL_MS,
      lastSnapshotTime: this.lastSnapshot?.timestamp,
      eventListenerCount: this.eventListeners.length
    };
  }

  public async forceBalanceCheck(): Promise<ExternalTransactionEvent[]> {
    if (!this.isMonitoring || !this.walletAddress || !this.lastSnapshot) {
      console.log('⚠️ Cannot force balance check - monitoring not active');
      return [];
    }

    console.log('🔍 Forcing immediate balance check...');

    const currentSnapshot = await this.takeBalanceSnapshot();
    const changes = this.detectBalanceChanges(this.lastSnapshot, currentSnapshot);

    if (changes.length > 0) {
      console.log(`🚨 Force check found ${changes.length} balance changes!`);

      for (const change of changes) {
        await this.processBalanceChange(change);
      }

      await this.triggerPortfolioRefresh();
    } else {
      console.log('✅ Force check: No balance changes detected');
    }

    this.lastSnapshot = currentSnapshot;
    return changes;
  }
}