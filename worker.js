const mongoose = require('mongoose');
const Queue = require('bull');
const redis = require('redis');
const User = require('./models/User');

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/telegram_bot', {});

// Set up Bull Queue to process jobs
const taskQueue = new Queue('bot-task-queue', 'redis://localhost:6379');

// Process jobs from the queue
taskQueue.process(async (job, done) => {
  const { telegramId, command, twitterHandle } = job.data;

  if (command === 'register') {
    // Process /register logic
    let user = await User.findOne({ telegramId });
    if (!user) {
      user = new User({ telegramId, twitterHandle, balance: 0 });
      await user.save();
      console.log(`User ${telegramId} registered with Twitter handle: ${twitterHandle}`);
    } else {
      console.log(`User ${telegramId} already exists`);
    }
  } else if (command === 'update') {
    // Process /update logic
    let user = await User.findOne({ telegramId });
    if (user) {
      user.twitterHandle = twitterHandle;
      await user.save();
      console.log(`User ${telegramId} updated with new Twitter handle: ${twitterHandle}`);
    } else {
      console.log(`User ${telegramId} does not exist`);
    }
  }

  done();  // Mark the job as completed
});
