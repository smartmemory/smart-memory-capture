# 📋 Smart Memory Capture

**Version:** 0.4.0

A Chrome extension similar to OneNote Web Clipper that lets you capture web content and save it to your own storage instead of Microsoft's cloud.

## ✨ Features

- **Multiple Capture Modes**
  - 📄 Full Page - Capture entire page content
  - 📰 Article - Extract main article content
  - ✂️ Selection - Capture selected text only
  - 📸 Screenshot - Capture visual screenshot

- **Organize Your Clips**
  - Add tags for easy categorization
  - Add personal notes to each clip
  - Search and filter your library
  - Sort by date or title

- **Storage Options**
  - Local browser storage (default)
  - Sync to your own server/API
  - Export/import as JSON files

- **Beautiful UI**
  - Modern, intuitive interface
  - Full-featured library viewer
  - Quick capture via right-click menu

## 🚀 Installation

### Load as Unpacked Extension (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `smart-memory-capture` folder
5. The extension icon should appear in your toolbar

### First Time Setup

1. Click the extension icon to open the popup
2. Click "⚙️ Settings" to configure options
3. (Optional) Set up sync endpoint if you want to save to your own server

## 📖 Usage

### Capturing Content

1. Navigate to any webpage you want to capture
2. Click the extension icon in your toolbar
3. Select your preferred capture mode:
   - **Full Page**: Captures all text content
   - **Article**: Attempts to extract main article (great for news sites)
   - **Selection**: First select text on the page, then choose this option
   - **Screenshot**: Takes a visual snapshot of the visible area
4. Add tags and notes (optional)
5. Click "Capture & Save"

### Quick Capture

Right-click on any selected text and choose "Capture selection to Smart Memory" for instant capture.

### Viewing Your Library

1. Click the extension icon
2. Click "View Library" button
3. Browse, search, and filter your saved clips
4. Click any clip to view full details

### Syncing to Your Own Server

If you want to automatically sync clips to your own backend:

1. Go to Settings (⚙️)
2. Enable "Enable automatic sync"
3. Enter your API endpoint URL
4. Test the connection
5. All new clips will be automatically sent to your server

**API Format**: Clips are sent as POST requests with JSON body:

```json
{
  "id": "1234567890",
  "title": "Page Title",
  "url": "https://example.com",
  "mode": "full",
  "content": {
    "type": "html",
    "data": "text content",
    "html": "<html>..."
  },
  "tags": ["tag1", "tag2"],
  "notes": "My notes",
  "timestamp": "2025-10-09T18:50:48.000Z",
  "favicon": "https://example.com/favicon.ico"
}
```

## 🔧 Building Your Own Backend

Here's a simple Node.js/Express example to receive clips:

```javascript
const express = require('express');
const app = express();

app.use(express.json({ limit: '50mb' }));

app.post('/api/clips', (req, res) => {
  const clip = req.body;
  
  // Save to database, file system, etc.
  console.log('Received clip:', clip.title);
  
  // Your storage logic here
  // saveToDatabase(clip);
  // saveToFile(clip);
  // etc.
  
  res.json({ success: true, id: clip.id });
});

app.listen(3000, () => {
  console.log('Clip receiver running on port 3000');
});
```

You can also use:
- **Supabase** - PostgreSQL database with REST API
- **Firebase** - Real-time database
- **Airtable** - Spreadsheet-like database with API
- **Your own REST API** - Any backend framework

## 📁 File Structure

```
smart-memory-capture/
├── manifest.json          # Extension configuration
├── popup.html/css/js      # Extension popup UI
├── library.html/css/js    # Full library viewer
├── options.html/css/js    # Settings page
├── content.js             # Content script (runs on pages)
├── background.js          # Background service worker
├── icons/                 # Extension icons
└── README.md             # This file
```

## 🛠️ Customization

### Change Default Tags

Go to Settings and set your default tags that will be pre-filled for new clips.

### Modify Capture Behavior

Edit `popup.js` function `capturePageContent()` to customize how content is extracted.

### Add Custom Storage

Edit `background.js` function `syncToServer()` to add authentication headers, custom formatting, etc.

## 📊 Data Export/Import

### Export

1. Go to Settings
2. Click "Export All Clips"
3. Save the JSON file

### Import

1. Go to Settings
2. Click "Import Clips"
3. Select a previously exported JSON file

## 🔒 Privacy

- All data is stored locally in your browser by default
- No data is sent to any third party unless you configure sync
- You have full control over where your data goes
- Export your data anytime in standard JSON format

## 🐛 Troubleshooting

**Extension not capturing content:**
- Make sure you've granted necessary permissions
- Try reloading the page
- Check if the page allows content scripts (some sites block them)

**Sync not working:**
- Test your endpoint in Settings
- Check browser console for errors
- Ensure your server accepts CORS requests from Chrome extensions

**Storage full:**
- Export and clear old clips
- The extension stores up to 1000 clips automatically

## 📝 License

MIT License - Feel free to modify and use as you wish!

## 🤝 Contributing

This is a personal project, but feel free to fork and customize for your needs!

## 💡 Ideas for Enhancement

- Add markdown export
- Implement full-text search
- Add cloud storage integrations (Dropbox, Google Drive)
- Create browser sync across devices
- Add PDF export
- Implement clip collections/folders
- Add browser bookmarks import
- Create mobile companion app

---

**Made with ❤️ for people who want to own their data**

## Documentation

Full SmartMemory documentation: https://docs.smartmemory.ai
