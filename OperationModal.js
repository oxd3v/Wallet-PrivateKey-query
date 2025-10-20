const mongoose = require('mongoose');


// Define a schema
const OperationSchema = new mongoose.Schema({
  address: String,
  privateKey: String,
  usdValue: String,
  createdAt: { type: Date, default: Date.now }
});

// Create a model
const Operation = mongoose.model('Operation', OperationSchema);

module.exports = {Operation}
// Save a doc
