const express = require('express');
const mongoose = require('mongoose');
const { initializeBrowser } = require('./puppeter.js');
const { playWithRandomness, gracefulShutdown,totalChecked } = require('./config.js');
require('dotenv').config()
// Replace with your MongoDB URI
const uri = process.env.MONGO_URL; // or use Atlas URI

const app = express();
const port = 4000;


// Connect to MongoDB and start the optimized process
mongoose.connect(uri,)
  .then(async () => {
    console.log('✅ MongoDB connected');

    // Initialize browser for portfolio checking
    await initializeBrowser();

    // Start the optimized wallet discovery process
    playWithRandomness();

    app.get('/', (req, res) => {
      res.send(`Hello from TypeScript Node.js Backend! checked total: ${totalChecked}`);
    });
    app.listen(port, () => {
      console.log(`Server listening at http://localhost:${port}`);
    });
  })
  .catch(err => {
    console.error('❌ Connection error:', err);
    process.exit(1);
  });


// Handle shutdown signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
