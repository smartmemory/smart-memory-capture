# Setup Instructions

## Quick Start

### 1. Generate Icons

The extension needs icon files. You have two options:

**Option A: Use the icon generator (recommended)**
1. Open `create-icons.html` in Chrome
2. Three icon files will download automatically
3. Move them to the `icons/` folder

**Option B: Create your own icons**
Create three PNG files in the `icons/` folder:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)  
- `icon128.png` (128x128 pixels)

You can use any image editor or online tool to create these.

**Option C: Use placeholder icons temporarily**
Run this command to create simple colored squares:
```bash
cd icons
# Create simple placeholder PNGs (requires ImageMagick)
convert -size 16x16 xc:#667eea icon16.png
convert -size 48x48 xc:#667eea icon48.png
convert -size 128x128 xc:#667eea icon128.png
```

### 2. Load Extension in Chrome

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the `smart-memory-capture` folder
6. Done! The extension icon will appear in your toolbar

### 3. Test It Out

1. Navigate to any webpage
2. Click the extension icon
3. Try capturing the page
4. Click "View Library" to see your saved clips

## Setting Up SmartMemory Sync (Optional)

If you want to sync clips to your SmartMemory account:

### 1. Get your API token

1. Log in to your SmartMemory dashboard
2. Go to **Settings → API Keys**
3. Create a new key and copy it

### 2. Configure the extension

1. Open the extension and click **⚙️ Settings**
2. Under **SmartMemory Sync**, enter your API URL (e.g. `https://api.smartmemory.ai`)
3. Paste your API token in the **API Token** field
4. Optionally enable **automatic sync**
5. Click **Test Connection** to verify

> **Note:** The sync endpoint must use HTTPS. `http://localhost` is accepted for local development only.

## Troubleshooting

### Icons not showing
- Make sure icon files exist in `icons/` folder
- Reload the extension in `chrome://extensions/`

### Extension not loading
- Check for errors in `chrome://extensions/`
- Make sure all files are in the correct location
- Verify manifest.json is valid JSON

### Capture not working
- Reload the webpage you're trying to capture
- Check browser console for errors (F12)
- Some sites block content scripts (banking sites, etc.)

### Sync not working
- Test your endpoint in Settings
- Check CORS is enabled on your server
- Verify endpoint URL is correct

## Next Steps

1. Customize the UI colors in the CSS files
2. Add your own backend integration
3. Modify capture logic for specific sites
4. Add custom features you need

Enjoy your personal web clipper! 🎉
