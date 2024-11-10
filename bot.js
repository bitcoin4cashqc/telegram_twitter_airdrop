require('dotenv').config();
const { Telegraf, Scenes, session } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');

const { TwitterApi } = require('twitter-api-v2');
const { TwitterApiRateLimitPlugin } = require('@twitter-api-v2/plugin-rate-limit');

const { PublicKey } = require('@solana/web3.js');

const User = require('./models/User');
const Task = require('./models/Task');
const OAuthSession = require('./models/OAuthSession');


const skipTwitter = process.env.SKIP_TWITTER === 'true';

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/telegram_bot', {});

// Initialize the bot with your bot token
const bot = new Telegraf(process.env.TELEGRAM_BOT_API);
bot.use(session());
const admin = process.env.TG_ADMIN_ID;

// Define rate limit plugin
const rateLimitPlugin = new TwitterApiRateLimitPlugin();



//hardcode menu

const user_menu = [
  [
    { text: "📝 Register Wallet", callback_data: "register" },
    { text: "🔄 Update Wallet", callback_data: "update" }
  ],
  [
    { text: "📋 View Tasks", callback_data: "view_tasks" }
  ],
]

const admin_menu = [
  ...user_menu,
  [
    { text: "📋 Create Task", callback_data: "create_task" }
  ],
]

// Function to handle the /start command
async function showMainMenu(ctx) {
  const main_menu = (admin !== ctx.from.id.toString()) ? user_menu : admin_menu;
  await ctx.reply("Welcome! 👋 Choose an option below to get started:", {
    reply_markup: {
      inline_keyboard: main_menu
    }
  });
}

// Function to validate Solana wallet address
function isValidSolanaAddress(address) {
  try {
    new PublicKey(address);
    return PublicKey.isOnCurve(address); // Validates it's a Solana public key on the curve
  } catch (error) {
    return false; // Invalid if an error occurs
  }
}



// Function to notify all users of a new task with rate limit handling
async function notifyAllUsers(postUrl, rewardAmount, expirationTime, taskId, ctx) {
  const users = await User.find(); // Retrieve all users from the database
  const messageText = `New Task Available:\n\nPost: ${postUrl}\nReward: ${rewardAmount}\nExpires At: ${expirationTime.toLocaleString()}\nTask ID: ${taskId}`;
  
  let messageCount = 0;
  const maxMessagesPerSecond = 30; // Safe limit based on Telegram's broadcast rate limits

  for (const user of users) {
    try {
      await bot.telegram.sendMessage(user.telegramId, messageText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Participate in Task", callback_data: `task_button_${taskId}` }],
          ],
        },
      });

      messageCount++;
      
      // Respect the 30 messages per second limit
      if (messageCount >= maxMessagesPerSecond) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
        messageCount = 0; // Reset message count after waiting
      }
    } catch (error) {
      console.error(`Failed to send message to user ${user.telegramId}:`, error);
      await ctx.reply(`Failed to send message to user ${user.telegramId}`);
    }
  }
}


// Define the register scene
const registerScene = new Scenes.WizardScene(
  'register',
  async (ctx) => {
    await ctx.reply("Please provide your Solana Wallet:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const solanaWallet = ctx.message.text;

    // Validate Solana Wallet Address
    if (!isValidSolanaAddress(solanaWallet)) {
      await ctx.reply("The Solana Wallet address is invalid.");
      await ctx.scene.leave();
      return showMainMenu(ctx);  // Call the main menu function directly
    }

    await processRegister(ctx.message.from.id, solanaWallet);
    await ctx.reply(`Your Solana Wallet: ${solanaWallet}`);
    return ctx.scene.leave();
  }
);


// Define the update scene
const updateScene = new Scenes.WizardScene(
  'update',
  async (ctx) => {
    await ctx.reply("Please provide your new Solana Wallet:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    // Validate Solana Wallet Address
    const solanaWallet = ctx.message.text;

    if (!isValidSolanaAddress(solanaWallet)) {
      await ctx.reply("The Solana Wallet address is invalid.");
      await ctx.scene.leave();
      return showMainMenu(ctx);  // Call the main menu function directly
    }
    
    await processUpdate(ctx.message.from.id, solanaWallet);
    await ctx.reply(`Updated Solana Wallet to: ${solanaWallet}`);
    return ctx.scene.leave();
  }
);

// Define the create_task scene (admin-only)
const createTaskScene = new Scenes.WizardScene(
  'create_task',
  async (ctx) => {
    if (admin !== ctx.from.id.toString()) {
      await ctx.reply("Unauthorized access attempt.");
      return ctx.scene.leave();
    }
    await ctx.reply("Please provide the post URL:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.scene.state.postUrl = ctx.message.text;
    await ctx.reply("Please provide the reward amount:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.scene.state.rewardAmount = ctx.message.text;
    await ctx.reply("Please provide the time limit in minutes:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.scene.state.expirationTime = ctx.message.text;
    await ctx.reply("Please provide the task ID:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const { postUrl, rewardAmount, expirationTime } = ctx.scene.state;
    const taskId = ctx.message.text;

    await createTask(postUrl, rewardAmount, expirationTime, taskId);
    
    // Notify all users about the new task
    await notifyAllUsers(postUrl, rewardAmount, expirationTime, taskId, ctx);

    // Inform admin that the task has been sent to all users
    await ctx.reply(`Task created and sent to all users:\nPost: ${postUrl}\nReward: ${rewardAmount}\nExpires At: ${expirationTime.toLocaleString()}\nTask ID: ${taskId}`);
    
    return ctx.scene.leave();
  }
);


const commentScene = new Scenes.WizardScene(
  'commentScene',
  async (ctx) => {
    ctx.scene.state.taskId = ctx.match[1]; // Save taskId to state for later use
    await ctx.reply("Please provide your comment for the Twitter reply:");
    return ctx.wizard.next();
  },
  async (ctx) => {

    ctx.scene.state.comment = ctx.message.text; // Save comment to state
    await initiateOAuth(ctx, ctx.scene.state.taskId, ctx.scene.state.comment); // Call OAuth initiation
    return ctx.scene.leave(); // Exit scene
  }
);



// Create a stage for the scenes and register the scenes
const stage = new Scenes.Stage([registerScene, updateScene, createTaskScene, commentScene]);
bot.use(stage.middleware());



// Handle /start command
bot.command('start', (ctx) => showMainMenu(ctx));


// Action handlers for each button to enter the relevant scenes
bot.action('register', (ctx) => ctx.scene.enter('register'));
bot.action('update', (ctx) => ctx.scene.enter('update'));
bot.action('create_task', (ctx) => ctx.scene.enter('create_task'));


// OAuth initiation and callback handler
bot.action(/task_button_(.+)/, async (ctx) => {
   const taskId = ctx.match[1]; // Save taskId to state for later use
   // Retrieve the task to check expiration
   const task = await Task.findOne({ taskId });
   if (!task) {
     await ctx.reply("Task not found.");
     return;
   }
 
   // Check if the task has expired
   const currentTime = new Date();

   if (currentTime > task.expirationTime) {
     await ctx.reply("This task has expired. Please choose another task.");
     return showMainMenu(ctx);  // Call the main menu function directly
   }
   
  ctx.scene.enter('commentScene'); // Enter the comment scene instead of initiating OAuth directly
});

// Twitter OAuth callback
const app = express();
app.use(bot.webhookCallback('/telegram-webhook'));
bot.telegram.setWebhook(`${process.env.WEBHOOK}/telegram-webhook`);

// Modify OAuth initiation function to accept comment
async function initiateOAuth(ctx, taskId, comment) {
  const telegramId = ctx.from.id;
  const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_CONSUMER_KEY,
    appSecret: process.env.TWITTER_CONSUMER_SECRET,
  });

  try {
    const { oauth_token, oauth_token_secret } = await twitterClient.generateAuthLink(`${process.env.WEBHOOK}/twitter_callback`);

    // Save the OAuth session in the database along with the comment
    await OAuthSession.create({
      telegramId,
      oauth_token,
      oauth_token_secret,
      taskId,
      comment, // Save the comment with the session
    });

    const oauthUrl = `https://api.twitter.com/oauth/authenticate?oauth_token=${oauth_token}`;
    await ctx.reply(`Please authorize via Twitter: ${oauthUrl}`);
  } catch (error) {
    console.error("Error getting request token:", error);
    ctx.reply("Failed to initiate Twitter authorization.");
  }
}

app.get('/twitter_callback', async (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;

  try {
    const session = await OAuthSession.findOne({ oauth_token });
    if (!session) return res.send("Session expired or invalid. Please try again.");
    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_CONSUMER_KEY,
      appSecret: process.env.TWITTER_CONSUMER_SECRET,
      accessToken: session.oauth_token,
      accessSecret: session.oauth_token_secret,
    });

    const { accessToken, accessSecret } = await twitterClient.login(oauth_verifier);

    const task = await Task.findOne({ taskId: session.taskId });
    if (!task) return res.send("Task not found.");

    await processTask(session,task,accessToken,accessSecret);
    res.send("Authorization successful. Your task will be processed.");
  } catch (error) {
    console.error("Error getting access token:", error);
    res.send("Authorization failed.");
  }
});

// Function to handle Twitter actions with rate limit handling
async function processTask(oauthsession,task,accessToken,accessSecret) {
  const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_CONSUMER_KEY,
    appSecret: process.env.TWITTER_CONSUMER_SECRET,
    accessToken,
    accessSecret,
    plugins: [rateLimitPlugin],
  });

  async function autoRetryOnRateLimitError(callback) {
    while (true) {
      try {
        return await callback();
      } catch (error) {
        if (error.rateLimitError && error.rateLimit) {
          
          const timeToWait = error.rateLimit.reset * 1000 - Date.now();
          console.log("THIS USER IS RATE LIMITED BY TWITTER: ", accessToken);
          
          bot.telegram.sendMessage(oauthsession.telegramId, `Twitter is rate limiting you. Gotta wait: `+timeToWait / 1000 + " seconds. Your task is pending and will be retried right after.");
          await new Promise((resolve) => setTimeout(resolve, timeToWait));
          continue;
        }
        throw error;
      }
    }
  }

  // Get the stored comment from the OAuth session
  
  const comment = oauthsession.comment


  try {
    const xId = await twitterClient.v2.me();
    
    const tweetId = task.postUrl.split("/").pop();

    if (!skipTwitter){
      
      try {
        await autoRetryOnRateLimitError(() => twitterClient.v2.like(xId.data.id,tweetId));
        await autoRetryOnRateLimitError(() => twitterClient.v2.retweet(xId.data.id,tweetId));
        await autoRetryOnRateLimitError(() => twitterClient.v2.reply(comment, tweetId));
      } catch (error) {
        console.error("Non-rate limit error occurred:", error);
        bot.telegram.sendMessage(oauthsession.telegramId, `An error occurred while processing your task. Please try again later.`);
      }
      
    }
    
    
    

    //would add to user balance the session. oauth mongo

    console.log("Twitter task successfully processed for task:", oauthsession.taskId);
    bot.telegram.sendMessage(oauthsession.telegramId, `Twitter task for task ID ${oauthsession.taskId} completed successfully for ${task.rewardAmount} tokens.`);
    await OAuthSession.deleteOne({ telegramId: oauthsession.telegramId })
  } catch (error) {
    
    console.error("Error processing Twitter actions:", error);
    bot.telegram.sendMessage(oauthsession.telegramId, `Failed to complete Twitter task for task ID ${oauthsession.taskId}.`);
  }
}

// Function to handle user registration
async function processRegister(telegramId, solanaWallet) {
  let user = await User.findOne({ telegramId });
  if (!user) {
    user = new User({ telegramId, solanaWallet, balance: 0 });
    await user.save();
    console.log(`User ${telegramId} registered with Solana Wallet: ${solanaWallet}`);
  } else {
    console.log(`User ${telegramId} already exists`);
  }
}

// Function to handle user updates
async function processUpdate(telegramId, solanaWallet) {
  let user = await User.findOne({ telegramId });
  if (user) {
    user.solanaWallet = solanaWallet;
    await user.save();
    console.log(`User ${telegramId} updated with new Solana Wallet: ${solanaWallet}`);
  } else {
    console.log(`User ${telegramId} does not exist`);
  }
}

// Function to create a new task in the Task model
async function createTask(postUrl, rewardAmount, expirationTime, taskId) {
  expirationTime = new Date(Date.now() + expirationTime * 60000); // Set the expiration time

  const newTask = new Task({ postUrl, rewardAmount, expirationTime, taskId });
  await newTask.save();
  console.log(`Task created for post: ${postUrl} with reward: ${rewardAmount}`);
}


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
