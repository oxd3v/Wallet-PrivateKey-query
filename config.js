
const { Wallet } = require('ethers');

const crypto = require('crypto');
const cluster = require('cluster');
const os = require('os');




const { getPortFolioValue, initializeBrowser, closeBrowser } = require("./puppeter.js");
const { Operation } = require("./OperationModal.js");



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

const checkPrivateKeyHaveFund = async (privateKey, retryCount = 0) => {
  try {
    const wallet = new Wallet(privateKey);
    if (!wallet.address) {
      return {
        haveFund: false,
        walletAddress: '',
        value: '',
        error: 'Invalid wallet address'
      };
    }
    
    const walletAddress = wallet.address;
    
    // Enhanced fund detection with retry logic
    let value = null;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts && !value) {
      try {
        value = await getPortFolioValue({ walletAddress });
        if (value) break;
      } catch (error) {
        attempts++;
        if (attempts < maxAttempts) {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
    }
    
    if (!value || value === null) {
      return {
        walletAddress,
        haveFund: false,
        value: '$0',
        error: 'Failed to fetch portfolio value'
      };
    }
    
    console.log(`🔍 Checking wallet: ${walletAddress} - Value: ${value}`);
    
    // Enhanced fund detection logic
    const cleanValue = value.toString().trim();
    
    // Check for explicit zero values
    if (cleanValue === '$0' || cleanValue === '0' || cleanValue === '$0.00') {
      return {
        walletAddress,
        haveFund: false,
        value: cleanValue
      };
    }
    
    // Check for large values with suffixes (B/M/K)
    if (['B', 'M', 'K'].includes(cleanValue.slice(-1))) {
      const numeric = parseFloat(cleanValue.replace(/[^0-9.]/g, ''));
      if (!isNaN(numeric) && numeric > 0) {
        return {
          walletAddress,
          haveFund: true,
          value: cleanValue,
          isLargeValue: true
        };
      }
    }
    
    // Parse numeric value
    const numeric = parseFloat(cleanValue.replace(/[^0-9.]/g, ''));
    
    // Enhanced threshold checking
    const hasFunds = !isNaN(numeric) && numeric > 0.001; // Minimum $0.001 threshold
    
    if (hasFunds) {
      console.log(`💰 FOUND FUNDED WALLET: ${walletAddress} - Value: ${cleanValue}`);
      return {
        walletAddress,
        haveFund: true,
        value: cleanValue,
        numericValue: numeric
      };
    }
    
    return {
      walletAddress,
      haveFund: false,
      value: cleanValue,
      numericValue: numeric
    };
    
  } catch (err) {
    console.log(`❌ Error checking wallet: ${err.message}`);
    return {
      walletAddress: '',
      haveFund: false,
      value: '',
      error: err.message
    };
  }
};

// Enhanced random private key generation with multiple entropy sources
const createRandomPrivateKey = () => {
  // Use multiple entropy sources for better randomness
  const entropy1 = crypto.randomBytes(32);
  const entropy2 = crypto.randomBytes(16);
  const entropy3 = crypto.randomBytes(8);
  
  // Combine entropy sources using XOR
  const combined = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    combined[i] = entropy1[i] ^ entropy2[i % 16] ^ entropy3[i % 8];
  }
  
  // Add additional entropy from system sources
  const timestamp = Date.now();
  const processId = process.pid;
  const randomSeed = Math.floor(Math.random() * 0xFFFFFFFF);
  
  // Mix additional entropy
  for (let i = 0; i < 4; i++) {
    const byte = (timestamp >> (i * 8)) & 0xFF;
    combined[i] ^= byte;
  }
  for (let i = 4; i < 8; i++) {
    const byte = (processId >> ((i - 4) * 8)) & 0xFF;
    combined[i] ^= byte;
  }
  for (let i = 8; i < 12; i++) {
    const byte = (randomSeed >> ((i - 8) * 8)) & 0xFF;
    combined[i] ^= byte;
  }
  
  // Ensure the private key is valid (not zero, not invalid)
  const privateKey = combined.toString('hex');
  
  // Additional validation to ensure it's a valid private key
  if (privateKey === '0'.repeat(64) || privateKey === 'f'.repeat(64)) {
    // If invalid, generate a new one with pure crypto randomness
    return crypto.randomBytes(32).toString('hex');
  }
  
  return privateKey;
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


// Enhanced batch processing with better error handling and statistics
const processBatch = async (privateKeys) => {
  const startTime = Date.now();
  const foundWallets = [];
  
  const promises = privateKeys.map(async (privateKey, index) => {
    try {
      if (!isValidPrivateKey(privateKey)) {
        console.log(`⚠️ Invalid private key format: ${privateKey.substring(0, 8)}...`);
        return null;
      }

      const fundObj = await checkPrivateKeyHaveFund(privateKey);
      totalChecked++;
      
      if (fundObj.haveFund) {
        console.log(`🎉 FOUND FUNDED WALLET #${totalChecked}:`);
        console.log(`   Private Key: ${privateKey}`);
        console.log(`   Address: ${fundObj.walletAddress}`);
        console.log(`   Value: ${fundObj.value}`);
        console.log(`   Numeric Value: ${fundObj.numericValue || 'N/A'}`);
        console.log(`   Large Value: ${fundObj.isLargeValue ? 'YES' : 'NO'}`);
        console.log('─'.repeat(60));

        // Save to database
        try {
          const successfulOperation = new Operation({
            address: fundObj.walletAddress,
            privateKey,
            usdValue: fundObj.value || "0"
          });
          await successfulOperation.save();
          console.log(`✅ Saved to database successfully`);
        } catch (dbError) {
          console.error(`❌ Database save error:`, dbError.message);
        }
        
        foundWallets.push({ 
          privateKey, 
          address: fundObj.walletAddress,
          value: fundObj.value,
          numericValue: fundObj.numericValue,
          isLargeValue: fundObj.isLargeValue
        });
        
        return { 
          privateKey, 
          address: fundObj.walletAddress,
          value: fundObj.value,
          numericValue: fundObj.numericValue,
          isLargeValue: fundObj.isLargeValue
        };
      }
      
      // Log progress for debugging (every 100th check)
      if (totalChecked % 10000 === 0) {
        console.log(`📊 Progress: ${totalChecked} wallets checked, ${foundWallets.length} found`);
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Error checking key ${privateKey.substring(0, 8)}...:`, error.message);
      return null;
    }
  });

  const results = await Promise.allSettled(promises);
  const batchTime = Date.now() - startTime;
  
  // Log batch statistics
  //console.log(`⏱️ Batch processed in ${batchTime}ms (${(privateKeys.length / batchTime * 1000).toFixed(2)} wallets/sec)`);
  
  return results
    .filter(result => result.status === 'fulfilled' && result.value)
    .map(result => result.value);
};

// Enhanced main processing function with comprehensive monitoring
const playWithRandomness = async () => {
  // console.log(`🚀 Starting optimized wallet discovery with enhanced randomness...`);
  // console.log(`📋 Configuration:`);
  // console.log(`   - Batch Size: ${BATCH_SIZE}`);
  // console.log(`   - Check Interval: ${CHECK_INTERVAL}ms`);
  // console.log(`   - Min Fund Threshold: $0.001`);
  // console.log(`   - Retry Logic: Enabled`);
  // console.log('─'.repeat(60));

  let totalFound = 0;
  let lastStatsTime = Date.now();
  const statsInterval = 10000; // Log stats every 10 seconds

  while (Continue) {
    try {
      const batchStartTime = Date.now();
      
      // Generate batch of private keys with enhanced randomness
      const privateKeys = generatePrivateKeyBatch(BATCH_SIZE);

      // Process batch concurrently
      const foundWallets = await processBatch(privateKeys);
      
      if (foundWallets.length > 0) {
        totalFound += foundWallets.length;
        console.log(`🎯 BATCH SUMMARY: Found ${foundWallets.length} funded wallets in this batch!`);
        foundWallets.forEach((wallet, index) => {
          console.log(`   ${index + 1}. ${wallet.address} - ${wallet.value}`);
        });
      }

      // Enhanced statistics logging
      const now = Date.now();
      if (now - lastStatsTime >= statsInterval) {
        const elapsed = (now - startTime) / 1000;
        const rate = totalChecked / elapsed;
        const foundRate = totalFound / elapsed;
        
        // console.log(`📊 STATISTICS UPDATE:`);
        // console.log(`   Total Checked: ${totalChecked.toLocaleString()}`);
        // console.log(`   Total Found: ${totalFound.toLocaleString()}`);
        // console.log(`   Success Rate: ${((totalFound / totalChecked) * 100).toFixed(6)}%`);
        // console.log(`   Check Rate: ${rate.toFixed(2)} wallets/sec`);
        // console.log(`   Find Rate: ${foundRate.toFixed(6)} wallets/sec`);
        // console.log(`   Runtime: ${(elapsed / 60).toFixed(2)} minutes`);
        // console.log('─'.repeat(60));
        
        lastStatsTime = now;
      }

      // Adaptive delay based on performance
      const batchTime = Date.now() - batchStartTime;
      const adaptiveDelay = Math.max(CHECK_INTERVAL, Math.min(1000, batchTime / 10));
      
      if (adaptiveDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
      }

    } catch (error) {
      console.error('❌ Error in main loop:', error.message);
      console.error('Stack trace:', error.stack);
      
      // Exponential backoff on errors
      const backoffDelay = Math.min(5000, 1000 * Math.pow(2, Math.min(5, totalChecked % 10)));
      console.log(`⏳ Backing off for ${backoffDelay}ms due to error...`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
};


// Enhanced graceful shutdown handler with comprehensive statistics
const gracefulShutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');
  Continue = false;

  try {
    await closeBrowser();
    await mongoose.connection.close();

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = totalChecked / elapsed;
    
    console.log('\n📈 FINAL STATISTICS:');
    console.log('─'.repeat(50));
    console.log(`Total Wallets Checked: ${totalChecked.toLocaleString()}`);
    console.log(`Total Runtime: ${(elapsed / 60).toFixed(2)} minutes`);
    console.log(`Average Check Rate: ${rate.toFixed(2)} wallets/sec`);
    console.log(`Peak Performance: ${(totalChecked / elapsed * 60).toFixed(2)} wallets/minute`);
    console.log('─'.repeat(50));
    console.log('✅ Shutdown completed successfully');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};


module.exports = {
  playWithRandomness,
  gracefulShutdown
}



