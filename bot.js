require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const Queue = require('bull');


// Initialize the bot with your bot token
const bot = new Telegraf(process.env.TELEGRAM_BOT_API);

// Set up Bull Queue for background jobs
const taskQueue = new Queue('bot-task-queue', 'redis://localhost:6379');

// Helper to parse command and argument
const parseCommand = (text) => {
  const [command, ...args] = text.trim().split(/\s+/);
  return { command, args };
};

// Handle /register command
bot.command('register', async (ctx) => {
  const { args } = parseCommand(ctx.message.text);

  // If no argument provided (no Twitter handle), prompt the user
  if (!args.length) {
    return ctx.reply('Please provide your Twitter handle. Example: /register @yourhandle');
  }

  const twitterHandle = args[0];

  // Enqueue background job to register user with their Twitter handle
  taskQueue.add({ telegramId: ctx.message.from.id, command: 'register', twitterHandle });

  ctx.reply(`Processing registration for Twitter handle: ${twitterHandle}`);
});

// Handle /update command
bot.command('update', async (ctx) => {
  const { args } = parseCommand(ctx.message.text);

  // If no argument provided (no Twitter handle), prompt the user
  if (!args.length) {
    return ctx.reply('Please provide your new Twitter handle. Example: /update @yournewhandle');
  }

  const newTwitterHandle = args[0];

  // Enqueue background job to update user's Twitter handle
  taskQueue.add({ telegramId: ctx.message.from.id, command: 'update', twitterHandle: newTwitterHandle });

  ctx.reply(`Updating your Twitter handle to: ${newTwitterHandle}`);
});

// Setting up Webhooks
const app = express();
app.use(bot.webhookCallback('/telegram-webhook'));
bot.telegram.setWebhook(process.env.WEBHOOK);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown for PM2
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
