const mongoose = require('mongoose');
const Queue = require('bull');
const redis = require('redis');
const User = require('./models/User');
const Task = require('./models/Task');

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/telegram_bot', {});

// Set up Bull Queue to process jobs
const taskQueue = new Queue('bot-task-queue', 'redis://localhost:6379');

// Process jobs from the queue
taskQueue.process(async (job, done) => {
  const { telegramId, command, twitterHandle, postUrl, rewardAmount, timeLimitMinutes } = job.data;

  
  if (command === 'register') {
    // Process /register logic
    await processRegister(telegramId, twitterHandle);
  } else if (command === 'update') {
    // Process /update logic
    await processUpdate(telegramId, twitterHandle);
  } else if (command === 'createTask') {
    // Process task creation logic
    await createTask(postUrl, rewardAmount, timeLimitMinutes);
  } else {
    console.log('Unknown command:', command);
  }

  done();  // Mark the job as completed
});

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
async function createTask(postUrl, rewardAmount, timeLimitMinutes) {
  const newTask = new Task({
    postUrl,
    rewardAmount,
    timeLimitMinutes
  });

  await newTask.save();
  console.log(`Task created for post: ${postUrl} with reward: ${rewardAmount}`);
}
