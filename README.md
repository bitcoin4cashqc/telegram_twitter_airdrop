Solana Telegram Task Bot

This bot is designed to manage tasks and airdrops for users, integrating with Twitter and the Solana blockchain. Users can register wallets, participate in tasks and airdrops, and withdraw rewards. Built using the Telegram Bot API, Twitter API, and Solana Web3, this bot provides an interactive experience for both users and admins. This bot is especially useful for community engagement and distributing rewards in a decentralized manner.

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/yourusername/solana-telegram-task-bot/actions)

Installation

1. Clone the Repository

```bash
git clone https://github.com/bitcoin4cashqc/telegram_twitter_airdrop
cd telegram_twitter_airdrop
```

2. Install Dependencies

```bash
npm install
```

3. Configure Environment Variables

    Copy the example environment variables file:

```bash
cp .env.example .env
```

Edit .env with your values:

```bash
TELEGRAM_BOT_API="YOUR_TELEGRAM_BOT_TOKEN"
WEBHOOK="YOUR_WEBHOOK_URL"
TG_ADMIN_ID="YOUR_ADMIN_TELEGRAM_ID"
TWITTER_CONSUMER_KEY="YOUR_TWITTER_CONSUMER_KEY"
TWITTER_CONSUMER_SECRET="YOUR_TWITTER_CONSUMER_SECRET"
SOLANA_PRIVATE_KEY="YOUR_SOLANA_PRIVATE_KEY"
TOKEN_MINT_ADDRESS="YOUR_TOKEN_MINT_ADDRESS"
SKIP_TWITTER="true"  # Set to "true" to skip Twitter API like/retweet/comment requests during testing
```

4. Run the Bot

```bash
node bot.js
```

Environment Variables

Here’s a breakdown of required environment variables in .env:

- **TELEGRAM_BOT_API**: Telegram bot token.
- **WEBHOOK**: Public URL for the bot’s webhook.
- **TG_ADMIN_ID**: Telegram ID of the bot admin.
- **TWITTER_CONSUMER_KEY**: Twitter API key.
- **TWITTER_CONSUMER_SECRET**: Twitter API secret.
- **SOLANA_PRIVATE_KEY**: Private key for Solana wallet used for withdrawals.
- **TOKEN_MINT_ADDRESS**: Address of the Solana token mint.
- **SKIP_TWITTER**: (Optional) Set to "true" to skip Twitter interactions for testing.

Usage

Twitter API Configuration

1. Create a Twitter Developer App

    Go to the Twitter Developer Portal and create an app.
    Configure permissions for Read and Write.
    Set app type as Web App, Automated App, or Bot.
    Make sure Callback URL matches WEBHOOK (e.g., https://your-webhook-url/twitter_callback).

2. Adjust Twitter Rate Limits

The bot automatically handles Twitter API rate limits with a retry mechanism, sending users a notification if they are rate-limited.

PM2 Configuration

Using PM2 helps to ensure the bot runs continuously, even after server restarts.

1. Install PM2 Globally

```bash
npm install -g pm2
```

2. Start the Bot with PM2

```bash
pm2 start bot.js --name "solana-telegram-task-bot"
```

3. Save the PM2 Process List and Configure Restart on Reboot

```bash
pm2 save
pm2 startup
```

After running `pm2 startup`, follow the instructions given in the terminal output to complete setup.

Contributing

Please read the contributing guidelines for more information. Contributions are welcome!

FAQ

**Q: How do I run tests?**  
A: Currently, tests are not included. You can add your own test cases to ensure functionality.
