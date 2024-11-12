require('dotenv').config();
const { Telegraf, Scenes, session } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');

const { TwitterApi } = require('twitter-api-v2');
const { TwitterApiRateLimitPlugin } = require('@twitter-api-v2/plugin-rate-limit');

const BigNumber = require('bignumber.js'); // For accurate floating-point arithmetic


const { Connection, Keypair, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, transfer, getMint } = require('@solana/spl-token');


const NETWORK = clusterApiUrl('mainnet-beta'); // Change to 'devnet' for testing
const connection = new Connection(NETWORK, 'confirmed');

const User = require('./models/User');
const Task = require('./models/Task');
const Airdrop = require('./models/Airdrop');
const OAuthSession = require('./models/OAuthSession');
const UserTask = require('./models/UserTask');
const UserAirdrop = require('./models/UserAirdrop');


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
    { text: "📋 View Tasks", callback_data: "view_tasks" },{ text: "📋 View Airdrops", callback_data: "view_airdrops" }
  ],
  [
    { text: "💼 View Wallet", callback_data: "view_wallet" } 
  
  ]
]

const admin_menu = [
  ...user_menu,
  [
    { text: "📋 Create Task", callback_data: "create_task" },{ text: "📋 Create Airdrop", callback_data: "create_airdrop" }
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
async function notifyAllUsers(postUrl, rewardAmount, expirationTime, taskId, ctx, types) {
  const users = await User.find(); // Retrieve all users from the database
  var messageText = ""
  var dataToSend = {}
  if (types == "tasks"){
    messageText = `New Task Available:\n\nPost: ${postUrl}\nReward: ${rewardAmount}\nExpires At: ${expirationTime.toLocaleString()}\nTask ID: ${taskId}`;
    dataToSend = { text: "Participate in Task", callback_data: `task_button_${taskId}` }
  }else{
    messageText = `New Airdrop Available:\n\nReward: ${rewardAmount}\nExpires At: ${expirationTime.toLocaleString()}\nAirdrop ID: ${taskId}`;
    dataToSend = { text: "Participate in Airdrop", callback_data: `airdrop_button_${taskId}` }
  }
  
  let messageCount = 0;
  const maxMessagesPerSecond = 30; // Safe limit based on Telegram's broadcast rate limits

  for (const user of users) {
    try {
      await bot.telegram.sendMessage(user.telegramId, messageText, {
        reply_markup: {
          inline_keyboard: [
            [dataToSend],
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


// Function to get all active tasks and send them to the user
async function getAllTasks(ctx) {
  try {
    // Fetch all tasks that haven't expired
    const tasks = await Task.find({ expirationTime: { $gt: new Date() } });
    
    // If no tasks are available
    if (tasks.length === 0) {
      await ctx.reply("No active tasks are available at the moment.");
      return;
    }

    // Display each task with its details and participation button
    for (const task of tasks) {
      const messageText = `New Task Available:\n\nPost: ${task.postUrl}\nReward: ${task.rewardAmount}\nExpires At: ${task.expirationTime.toLocaleString()}\nTask ID: ${task.taskId}`;
      const dataToSend = { text: "Participate in Task", callback_data: `task_button_${task.taskId}` };

      await ctx.reply(messageText, {
        reply_markup: {
          inline_keyboard: [[dataToSend]]
        }
      });
    }
  } catch (error) {
    console.error("Error fetching tasks:", error);
    await ctx.reply("Failed to retrieve tasks. Please try again later.");
  }
}

// Function to get all active airdrops and send them to the user
async function getAllAirdrops(ctx) {
  try {
    // Fetch all airdrops that haven't expired
    const airdrops = await Airdrop.find({ expirationTime: { $gt: new Date() } });
    
    // If no airdrops are available
    if (airdrops.length === 0) {
      await ctx.reply("No active airdrops are available at the moment.");
      return;
    }

    // Display each airdrop with its details and participation button
    for (const airdrop of airdrops) {
      const messageText = `Airdrop Available:\n\nReward: ${airdrop.rewardAmount}\nExpires At: ${airdrop.expirationTime.toLocaleString()}\nAirdrop ID: ${airdrop.airdropId}`;
      const dataToSend = { text: "Participate in Airdrop", callback_data: `airdrop_button_${airdrop.airdropId}` };

      await ctx.reply(messageText, {
        reply_markup: {
          inline_keyboard: [[dataToSend]]
        }
      });
    }
  } catch (error) {
    console.error("Error fetching airdrops:", error);
    await ctx.reply("Failed to retrieve airdrops. Please try again later.");
  }
}

//Function to check if X user have made X task
async function hasUserCompletedTask(telegramId, taskId) {
  const userTask = await UserTask.findOne({ telegramId, taskId });
  return !!userTask; // Returns true if userTask exists, false otherwise
}

//Function to mark task done by X user
async function markTaskCompleted(telegramId, taskId) {
  const userTask = new UserTask({ telegramId, taskId });
  await userTask.save();
}


//Function to check if X user have made X Airrop
async function hasUserCompletedAirdrop(telegramId, airdropId) {
  const airdropTask = await UserAirdrop.findOne({ telegramId, airdropId });
  return !!airdropTask; // Returns true if userTask exists, false otherwise
}

//Function to mark airdrop done by X user
async function markAirdropCompleted(telegramId, airdropId) {
  const airdropTask = new UserAirdrop({ telegramId, airdropId });
  await airdropTask.save();
}

async function topUpUserBalance(telegramId, amount) {
  await User.findOneAndUpdate(
    { telegramId },
    { $inc: { balance: amount } },
    { new: true, upsert: true } // upsert ensures user document is created if not found
  );
}

async function removeFromUserBalance(telegramId, amount) {
  const user = await User.findOne({ telegramId });
  if (!user || user.balance < amount) {
    return false; // Insufficient balance
  }

  user.balance -= amount;
  await user.save();
  return true; // Deduction successful
}



/////////////////////////////SOLANA/////////////////////////////////


// Initialize keypair from private key in .env
function loadKeypairFromEnv() {
  const secretKey = Uint8Array.from(JSON.parse(process.env.SOLANA_PRIVATE_KEY));
  return Keypair.fromSecretKey(secretKey);
}

// Define the withdrawal function
async function processWithdrawal(userWalletAddress, amount) {
  try {
    const adminKeypair = loadKeypairFromEnv();
    const userPublicKey = new PublicKey(userWalletAddress);
    const mintAddress = new PublicKey(process.env.TOKEN_MINT_ADDRESS);

    // Retrieve the mint information for decimals
    const mintInfo = await getMint(connection, mintAddress);
    const decimals = mintInfo.decimals;

    // Convert amount to smallest units based on decimals
    const amountInSmallestUnits = new BigNumber(amount).multipliedBy(new BigNumber(10).pow(decimals)).toFixed(0);

    // Get or create token accounts
    const adminTokenAccount = await getOrCreateAssociatedTokenAccount(connection, adminKeypair, mintAddress, adminKeypair.publicKey);
    const userTokenAccount = await getOrCreateAssociatedTokenAccount(connection, adminKeypair, mintAddress, userPublicKey);

    // Transfer tokens
    await transfer(
      connection,
      adminKeypair,           // payer
      adminTokenAccount.address,  // from
      userTokenAccount.address,   // to
      adminKeypair.publicKey,     // authority
      new BigNumber(amountInSmallestUnits).toNumber() // amount in smallest units
    );

    console.log(`Successfully transferred ${amount} tokens to ${userWalletAddress}`);
    return `Successfully transferred ${amount} tokens to ${userWalletAddress}`;
  } catch (error) {
    console.error("Error during withdrawal:", error);
    throw new Error("Withdrawal failed. Please try again later.");
  }
}

/////////////////////////////SCENES/////////////////////////////////


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
    await notifyAllUsers(postUrl, rewardAmount, expirationTime, taskId, ctx, "tasks");

    // Inform admin that the task has been sent to all users
    await ctx.reply(`Task created and sent to all users:\nPost: ${postUrl}\nReward: ${rewardAmount}\nExpires At: ${expirationTime.toLocaleString()}\nTask ID: ${taskId}`);
    
    return ctx.scene.leave();
  }
);

// Define the create_task scene (admin-only)
const createAirdropScene = new Scenes.WizardScene(
  'create_airdrop',
  async (ctx) => {
    if (admin !== ctx.from.id.toString()) {
      await ctx.reply("Unauthorized access attempt.");
      return ctx.scene.leave();
    }
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
    await ctx.reply("Please provide the airdrop ID:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const { rewardAmount, expirationTime } = ctx.scene.state;
    const airdropId = ctx.message.text;

    await createAirdrop(rewardAmount, expirationTime, airdropId);
    
    // Notify all users about the new task
    await notifyAllUsers("", rewardAmount, expirationTime, airdropId, ctx, "airdrop");

    // Inform admin that the task has been sent to all users
    await ctx.reply(`Airdrop created and sent to all users:\nReward: ${rewardAmount}\nExpires At: ${expirationTime.toLocaleString()}\nTask ID: ${airdropId}`);
    
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

//////////////////////////////////////////////////////////////////////////3

// Create a stage for the scenes and register the scenes
const stage = new Scenes.Stage([registerScene, updateScene, createTaskScene, commentScene, createAirdropScene]);
bot.use(stage.middleware());



// Handle /start command
bot.command('start', (ctx) => showMainMenu(ctx));
bot.action('back_to_menu', (ctx) => showMainMenu(ctx));

// Action handlers for each button to enter the relevant scenes
bot.action('register', (ctx) => ctx.scene.enter('register'));
bot.action('update', (ctx) => ctx.scene.enter('update'));
bot.action('create_task', (ctx) => ctx.scene.enter('create_task'));
bot.action('create_airdrop', (ctx) => ctx.scene.enter('create_airdrop'));
bot.action('view_tasks', (ctx) => getAllTasks(ctx));
bot.action('view_airdrops', (ctx) => getAllAirdrops(ctx));





// OAuth initiation and callback handler
bot.action(/task_button_(.+)/, async (ctx) => {
  const taskId = ctx.match[1]; // Save taskId to state for later use
  // Retrieve the task to check expiration
  const task = await Task.findOne({ taskId });
  if (!task) {
    await ctx.reply("Task not found.");
    return;
  }

  // Check if the airdrop has expired
  const currentTime = new Date();

  if (currentTime > task.expirationTime) {
    await ctx.reply("This Task has expired. Please choose another task.");
    return showMainMenu(ctx);  // Call the main menu function directly
  }

  //check if user already did the task
  const telegramId = ctx.from.id;
  const taskCheck = await hasUserCompletedTask(telegramId,taskId)

  if (taskCheck){
    await ctx.reply("This Task was already completed by you. Please choose another task.");
    return showMainMenu(ctx);  // Call the main menu function directly
  }
  
  ctx.scene.enter('commentScene'); // Enter the comment scene instead of initiating OAuth directly
  markTaskCompleted(telegramId, taskId) 
  topUpUserBalance(telegramId, task.rewardAmount)
});

// OAuth initiation and callback handler
bot.action(/airdrop_button_(.+)/, async (ctx) => {
   const airdropId = ctx.match[1]; // Save airdropId to state for later use
   // Retrieve the task to check expiration
   const aidrop = await Airdrop.findOne({ airdropId });
   if (!aidrop) {
     await ctx.reply("Airdrop not found.");
     return;
   }
 
   // Check if the task has expired
   const currentTime = new Date();

   if (currentTime > aidrop.expirationTime) {
     await ctx.reply("This aidrop has expired. Please choose another aidrop.");
     return showMainMenu(ctx);  // Call the main menu function directly
   }

  //check if user already did the task
  const telegramId = ctx.from.id;
  const airdropCheck = await hasUserCompletedAirdrop(telegramId,airdropId)

  if (airdropCheck){
    await ctx.reply("This Airdrop was already claimed by you. Please choose another airdrop.");
    return showMainMenu(ctx);  // Call the main menu function directly
  }

   
  markAirdropCompleted(telegramId, airdropId) 
  topUpUserBalance(telegramId, aidrop.rewardAmount)
  await ctx.reply("You claimed the airdrop!");
   
});



// Handle "View Wallet" action
bot.action('view_wallet', async (ctx) => {
  const telegramId = ctx.from.id;

  // Retrieve user data from the database
  const user = await User.findOne({ telegramId });
  if (!user) {
    await ctx.reply("No wallet information found. Please register your wallet first.");
    return showMainMenu(ctx); // Send back to the main menu
  }

  const messageText = `💼 Wallet Information:\n\n` +
                      `Solana Wallet: ${user.solanaWallet || 'Not Registered'}\n` +
                      `Balance: ${user.balance || 0} tokens\n\n` +
                      `Choose an option below:`;

  await ctx.reply(messageText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Withdraw All", callback_data: "withdraw_all" }],
        [{ text: "Go Back", callback_data: "back_to_menu" }]
      ]
    }
  });
});

// Handle "Withdraw All" action
bot.action('withdraw_all', async (ctx) => {
  const telegramId = ctx.from.id;

  // Retrieve the user's balance from the database
  const user = await User.findOne({ telegramId });
  if (!user || user.balance <= 0) {
    await ctx.reply("Your balance is zero or not available.");
    return showMainMenu(ctx); // Send back to the main menu if no balance
  }

  try {
    // Process the withdrawal
    const message = await processWithdrawal(user.solanaWallet, user.balance);

    // Reset the user's balance to 0 after successful withdrawal
    user.balance = 0;
    await user.save();

    await ctx.reply(message); // Notify the user of success
  } catch (error) {
    await ctx.reply(error.message); // Notify the user of any errors
  }

  showMainMenu(ctx); // Show the main menu after withdrawal
});



/////////////////////////////////////////APP WEBHOOK

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
    await OAuthSession.deleteOne({ telegramId: oauthsession.telegramId })
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

// Function to create a new task in the Task model
async function createAirdrop(rewardAmount, expirationTime, airdropId) {
  expirationTime = new Date(Date.now() + expirationTime * 60000); // Set the expiration time

  const newAirdrop = new Airdrop({rewardAmount, expirationTime, airdropId });
  await newAirdrop.save();
  console.log(`Airdrop created with reward: ${rewardAmount}`);
}


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
