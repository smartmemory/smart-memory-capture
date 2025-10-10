# Quick Start Guide

Get the Smart Memory Capture API running in 5 minutes.

## Step 1: Install (1 minute)

```bash
cd service
pip install -r requirements.txt
```

## Step 2: Start Server (30 seconds)

```bash
python main.py
```

You'll see output like:
```
⚠️  No API keys configured!
Generated default API key: XyZ123AbC456...
Set this in your Chrome extension settings.
✓ Database initialized
✓ Smart Memory Capture API is ready
INFO:     Uvicorn running on http://0.0.0.0:8000
```

**Copy the API key!** You'll need it for the extension.

## Step 3: Test API (1 minute)

Open another terminal:

```bash
# Test health check
curl http://localhost:8000/health
```

You should see:
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-10-09T19:26:20.000Z"
}
```

## Step 4: Configure Extension (2 minutes)

1. Open Chrome extension settings
2. Select **"Server Primary"** mode
3. Set sync endpoint: `http://localhost:8000/api/clips`
4. Paste the API key from Step 2
5. Click **"Test Connection"**
6. Should see: ✓ Connection successful!

## Step 5: Capture! (30 seconds)

1. Navigate to any webpage
2. Click extension icon
3. Click "Capture & Save"
4. Check the server logs - you should see the clip being saved!

## Done! 🎉

Your clips are now being saved to your own server.

---

## Next Steps

### View API Documentation

Open in browser: http://localhost:8000/docs

### Test with Script

```bash
# Edit test_api.py and set your API key
python test_api.py
```

### Use PostgreSQL (Production)

```bash
# Install PostgreSQL driver
pip install psycopg2-binary

# Update .env
echo "DATABASE_URL=postgresql://user:pass@localhost/smart_memory" > .env

# Restart server
python main.py
```

### Deploy with Docker

```bash
docker-compose up -d
```

---

## Troubleshooting

**Can't connect from extension?**
- Make sure server is running on port 8000
- Check CORS settings in `main.py`
- Try `http://localhost:8000` instead of `127.0.0.1`

**Authentication failed?**
- Copy API key exactly (no extra spaces)
- Include "Bearer " prefix in extension
- Check server logs for the actual key

**Database errors?**
- Delete `smart_memory.db` and restart
- Or switch to PostgreSQL

---

## API Endpoints

Once running, you can use:

```bash
# List all clips
curl -H "Authorization: Bearer YOUR_KEY" \
  http://localhost:8000/api/clips

# Search clips
curl -H "Authorization: Bearer YOUR_KEY" \
  "http://localhost:8000/api/search?q=test"

# Get stats
curl -H "Authorization: Bearer YOUR_KEY" \
  http://localhost:8000/api/stats
```

Full API docs: http://localhost:8000/docs
