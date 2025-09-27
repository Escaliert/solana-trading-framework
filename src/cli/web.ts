#!/usr/bin/env ts-node
import { startServer } from '../web/server';

async function main() {
  try {
    console.log('🚀 Starting Solana Trading Web Dashboard...');
    await startServer();
  } catch (error) {
    console.error('❌ Failed to start web dashboard:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}