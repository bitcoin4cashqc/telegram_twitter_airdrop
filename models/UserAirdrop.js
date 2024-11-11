// models/airdrop.js
const mongoose = require('mongoose');

// Define UserAirdrop schema
const userAirdropSchema = new mongoose.Schema({
  telegramId: { 
    type: Number, 
    required: true, 
    index: true 
  },  // User's Telegram ID
  airdropId: { 
    type: Number, 
    required: true, 
    index: true 
  },  // ID of the completed airdrop
  completedAt: { 
    type: Date, 
    default: Date.now 
  },  // Timestamp of airdrop completion
});

// Create UserAirdrop model from the schema
module.exports = mongoose.model('UserAirdrop', userAirdropSchema);
