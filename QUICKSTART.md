# 🚀 Quick Start Guide

## Install the Extension (2 minutes)

1. **Open Chrome Extensions Page**
   - Type `chrome://extensions/` in your address bar
   - Or: Menu → More Tools → Extensions

2. **Enable Developer Mode**
   - Toggle the switch in the top-right corner

3. **Load the Extension**
   - Click "Load unpacked"
   - Navigate to and select the `extension` folder
   - Click "Select"

4. **Done!** 
   - The extension icon (📋) should appear in your toolbar
   - Pin it for easy access

## First Capture (1 minute)

1. **Navigate to any webpage** you want to save
2. **Click the extension icon** in your toolbar
3. **Choose a capture mode:**
   - Full Page (default) - saves all text
   - Article - extracts main content
   - Selection - select text first, then capture
   - Screenshot - takes a picture
4. **Add tags** (optional): `research, important, tutorial`
5. **Click "Capture & Save"**
6. **View your library** by clicking "View Library"

## Tips & Tricks

### Quick Capture
- Select any text on a page
- Right-click → "Capture selection to Smart Memory"

### Organize with Tags
- Use consistent tags: `work`, `personal`, `research`
- Tags are searchable and filterable

### Search Your Clips
- Open library and use the search bar
- Filter by type or tags
- Sort by date or title

### Export Your Data
- Settings → Export All Clips
- Saves as JSON file you can backup

## Connect to SmartMemory

Captures land in SmartMemory once you point the extension at an endpoint. Go to Settings (⚙️):

**Option A — Local SmartMemory (no token):**
1. Click **Detect local SmartMemory** — if a daemon is running on this machine
   (`http://127.0.0.1:9014`), it's auto-set as your capture target.
2. If it's not detected, start it (`smartmemory server`) and detect again.

**Option B — Cloud (API token required):**
1. Enter your SmartMemory API URL (e.g. `https://api.smartmemory.ai`)
2. Paste your API token from the dashboard (Settings → API Keys) — **required for cloud sync**
3. Enable auto-sync if desired, then click **Test Connection** to verify

### Customize
- Edit CSS files to change colors
- Modify capture logic in `popup.js`
- Add custom features you need

## Common Use Cases

**📚 Research**
- Capture articles and papers
- Tag by topic or project
- Search when you need to reference

**💼 Work**
- Save documentation and tutorials
- Clip important emails or messages
- Build a knowledge base

**🎓 Learning**
- Save course materials
- Capture code snippets
- Build study notes

**🔖 Reading List**
- Save articles to read later
- Capture quotes and highlights
- Organize by category

## Need Help?

- Check `README.md` for detailed documentation and the SmartMemory connection model
- Open browser console (F12) to see errors

---

**You're all set! Start capturing! 📋✨**
