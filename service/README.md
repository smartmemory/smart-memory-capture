# Smart Memory Capture API

Full-featured FastAPI backend for the Smart Memory Capture Chrome extension.

## Features

- ✅ **RESTful API** - Complete CRUD operations for clips
- ✅ **Authentication** - API key-based auth
- ✅ **Database** - SQLite (dev) or PostgreSQL (production)
- ✅ **Search** - Full-text search across clips
- ✅ **Filtering** - Filter by mode, tags, dates
- ✅ **Pagination** - Efficient data retrieval
- ✅ **CORS** - Configured for Chrome extensions
- ✅ **Statistics** - Usage stats and analytics

## Quick Start

### 1. Install Dependencies

```bash
cd service
pip install -r requirements.txt
```

### 2. Run the Server

```bash
python main.py
```

The API will start on `http://localhost:8000`

### 3. Get Your API Key

On first run, the server will generate an API key and print it to console:

```
⚠️  No API keys configured!
Generated default API key: abc123...xyz
Set this in your Chrome extension settings.
```

### 4. Configure Extension

1. Open Chrome extension settings
2. Set sync endpoint: `http://localhost:8000/api/clips`
3. Set API key: (the key from step 3)
4. Choose "Server Primary" mode
5. Test connection

## API Endpoints

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/clips` | Create a new clip |
| GET | `/api/clips` | List all clips (paginated) |
| GET | `/api/clips/{id}` | Get specific clip |
| PUT | `/api/clips/{id}` | Update a clip |
| DELETE | `/api/clips/{id}` | Delete a clip |

### Search & Filter

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=query` | Full-text search |
| GET | `/api/clips?mode=full` | Filter by capture mode |
| GET | `/api/clips?tag=research` | Filter by tag |
| GET | `/api/tags` | Get all unique tags |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats` | Get usage statistics |
| GET | `/health` | Health check |

## Authentication

All endpoints (except `/` and `/health`) require authentication.

**Header Format:**
```
Authorization: Bearer <your-api-key>
```

**Example:**
```bash
curl -H "Authorization: Bearer abc123xyz" \
  http://localhost:8000/api/clips
```

## API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Configuration

### Environment Variables

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=sqlite:///./smart_memory.db
API_KEYS=your-api-key-1,your-api-key-2
HOST=0.0.0.0
PORT=8000
```

### Generate API Keys

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Database

### SQLite (Development)

Default configuration. Database file: `smart_memory.db`

### PostgreSQL (Production)

1. Install PostgreSQL
2. Create database:
   ```sql
   CREATE DATABASE smart_memory;
   ```
3. Update `.env`:
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/smart_memory
   ```
4. Install PostgreSQL driver:
   ```bash
   pip install psycopg2-binary
   ```

## Production Deployment

### Using Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run:
```bash
docker build -t smart-memory-api .
docker run -p 8000:8000 -e API_KEYS=your-key smart-memory-api
```

### Using Systemd

Create `/etc/systemd/system/smart-memory.service`:

```ini
[Unit]
Description=Smart Memory Capture API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/smart-memory-capture/service
Environment="PATH=/opt/smart-memory-capture/venv/bin"
ExecStart=/opt/smart-memory-capture/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable smart-memory
sudo systemctl start smart-memory
```

### Using Nginx

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Development

### Run with Auto-Reload

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Run Tests

```bash
pytest
```

### Database Migrations

Using Alembic:

```bash
pip install alembic
alembic init migrations
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head
```

## API Examples

### Create a Clip

```bash
curl -X POST http://localhost:8000/api/clips \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "1728519120000",
    "title": "Example Page",
    "url": "https://example.com",
    "mode": "full",
    "content": {
      "type": "html",
      "data": "Page content...",
      "html": "<div>HTML</div>"
    },
    "tags": ["research"],
    "notes": "Important article",
    "timestamp": "2025-10-09T19:21:50.000Z"
  }'
```

### List Clips

```bash
curl -H "Authorization: Bearer your-api-key" \
  "http://localhost:8000/api/clips?skip=0&limit=10"
```

### Search Clips

```bash
curl -H "Authorization: Bearer your-api-key" \
  "http://localhost:8000/api/search?q=research"
```

### Get Statistics

```bash
curl -H "Authorization: Bearer your-api-key" \
  http://localhost:8000/api/stats
```

## Troubleshooting

### CORS Errors

If you get CORS errors, update `main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://your-extension-id"],
    ...
)
```

### Database Locked (SQLite)

Use PostgreSQL for production or enable WAL mode:

```python
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30}
)
```

### Authentication Failures

Check that:
1. API key is set in `.env` or generated on startup
2. Extension is sending `Authorization: Bearer <key>` header
3. Key matches exactly (no extra spaces)

## Security Considerations

- ✅ Use HTTPS in production
- ✅ Store API keys securely (environment variables)
- ✅ Use strong API keys (32+ characters)
- ✅ Implement rate limiting for production
- ✅ Regular database backups
- ✅ Monitor for suspicious activity

## License

MIT License
