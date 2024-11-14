const mongoose = require('mongoose');

// Define user schema and model
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true, index: true },
  solanaWallet: { type: String, required: true },
  twitterUsername: { type: String, required: true },  
  balance: { type: Number, default: 0 },
});

module.exports = mongoose.model('User', userSchema);
