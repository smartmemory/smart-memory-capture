# Pipeline Quick Start

Get the AI/ML pipeline running in 5 minutes.

## Step 1: Install (1 minute)

```bash
cd pipeline
pip install -r requirements.txt
```

## Step 2: Start Storage Service (1 minute)

In one terminal:
```bash
cd ../service
python main.py
```

Note the API key printed!

## Step 3: Configure Pipeline (1 minute)

```bash
cd ../pipeline
cp .env.example .env
```

Edit `.env`:
```env
STORAGE_SERVICE_URL=http://localhost:8000
STORAGE_API_KEY=<key-from-step-2>
```

## Step 4: Start Pipeline (1 minute)

```bash
python main.py
```

You'll see:
```
🚀 Initializing AI/ML Pipeline...
  ✓ Content extractor initialized
  ✓ Embedding generator initialized (mock)
  ✓ Entity extractor initialized (mock)
  ✓ Summary generator initialized (mock)
✓ Pipeline ready

⚠️  No pipeline API keys configured!
Generated default API key: AbC123XyZ...
```

**Copy the pipeline API key!**

## Step 5: Configure Extension (1 minute)

1. Open extension settings
2. Mode: **Server Primary**
3. Endpoint: `http://localhost:8001/api/clips` (pipeline port!)
4. API Key: (from step 4)
5. Test connection ✓

## Step 6: Test! (30 seconds)

1. Navigate to any webpage
2. Click extension icon
3. Capture page
4. Watch the pipeline logs:

```
📥 Processing clip: Example Page
  → Stage 1: Content extraction
  → Stage 2: Metadata extraction
  → Stage 3: Summary generation
  → Stage 4: Embedding generation
  → Stage 5: Forwarding to storage service
✓ Clip processed successfully
```

## Done! 🎉

Your clips now go through AI processing before storage!

---

## Architecture

```
Extension (Chrome)
    ↓
Pipeline (port 8001) ← You point extension here
    ↓ [AI Processing]
    ↓
Storage (port 8000)
    ↓
Database
```

## What Gets Added

Each clip is enriched with:
- ✅ Summary (auto-generated)
- ✅ Keywords (extracted)
- ✅ Entities (people, orgs, places)
- ✅ Topics (categories)
- ✅ Embeddings (for semantic search)
- ✅ Sentiment analysis
- ✅ Reading time

## Enable Production AI

For real AI models (not mocks):

```bash
pip install sentence-transformers spacy transformers torch
python -m spacy download en_core_web_sm
```

Then restart the pipeline!

---

## Troubleshooting

**Can't connect to storage?**
- Make sure storage service is running on port 8000
- Check STORAGE_API_KEY in .env

**Extension can't connect?**
- Use port 8001 (pipeline), not 8000 (storage)
- Check pipeline API key

**Slow processing?**
- Normal for first run (models loading)
- Use mock mode for development
- Enable GPU for production
