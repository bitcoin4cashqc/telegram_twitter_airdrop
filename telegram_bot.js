const { Telegraf } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config(); // This will load the .env file contents into process.env

// Import user model from a separate file
const User = require('./models/User');


// MongoDB connection
mongoose.connect('mongodb://localhost:27017/telegram_bot', {});




// Initialize the bot with your bot token
const bot = new Telegraf(process.env.TELEGRAM_BOT_API);

// Handle /start command
bot.start(async (ctx) => {
  const telegramId = ctx.message.from.id;

  // Check if user already exists
  let user = await User.findOne({ telegramId });
  if (user) {
    return ctx.reply('You already have an account. You can update your Twitter handle with /update.');
  }

  // Ask for Twitter handle
  ctx.reply('Welcome! Please provide your Twitter handle:');
  bot.on('text', async (ctx) => {
    const twitterHandle = ctx.message.text;

    // Create new user
    user = new User({
      telegramId: telegramId,
      twitterHandle: twitterHandle,
      balance: 0,
    });

    await user.save();
    ctx.reply(`Account created! Twitter handle: ${twitterHandle}.`);
  });
});

// Handle /update command for changing Twitter handle
bot.command('update', async (ctx) => {
  const telegramId = ctx.message.from.id;

  // Check if user exists
  let user = await User.findOne({ telegramId });
  if (!user) {
    return ctx.reply('You do not have an account yet. Use /start to create one.');
  }

  // Ask for new Twitter handle
  ctx.reply('Please provide your new Twitter handle:');
  bot.on('text', async (ctx) => {
    const newTwitterHandle = ctx.message.text;
    user.twitterHandle = newTwitterHandle;
    await user.save();
    ctx.reply(`Twitter handle updated to: ${newTwitterHandle}.`);
  });
});



// Setting up Webhooks
const app = express();
app.use(bot.webhookCallback('/secret-path'));
bot.telegram.setWebhook(`https://c6e7-174-93-234-160.ngrok-free.app/secret-path`);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


// Graceful shutdown for PM2
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
