const mongoose = require('mongoose');

const OAuthSessionSchema = new mongoose.Schema({
  oauth_token: { type: String, required: true },
  oauth_token_secret: { type: String, required: true },
  taskId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: '10m' }, // Expires after 10 minutes
});

module.exports = mongoose.model('OAuthSession', OAuthSessionSchema);
