const express = require('express');
const { Wallet } = require('ethers');
const mongoose = require('mongoose');
const crypto = require('crypto');
const cluster = require('cluster');
const os = require('os');




const { getPortFolioValue, initializeBrowser, closeBrowser } =  require("./puppeter.js");
const { Operation } = require("./OperationModal.js");

require('dotenv').config()
// Replace with your MongoDB URI
const uri = process.env.MONGO_URL; // or use Atlas URI

// Configuration constants
const CONCURRENT_WORKERS = parseInt(process.env.CONCURRENT_WORKERS) || Math.min(os.cpus().length, 8);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 50;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL) || 100; // ms between batches

// Hexadecimal characters for private key generation
const HEX_CHARS = '0123456789abcdef';

// Performance tracking
let totalChecked = 0;
let startTime = Date.now();
// let chains = {
//     [1]: ['https://mainnet.infura.io','https://eth-mainnet.public.blastapi.io', 'https://eth.drpc.org'],
//     [43114]: ['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche.drpc.org', 'https://avalanche-c-chain-rpc.publicnode.com'],
//     [56]: ['https://https://avalanche-c-chain-rpc.publicnode.com', 'https://bsc-rpc.publicnode.com', 'https://bsc.drpc.org'],
//     [8453]: ['https://mainnet.base.org'],
//     [42161]: ['https://arb1.arbitrum.io/rpc'],
//     [146]: []
// }

// let providers = {
//     [1]: new ethers.providers.JsonRpcProvider(chains[1][0]),
//     [43114]: new ethers.providers.JsonRpcProvider(chains[43114][0]),
//     [56]: new ethers.providers.JsonRpcProvider(chains[56][0]),
//     [8453]: new ethers.providers.JsonRpcProvider(chains[8453][0]),
//     [42161]: new ethers.providers.JsonRpcProvider(chains[42161][0]),
//     [146]: new ethers.providers.JsonRpcProvider(chains[146][0]),
// }
let Continue = true;

const checkPrivateKeyHaveFund = async (privateKey) => {
  const wallet = new Wallet(privateKey);
  if (!wallet.address) return false;
  let walletAddress = wallet.address;

  try {
    const value = await getPortFolioValue({ walletAddress: wallet.address });
    if(!value){
      return {
        walletAddress, 
        haveFund: false,
        value
      }
    }
    // If it ends with B/M/K (billions/millions/thousands) or is not exactly "$0"
    if (value !== '$0' && ['B', 'M', 'K'].includes(value.slice(-1))) return {
      walletAddress,
      haveFund : true,
      value
    };

    // Remove currency symbols and commas, then check numeric amount
    const numeric = parseFloat(value.replace(/[^0-9.]/g, ''));
    return {
      walletAddress,
      haveFund: !isNaN(numeric) && numeric > 0,
      value
    };
  } catch {
    return {
      walletAddress,
      haveFund: false
    };
  }
};

// Generate cryptographically secure random private key
const createRandomPrivateKey = () => {
  // Generate 32 random bytes (256 bits) for a valid Ethereum private key
  const randomBytes = crypto.randomBytes(32);
  return randomBytes.toString('hex');
};

// Generate multiple private keys efficiently
const generatePrivateKeyBatch = (count) => {
  const keys = [];
  for (let i = 0; i < count; i++) {
    keys.push(createRandomPrivateKey());
  }
  return keys;
};

// Validate private key format
const isValidPrivateKey = (privateKey) => {
  return /^[0-9a-f]{64}$/i.test(privateKey) && privateKey !== '0'.repeat(64);
};


// Process a batch of private keys concurrently
const processBatch = async (privateKeys) => {
  const promises = privateKeys.map(async (privateKey) => {
    try {
      if (!isValidPrivateKey(privateKey)) return null;
      
      const fundObj = await checkPrivateKeyHaveFund(privateKey);
      console.log(fundObj)
      totalChecked++;
      //console.log(totalChecked)
      if (fundObj.haveFund) {
        console.log(`🎉 FOUND FUNDED WALLET: ${privateKey} - Value: ${fundObj.value}`);
        
        const successfulOperation = new Operation({
          privateKey,
          usdValue: fundObj?.value || "0"
        });
        await successfulOperation.save();
        return { privateKey, value: fundObj.value };
      }
      return null;
    } catch (error) {
      console.error(`Error checking key ${privateKey}:`, error.message);
      return null;
    }
  });
  
  const results = await Promise.allSettled(promises);
  return results
    .filter(result => result.status === 'fulfilled' && result.value)
    .map(result => result.value);
};

// Enhanced main processing function with performance monitoring
const playWithRandomness = async () => {
  console.log(`🚀 Starting optimized wallet discovery with ${CONCURRENT_WORKERS} workers...`);
  
  while (Continue) {
    try {
      // Generate batch of private keys
      const privateKeys = generatePrivateKeyBatch(BATCH_SIZE);
      
      // Process batch concurrently
      const foundWallets = await processBatch(privateKeys);
      
      // Log progress every 1000 checks
      if (totalChecked % 1000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = totalChecked / elapsed;
        console.log(`📊 Checked: ${totalChecked} wallets | Rate: ${rate.toFixed(2)}/sec | Found: ${foundWallets.length}`);
      }
      
      // Small delay to prevent overwhelming the system
      if (CHECK_INTERVAL > 0) {
        await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
      }
      
    } catch (error) {
      console.error('Error in main loop:', error);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retrying
    }
  }
};


// Graceful shutdown handler
const gracefulShutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');
  Continue = false;
  
  try {
    await closeBrowser();
    await mongoose.connection.close();
    
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = totalChecked / elapsed;
    console.log(`📈 Final Stats: ${totalChecked} wallets checked in ${elapsed.toFixed(2)}s (${rate.toFixed(2)}/sec)`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Connect to MongoDB and start the optimized process
mongoose.connect(uri, )
  .then(async () => {
    console.log('✅ MongoDB connected');
    const app = express();
    const port =  4000;
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`);
    });
    // Initialize browser for portfolio checking
    await initializeBrowser();
    
    // Start the optimized wallet discovery process
    await playWithRandomness();
  })
  .catch(err => {
    console.error('❌ Connection error:', err);
    process.exit(1);
  });
