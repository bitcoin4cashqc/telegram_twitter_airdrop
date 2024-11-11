// models/UserTask.js
const mongoose = require('mongoose');

// Define UserTask schema
const userTaskSchema = new mongoose.Schema({
  telegramId: { 
    type: Number, 
    required: true, 
    index: true 
  },  // User's Telegram ID
  taskId: { 
    type: Number, 
    required: true, 
    index: true 
  },  // ID of the completed task
  completedAt: { 
    type: Date, 
    default: Date.now 
  },  // Timestamp of task completion
});

// Create UserTask model from the schema
module.exports = mongoose.model('UserTask', userTaskSchema);
