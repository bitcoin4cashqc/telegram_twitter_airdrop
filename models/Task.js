const mongoose = require('mongoose');

// Define Task schema
const taskSchema = new mongoose.Schema({
  postUrl: { 
    type: String, 
    required: true 
  },  // Link to the Twitter post
  rewardAmount: { 
    type: Number, 
    required: true 
  },  // Reward amount for users who interact
  timeLimitMinutes: { 
    type: Number, 
    required: true 
  },  // Time limit in minutes for the task
  createdAt: { 
    type: Date, 
    default: Date.now 
  },  // Date when the task was created
});

// Create Task model from the schema
module.exports = mongoose.model('Task', taskSchema);