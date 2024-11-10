const mongoose = require('mongoose');

// Define Airdrop schema
const airdropSchema = new mongoose.Schema({
  rewardAmount: { 
    type: Number, 
    required: true 
  },  // Reward amount for users who interact
  expirationTime: { 
    type: Date, 
    required: true 
  },  // Expiration date
  airdropId: { 
    type: Number, 
    required: true,
    index: true 
  },  // identifier
  createdAt: { 
    type: Date, 
    default: Date.now 
  },  // Date when the task was created
});

// Create Airdrop model from the schema
module.exports = mongoose.model('Airdrop', airdropSchema);