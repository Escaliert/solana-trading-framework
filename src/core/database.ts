import sqlite3 from 'sqlite3';

export interface DatabaseTransaction {
  id?: number;
  signature: string;
  walletAddress: string;
  mintAddress: string;
  type: 'buy' | 'sell' | 'transfer_in' | 'transfer_out';
  amount: number;
  price?: number;
  timestamp: Date;
  blockTime: number;
  processed: boolean;
  createdAt: Date;
}

export interface PortfolioSnapshot {
  id?: number;
  walletAddress: string;
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  positionCount: number;
  timestamp: Date;
  data: string; // JSON string of full portfolio
}

export interface PriceHistoryEntry {
  id?: number;
  mintAddress: string;
  price: number;
  source: string;
  timestamp: Date;
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: sqlite3.Database | null = null;

  private constructor() {
    // Config manager can be used later for database path configuration
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const dbPath = './data/portfolio.db';

      // Ensure data directory exists
      const fs = require('fs');
      const path = require('path');
      const dataDir = path.dirname(dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log(`📁 Created data directory: ${dataDir}`);
      }

      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.createTables()
            .then(resolve)
            .catch(reject);
        }
      });
    });
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const tables = [
      // Transactions table
      `CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signature TEXT UNIQUE NOT NULL,
        wallet_address TEXT NOT NULL,
        mint_address TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'transfer_in', 'transfer_out')),
        amount REAL NOT NULL,
        price REAL,
        timestamp DATETIME NOT NULL,
        block_time INTEGER NOT NULL,
        processed BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Portfolio snapshots table
      `CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address TEXT NOT NULL,
        total_value REAL NOT NULL,
        total_pnl REAL DEFAULT 0,
        total_pnl_percent REAL DEFAULT 0,
        position_count INTEGER DEFAULT 0,
        timestamp DATETIME NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Price history table
      `CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mint_address TEXT NOT NULL,
        price REAL NOT NULL,
        source TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Cost basis table (for manual adjustments)
      `CREATE TABLE IF NOT EXISTS cost_basis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address TEXT NOT NULL,
        mint_address TEXT NOT NULL,
        average_price REAL NOT NULL,
        total_quantity REAL NOT NULL,
        last_updated DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(wallet_address, mint_address)
      )`
    ];

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address)',
      'CREATE INDEX IF NOT EXISTS idx_transactions_mint ON transactions(mint_address)',
      'CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_snapshots_wallet ON portfolio_snapshots(wallet_address)',
      'CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON portfolio_snapshots(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_price_history_mint ON price_history(mint_address)',
      'CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp)',
    ];

    return new Promise((resolve, reject) => {
      let completed = 0;

      // Create tables first
      const createTables = () => {
        tables.forEach((query) => {
          this.db!.run(query, (err) => {
            if (err) {
              console.error('Error creating table:', err);
              reject(err);
              return;
            }

            completed++;
            if (completed === tables.length) {
              createIndexes();
            }
          });
        });
      };

      // Then create indexes
      const createIndexes = () => {
        completed = 0;
        indexes.forEach((query) => {
          this.db!.run(query, (err) => {
            if (err) {
              console.error('Error creating index:', err);
              reject(err);
              return;
            }

            completed++;
            if (completed === indexes.length) {
              console.log('Database tables and indexes created successfully');
              resolve();
            }
          });
        });
      };

      createTables();
    });
  }

  public async insertTransaction(transaction: DatabaseTransaction): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const query = `
        INSERT OR REPLACE INTO transactions
        (signature, wallet_address, mint_address, type, amount, price, timestamp, block_time, processed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        transaction.signature,
        transaction.walletAddress,
        transaction.mintAddress,
        transaction.type,
        transaction.amount,
        transaction.price || null,
        transaction.timestamp.toISOString(),
        transaction.blockTime,
        transaction.processed
      ];

      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  public async getTransactions(walletAddress: string, mintAddress?: string): Promise<DatabaseTransaction[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      let query = 'SELECT * FROM transactions WHERE wallet_address = ?';
      const params: any[] = [walletAddress];

      if (mintAddress) {
        query += ' AND mint_address = ?';
        params.push(mintAddress);
      }

      query += ' ORDER BY timestamp ASC';

      this.db.all(query, params, (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const transactions = rows.map(row => ({
            id: row.id,
            signature: row.signature,
            walletAddress: row.wallet_address,
            mintAddress: row.mint_address,
            type: row.type,
            amount: row.amount,
            price: row.price,
            timestamp: new Date(row.timestamp),
            blockTime: row.block_time,
            processed: Boolean(row.processed),
            createdAt: new Date(row.created_at)
          }));
          resolve(transactions);
        }
      });
    });
  }

  public async savePortfolioSnapshot(snapshot: PortfolioSnapshot): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const query = `
        INSERT INTO portfolio_snapshots
        (wallet_address, total_value, total_pnl, total_pnl_percent, position_count, timestamp, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        snapshot.walletAddress,
        snapshot.totalValue,
        snapshot.totalPnL,
        snapshot.totalPnLPercent,
        snapshot.positionCount,
        snapshot.timestamp.toISOString(),
        snapshot.data
      ];

      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  public async getPortfolioHistory(walletAddress: string, limit: number = 100): Promise<PortfolioSnapshot[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const query = `
        SELECT * FROM portfolio_snapshots
        WHERE wallet_address = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `;

      this.db.all(query, [walletAddress, limit], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const snapshots = rows.map(row => ({
            id: row.id,
            walletAddress: row.wallet_address,
            totalValue: row.total_value,
            totalPnL: row.total_pnl,
            totalPnLPercent: row.total_pnl_percent,
            positionCount: row.position_count,
            timestamp: new Date(row.timestamp),
            data: row.data
          }));
          resolve(snapshots);
        }
      });
    });
  }

  public async savePriceHistory(entry: PriceHistoryEntry): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const query = `
        INSERT INTO price_history (mint_address, price, source, timestamp)
        VALUES (?, ?, ?, ?)
      `;

      const params = [
        entry.mintAddress,
        entry.price,
        entry.source,
        entry.timestamp.toISOString()
      ];

      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database connection closed');
          resolve();
        }
      });
    });
  }

  public getDatabase(): sqlite3.Database | null {
    return this.db;
  }

  public async getAllCostBasis(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const query = 'SELECT * FROM cost_basis';
      this.db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  public async saveCostBasis(costBasisData: {
    mint_address: string;
    average_price: number;
    total_quantity: number;
    last_updated: string;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      // Use INSERT OR REPLACE to handle updates
      const query = `
        INSERT OR REPLACE INTO cost_basis
        (wallet_address, mint_address, average_price, total_quantity, last_updated)
        VALUES (?, ?, ?, ?, ?)
      `;

      // Use a default wallet address for now - can be improved later
      const params = [
        'default_wallet',
        costBasisData.mint_address,
        costBasisData.average_price,
        costBasisData.total_quantity,
        costBasisData.last_updated
      ];

      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}