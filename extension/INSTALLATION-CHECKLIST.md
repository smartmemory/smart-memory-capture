# ✅ Installation Checklist

## Pre-Installation Verification

- [x] All core files created
- [x] Icons generated (16px, 48px, 128px)
- [x] Documentation complete
- [x] Example server provided

## Installation Steps

### 1. Verify Files (30 seconds)

Check that these files exist:
```
✓ manifest.json
✓ popup.html, popup.css, popup.js
✓ library.html, library.css, library.js
✓ options.html, options.css, options.js
✓ content.js
✓ background.js
✓ icons/icon16.png
✓ icons/icon48.png
✓ icons/icon128.png
```

Run this command to verify:
```bash
cd /Users/ruze/reg/my/smart-memory-capture
ls -la manifest.json popup.* library.* options.* content.js background.js icons/*.png
```

### 2. Load Extension in Chrome (1 minute)

1. Open Chrome
2. Navigate to: `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select folder: `/Users/ruze/reg/my/smart-memory-capture`
6. Verify extension appears with 📋 icon

### 3. Test Basic Functionality (2 minutes)

**Test 1: Popup Opens**
- Click extension icon
- Popup should open with capture options
- ✓ Pass if popup displays

**Test 2: Capture Works**
- Navigate to any webpage (e.g., https://example.com)
- Click extension icon
- Select "Full Page"
- Click "Capture & Save"
- ✓ Pass if "Saved successfully!" message appears

**Test 3: Library Works**
- Click extension icon
- Click "View Library"
- New tab should open showing your clips
- ✓ Pass if you see your captured clip

**Test 4: Settings Work**
- Click extension icon
- Click "⚙️ Settings"
- Settings page should open
- ✓ Pass if settings page displays

### 4. Connect to SmartMemory (2 minutes)

Captures land in SmartMemory once you point the extension at an endpoint (Settings ⚙️):

**Option A: Local SmartMemory (no token)**
- Click "Detect local SmartMemory" — if a daemon is running on this machine
  (`http://127.0.0.1:9014`) it's auto-set as your capture target
- ✓ Pass if the status shows "Local SmartMemory running"

**Option B: Cloud (API token required)**
- Enter your API URL (e.g. `https://api.smartmemory.ai`) and paste your API token
- Click "Test Connection"
- ✓ Pass if connection successful

## Troubleshooting

### Extension won't load
```bash
# Check for syntax errors in manifest
cat manifest.json | python3 -m json.tool
```

### Icons not showing
```bash
# Regenerate icons
cd /Users/ruze/reg/my/smart-memory-capture
python3 generate_icons.py
```

### Capture not working
- Reload the webpage you're trying to capture
- Check Chrome console (F12) for errors
- Try a different website (some sites block extensions)

## Post-Installation

### Recommended Next Steps

1. **Pin the extension**
   - Right-click extension icon
   - Select "Pin"

2. **Set default tags**
   - Go to Settings
   - Add your commonly used tags

3. **Try all capture modes**
   - Full Page
   - Article (try on a news site)
   - Selection (select text first)
   - Screenshot

4. **Test right-click menu**
   - Select text on any page
   - Right-click
   - Choose "Capture selection to Smart Memory"

5. **Explore the library**
   - Search functionality
   - Filter by tags
   - Sort options
   - Export feature

## Quick Reference

### Key Files
- **manifest.json** - Extension config
- **popup.js** - Main capture logic
- **library.js** - Library viewer logic
- **background.js** - Sync and notifications

### Key Directories
- **icons/** - Extension icons
- **Documentation** - README, QUICKSTART, SETUP

### Useful Commands
```bash
# Verify installation
cd /Users/ruze/reg/my/smart-memory-capture
ls -la

# Regenerate icons
python3 generate_icons.py

# Check manifest syntax
cat manifest.json | python3 -m json.tool
```

## Success Criteria

You're successfully installed when:
- ✓ Extension appears in Chrome toolbar
- ✓ Popup opens when clicked
- ✓ Can capture a webpage
- ✓ Can view clips in library
- ✓ Can access settings

## Getting Help

1. Check `QUICKSTART.md` for fast setup
2. Check `README.md` for detailed docs and the SmartMemory connection model
3. Check browser console for errors (F12)

---

**Installation complete! Start capturing! 🎉**
