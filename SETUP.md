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

## Setting Up Your Own Backend (Optional)

If you want to sync clips to your own server, here's a minimal example:

### Node.js + Express

```bash
mkdir clip-server
cd clip-server
npm init -y
npm install express cors
```

Create `server.js`:
```javascript
const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Save clips to JSON file
app.post('/api/clips', (req, res) => {
  const clip = req.body;
  const clips = JSON.parse(fs.readFileSync('clips.json', 'utf8') || '[]');
  clips.push(clip);
  fs.writeFileSync('clips.json', JSON.stringify(clips, null, 2));
  res.json({ success: true });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
```

Run: `node server.js`

Then in extension settings, set sync endpoint to: `http://localhost:3000/api/clips`

### Python + Flask

```bash
pip install flask flask-cors
```

Create `server.py`:
```python
from flask import Flask, request, jsonify
from flask_cors import CORS
import json

app = Flask(__name__)
CORS(app)

@app.route('/api/clips', methods=['POST'])
def save_clip():
    clip = request.json
    with open('clips.json', 'a') as f:
        f.write(json.dumps(clip) + '\n')
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(port=3000)
```

Run: `python server.py`

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
