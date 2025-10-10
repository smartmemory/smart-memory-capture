# Smart Memory Capture - AI/ML Pipeline

AI-powered processing pipeline that sits between the Chrome extension and storage service to extract, enrich, and analyze content.

## Architecture

```
Chrome Extension → Pipeline Service → Storage Service
                   (AI/ML Processing)   (Database)
```

## Features

### 🤖 AI/ML Processing

- **Content Extraction** - Clean HTML, extract article content
- **Entity Recognition** - Extract people, organizations, locations
- **Keyword Extraction** - Identify key terms and phrases
- **Topic Classification** - Categorize content by topic
- **Summary Generation** - Create concise summaries
- **Embedding Generation** - Vector embeddings for semantic search
- **Sentiment Analysis** - Analyze content sentiment
- **Language Detection** - Identify content language

### 📊 Enriched Metadata

Each clip is enriched with:
- Summary (200 words)
- Named entities (people, orgs, places)
- Keywords (top 10)
- Topics (categories)
- Embeddings (384-dim vector)
- Word count & reading time
- Language & sentiment

## Quick Start

### 1. Install Dependencies

```bash
cd pipeline
pip install -r requirements.txt
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:
```env
STORAGE_SERVICE_URL=http://localhost:8000
STORAGE_API_KEY=your-storage-api-key
```

### 3. Start Pipeline

```bash
python main.py
```

Pipeline starts on `http://localhost:8001`

### 4. Start Storage Service

In another terminal:
```bash
cd ../service
python main.py
```

Storage service on `http://localhost:8000`

### 5. Configure Extension

Update extension settings:
- Endpoint: `http://localhost:8001/api/clips` (pipeline, not storage!)
- API Key: (from pipeline startup)
- Mode: Server Primary

## Processing Flow

```
1. Extension captures content
   ↓
2. Sends to Pipeline (port 8001)
   ↓
3. Pipeline processes:
   - Extract clean content
   - Generate summary
   - Extract entities & keywords
   - Classify topics
   - Generate embeddings
   - Analyze sentiment
   ↓
4. Pipeline forwards enriched clip to Storage (port 8000)
   ↓
5. Storage saves to database
   ↓
6. Success response back to extension
```

## API Endpoints

### POST /api/clips
Process and store a clip

**Request:** Same format as extension sends
**Response:**
```json
{
  "success": true,
  "message": "Clip processed and stored successfully",
  "clip_id": "1728519120000",
  "processing_stages": {
    "content_extraction": true,
    "metadata_extraction": true,
    "summary_generation": true,
    "embedding_generation": true,
    "storage": true
  },
  "metadata": {
    "summary": "This article discusses...",
    "entities_count": 5,
    "keywords_count": 10,
    "topics": ["technology", "business"]
  }
}
```

### GET /health
Health check with model status

### GET /api/stats
Pipeline statistics

### POST /api/reprocess/{clip_id}
Reprocess existing clip with updated models

## Production AI/ML Setup

### Install AI/ML Libraries

```bash
pip install sentence-transformers spacy transformers torch
python -m spacy download en_core_web_sm
```

### Enable Advanced Features

Uncomment in `requirements.txt`:
```txt
sentence-transformers==2.2.2
spacy==3.7.2
transformers==4.35.0
torch==2.1.0
```

### Configure Models

Edit `.env`:
```env
EMBEDDING_MODEL=all-MiniLM-L6-v2
SUMMARIZATION_MODEL=facebook/bart-large-cnn
NER_MODEL=en_core_web_sm
MODEL_CACHE_DIR=/path/to/models
```

## Storage Service Integration

The pipeline automatically forwards processed clips to the storage service.

**Storage Service Schema Update:**

Add these fields to `service/database.py`:

```python
class Clip(Base):
    # ... existing fields ...
    
    # AI-extracted metadata
    summary = Column(Text)
    entities = Column(JSON)  # List of entities
    keywords = Column(JSON)  # List of keywords
    topics = Column(JSON)    # List of topics
    embedding = Column(JSON) # Vector embedding
    word_count = Column(Integer)
    reading_time_minutes = Column(Integer)
    language = Column(String(10))
    sentiment = Column(JSON) # Sentiment scores
```

## Advanced Features

### Semantic Search

With embeddings, you can implement semantic search:

```python
# Find similar clips by embedding similarity
from sklearn.metrics.pairwise import cosine_similarity

query_embedding = await embedding_generator.generate(query_text)
similarities = cosine_similarity([query_embedding], all_embeddings)
```

### Topic Clustering

Group clips by topic:

```python
from sklearn.cluster import KMeans

# Cluster embeddings
kmeans = KMeans(n_clusters=10)
clusters = kmeans.fit_predict(embeddings)
```

### Automatic Tagging

Use keywords and topics for automatic tagging:

```python
auto_tags = keywords[:5] + topics
```

## Performance

### Processing Time

- Content extraction: ~50ms
- Entity extraction: ~200ms (with spaCy)
- Summary generation: ~500ms (with BART)
- Embedding generation: ~100ms (with sentence-transformers)
- **Total: ~850ms per clip**

### Optimization

- Use GPU for faster inference
- Batch processing for multiple clips
- Cache embeddings
- Use smaller models for speed

## Deployment

### Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m spacy download en_core_web_sm

COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  pipeline:
    build: ./pipeline
    ports:
      - "8001:8001"
    environment:
      - STORAGE_SERVICE_URL=http://storage:8000
      - STORAGE_API_KEY=${STORAGE_API_KEY}
    depends_on:
      - storage
  
  storage:
    build: ./service
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/smart_memory
```

## Monitoring

### Logging

Pipeline logs each processing stage:
```
📥 Processing clip: Example Article
  → Stage 1: Content extraction
  → Stage 2: Metadata extraction
  → Stage 3: Summary generation
  → Stage 4: Embedding generation
  → Stage 5: Forwarding to storage service
✓ Clip processed successfully
```

### Metrics

Track:
- Processing time per stage
- Success/failure rates
- Model inference times
- Storage service latency

## Troubleshooting

### Models not loading
- Check disk space for model cache
- Verify internet connection for downloads
- Check GPU availability (if using)

### Slow processing
- Use smaller models
- Enable GPU acceleration
- Reduce max_length parameters
- Implement caching

### Storage service connection failed
- Verify STORAGE_SERVICE_URL
- Check storage service is running
- Verify API key is correct

## Future Enhancements

- [ ] Multi-language support
- [ ] Image analysis (OCR, object detection)
- [ ] Audio transcription
- [ ] Video summarization
- [ ] Knowledge graph extraction
- [ ] Duplicate detection
- [ ] Content recommendations
- [ ] Automatic categorization

## License

MIT License
