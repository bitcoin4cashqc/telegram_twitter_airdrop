const mongoose = require('mongoose');

const OAuthSessionSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, index: true },
  oauth_token: { type: String, required: true, index: true },
  oauth_token_secret: { type: String, required: true },
  createdAt: { type: Date, default: Date.now},
});

module.exports = mongoose.model('OAuthSession', OAuthSessionSchema);
