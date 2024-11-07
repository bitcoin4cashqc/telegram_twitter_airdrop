require('dotenv').config();
const { Telegraf, Scenes, session } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const { TwitterApi } = require('twitter-api-v2');
const { TwitterApiRateLimitPlugin } = require('@twitter-api-v2/plugin-rate-limit');
const User = require('./models/User');
const Task = require('./models/Task');
const OAuthSession = require('./models/OAuthSession');

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/telegram_bot', {});

// Initialize the bot with your bot token
const bot = new Telegraf(process.env.TELEGRAM_BOT_API);
bot.use(session());
const admin = process.env.TG_ADMIN_ID;


//hardcode menu

const user_menu = [
  [
    { text: "📝 Register Account", callback_data: "register" },
    { text: "🔄 Update Account", callback_data: "update" }
  ],
  [
    { text: "📋 View Tasks", callback_data: "view_tasks" }
  ],
]

const admin_menu = [
  ...user_menu,
  [
    { text: "📋 Create Task", callback_data: "create_tasks" }
  ],
]
// Define the register scene
const registerScene = new Scenes.WizardScene(
  'register',
  async (ctx) => {
    await ctx.reply("Please provide your Twitter handle (e.g., @yourhandle):");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const twitterHandle = ctx.message.text;
    await processRegister(ctx.message.from.id, twitterHandle);
    await ctx.reply(`Registered Twitter handle: ${twitterHandle}`);
    return ctx.scene.leave();
  }
);

// Define the update scene
const updateScene = new Scenes.WizardScene(
  'update',
  async (ctx) => {
    await ctx.reply("Please provide your new Twitter handle (e.g., @newhandle):");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const newTwitterHandle = ctx.message.text;
    await processUpdate(ctx.message.from.id, newTwitterHandle);
    await ctx.reply(`Updated Twitter handle to: ${newTwitterHandle}`);
    return ctx.scene.leave();
  }
);

// Define the create_task scene (admin-only)
const createTaskScene = new Scenes.WizardScene(
  'create_task',
  async (ctx) => {
    if (admin !== ctx.message.from.id.toString()) {
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
    ctx.scene.state.timeLimitMinutes = ctx.message.text;
    await ctx.reply("Please provide the task ID:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const { postUrl, rewardAmount, timeLimitMinutes } = ctx.scene.state;
    const taskId = ctx.message.text;

    await createTask(postUrl, rewardAmount, timeLimitMinutes, taskId);
    await ctx.reply(
      `Task created:\nPost: ${postUrl}\nReward: ${rewardAmount}\nTime: ${timeLimitMinutes} mins\nID: ${taskId}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Participate in Task", callback_data: `task_button_${taskId}` }],
          ],
        },
      }
    );
    return ctx.scene.leave();
  }
);


// Create a stage for the scenes and register the scenes
const stage = new Scenes.Stage([registerScene, updateScene, createTaskScene]);
bot.use(stage.middleware());



// Handle /start command with an interactive menu
bot.command('start', async (ctx) => {
  const main_menu = (admin !== ctx.message.from.id.toString()) ? user_menu : admin_menu;
  await ctx.reply("Welcome! 👋 Choose an option below to get started:", {
    reply_markup: {
      inline_keyboard: main_menu
    }
  });
});


// Action handlers for each button to enter the relevant scenes
bot.action('register', (ctx) => ctx.scene.enter('register'));
bot.action('update', (ctx) => ctx.scene.enter('update'));
bot.action('create_task', (ctx) => ctx.scene.enter('create_task'));

// OAuth initiation and callback handler
bot.action(/task_button_(.+)/, async (ctx) => {
  if (!checkRateLimit(ctx.from.id)) {
    return ctx.reply("You have exceeded the rate limit. Please try again later.");
  }

  const taskId = ctx.match[1];
  const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_CONSUMER_KEY,
    appSecret: process.env.TWITTER_CONSUMER_SECRET,
  });

  try {
    const { oauth_token, oauth_token_secret } = await twitterClient.generateAuthLink(`${process.env.WEBHOOK}/twitter_callback`);

    // Save the OAuth session in the database
    await OAuthSession.create({ oauth_token, oauth_token_secret, taskId });

    const oauthUrl = `https://api.twitter.com/oauth/authenticate?oauth_token=${oauth_token}`;
    await ctx.reply(`Please authorize via Twitter: ${oauthUrl}`);
  } catch (error) {
    console.error("Error getting request token:", error);
    ctx.reply("Failed to initiate Twitter authorization.");
  }
});

// Twitter OAuth callback
const app = express();
app.use(bot.webhookCallback('/telegram-webhook'));
bot.telegram.setWebhook(`${process.env.WEBHOOK}/telegram-webhook`);

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

    await processTask(task.postUrl, accessToken, accessSecret, session.taskId);
    res.send("Authorization successful. Your task will be processed.");
  } catch (error) {
    console.error("Error getting access token:", error);
    res.send("Authorization failed.");
  }
});

// Function to handle Twitter actions
async function processTask(postUrl, accessToken, accessSecret, taskId) {
  const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_CONSUMER_KEY,
    appSecret: process.env.TWITTER_CONSUMER_SECRET,
    accessToken,
    accessSecret,
  });

  try {
    const tweetId = postUrl.split("/").pop();
    await twitterClient.v2.like(tweetId);
    await twitterClient.v2.retweet(tweetId);
    await twitterClient.v2.reply("Awesome post!", tweetId);

    console.log("Twitter task successfully processed for task:", taskId);
    bot.telegram.sendMessage(admin, `Twitter task for task ID ${taskId} completed successfully.`);
  } catch (error) {
    console.error("Error processing Twitter actions:", error);
    bot.telegram.sendMessage(admin, `Failed to complete Twitter task for task ID ${taskId}.`);
  }
}

// Function to handle user registration
async function processRegister(telegramId, twitterHandle) {
  let user = await User.findOne({ telegramId });
  if (!user) {
    user = new User({ telegramId, twitterHandle, balance: 0 });
    await user.save();
    console.log(`User ${telegramId} registered with Twitter handle: ${twitterHandle}`);
  } else {
    console.log(`User ${telegramId} already exists`);
  }
}

// Function to handle user updates
async function processUpdate(telegramId, twitterHandle) {
  let user = await User.findOne({ telegramId });
  if (user) {
    user.twitterHandle = twitterHandle;
    await user.save();
    console.log(`User ${telegramId} updated with new Twitter handle: ${twitterHandle}`);
  } else {
    console.log(`User ${telegramId} does not exist`);
  }
}

// Function to create a new task in the Task model
async function createTask(postUrl, rewardAmount, timeLimitMinutes, taskId) {
  const newTask = new Task({ postUrl, rewardAmount, timeLimitMinutes, taskId });
  await newTask.save();
  console.log(`Task created for post: ${postUrl} with reward: ${rewardAmount}`);
}


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
