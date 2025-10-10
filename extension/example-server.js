/**
 * Example Node.js server for Smart Memory Capture
 * 
 * This is a simple backend that receives clips from the extension
 * and saves them to a JSON file. You can modify this to save to
 * a database, cloud storage, or any other destination.
 * 
 * Setup:
 * 1. npm install express cors
 * 2. node example-server.js
 * 3. In extension settings, set sync endpoint to: http://localhost:3000/api/clips
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const CLIPS_FILE = 'clips-database.json';

// Middleware
app.use(cors()); // Allow requests from Chrome extension
app.use(express.json({ limit: '50mb' })); // Support large screenshots

// Ensure clips file exists
if (!fs.existsSync(CLIPS_FILE)) {
  fs.writeFileSync(CLIPS_FILE, JSON.stringify([], null, 2));
}

// Helper function to read clips
function readClips() {
  try {
    const data = fs.readFileSync(CLIPS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading clips:', error);
    return [];
  }
}

// Helper function to write clips
function writeClips(clips) {
  try {
    fs.writeFileSync(CLIPS_FILE, JSON.stringify(clips, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing clips:', error);
    return false;
  }
}

// API Routes

// Save a new clip
app.post('/api/clips', (req, res) => {
  const clip = req.body;
  
  // Validate clip
  if (!clip.id || !clip.title || !clip.url) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields' 
    });
  }
  
  console.log(`📋 Received clip: "${clip.title}" from ${clip.url}`);
  
  // Read existing clips
  const clips = readClips();
  
  // Check for duplicates
  const existingIndex = clips.findIndex(c => c.id === clip.id);
  if (existingIndex >= 0) {
    // Update existing clip
    clips[existingIndex] = clip;
    console.log('   Updated existing clip');
  } else {
    // Add new clip
    clips.push(clip);
    console.log('   Added new clip');
  }
  
  // Save to file
  if (writeClips(clips)) {
    res.json({ 
      success: true, 
      id: clip.id,
      total: clips.length 
    });
  } else {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save clip' 
    });
  }
});

// Get all clips
app.get('/api/clips', (req, res) => {
  const clips = readClips();
  res.json({ 
    success: true, 
    clips: clips,
    total: clips.length 
  });
});

// Get a specific clip
app.get('/api/clips/:id', (req, res) => {
  const clips = readClips();
  const clip = clips.find(c => c.id === req.params.id);
  
  if (clip) {
    res.json({ success: true, clip: clip });
  } else {
    res.status(404).json({ 
      success: false, 
      error: 'Clip not found' 
    });
  }
});

// Delete a clip
app.delete('/api/clips/:id', (req, res) => {
  const clips = readClips();
  const filteredClips = clips.filter(c => c.id !== req.params.id);
  
  if (clips.length === filteredClips.length) {
    return res.status(404).json({ 
      success: false, 
      error: 'Clip not found' 
    });
  }
  
  if (writeClips(filteredClips)) {
    console.log(`🗑️  Deleted clip: ${req.params.id}`);
    res.json({ 
      success: true,
      total: filteredClips.length 
    });
  } else {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete clip' 
    });
  }
});

// Search clips
app.get('/api/search', (req, res) => {
  const query = req.query.q?.toLowerCase();
  
  if (!query) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing search query' 
    });
  }
  
  const clips = readClips();
  const results = clips.filter(clip => 
    clip.title.toLowerCase().includes(query) ||
    clip.content.data.toLowerCase().includes(query) ||
    clip.tags.some(tag => tag.toLowerCase().includes(query))
  );
  
  res.json({ 
    success: true, 
    results: results,
    total: results.length 
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Smart Memory Capture server is running',
    clips: readClips().length
  });
});

// Start server
app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  📋 Smart Memory Capture Server                        ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  Server running on: http://localhost:${PORT}              ║`);
  console.log(`║  Clips stored in:   ${CLIPS_FILE}                  ║`);
  console.log('║                                                        ║');
  console.log('║  Endpoints:                                            ║');
  console.log(`║  POST   /api/clips          - Save a clip              ║`);
  console.log(`║  GET    /api/clips          - Get all clips            ║`);
  console.log(`║  GET    /api/clips/:id      - Get specific clip        ║`);
  console.log(`║  DELETE /api/clips/:id      - Delete a clip            ║`);
  console.log(`║  GET    /api/search?q=...   - Search clips             ║`);
  console.log('║                                                        ║');
  console.log('║  Extension Settings:                                   ║');
  console.log(`║  Sync Endpoint: http://localhost:${PORT}/api/clips     ║`);
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('\nWaiting for clips...\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down server...');
  console.log(`📊 Total clips saved: ${readClips().length}`);
  process.exit(0);
});
