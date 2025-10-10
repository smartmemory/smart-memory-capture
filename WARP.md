# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Smart Memory Capture is a Chrome extension similar to OneNote Web Clipper that allows users to capture web content and save it to their own storage instead of cloud services. The project consists of three main components:

1. **Chrome Extension** (`extension/`) - The main user-facing extension
2. **Storage Service** (`service/`) - FastAPI backend for storing clips in PostgreSQL
3. **AI Pipeline** (`pipeline/`) - Optional AI/ML processing pipeline for content enhancement

## Architecture

### Core Components

- **Extension Popup** (`popup.js/html/css`) - Main capture interface with 4 modes (Full Page, Article, Selection, Screenshot)
- **Library Viewer** (`library.js/html/css`) - Full-featured clip management interface with search, filtering, and export
- **Background Service** (`background.js`) - Handles context menus, notifications, and server sync
- **Content Script** (`content.js`) - Runs on web pages for content extraction and text highlighting
- **Options Page** (`options.js/html/css`) - Settings and configuration management

### Data Flow

1. User captures content via popup or context menu
2. Content script extracts page content based on selected mode
3. Clip is saved locally and optionally synced to configured server
4. Background service handles notifications and server communication

### Storage Architecture

- **Local Storage**: Primary storage in `chrome.storage.local` (up to 1000 clips)
- **Sync Storage**: Settings stored in `chrome.storage.sync`
- **Server Sync**: Optional POST to user-configured API endpoint
- **Export/Import**: JSON format for backup and migration

## Development Commands

### Chrome Extension Development

```bash
# Load extension in Chrome for development
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the extension/ directory

# Generate extension icons (if missing)
cd extension/
python3 generate_icons.py
# OR open create-icons.html in browser

# Install minimal dependencies
npm install
```

### Backend Services

#### Storage Service (PostgreSQL + FastAPI)
```bash
cd service/

# Start with Docker Compose
docker-compose up -d

# Or run locally
pip install -r requirements.txt
python main.py

# Database setup (auto-created on first run)
# PostgreSQL runs on port 5432
# API runs on port 8000
```

#### AI Pipeline (Optional Enhancement Service)
```bash
cd pipeline/

# Install dependencies
pip install -r requirements.txt

# Run pipeline server
python main.py
# Runs on port 8001 by default

# Configure environment
cp .env.example .env
# Edit STORAGE_SERVICE_URL and API keys
```

### Testing and Debugging

```bash
# Test extension functionality
# Use Chrome Developer Tools on extension pages:
# chrome-extension://[extension-id]/popup.html
# chrome-extension://[extension-id]/library.html

# Test backend endpoints
curl -X POST http://localhost:8000/api/clips \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{clip data}'

# View backend logs
docker-compose logs -f api

# Database inspection
docker exec -it service_db_1 psql -U postgres -d smart_memory
```

## Key Implementation Details

### Content Extraction Logic
- **Full Page**: Captures `document.body.innerText` and `innerHTML`
- **Article Mode**: Uses semantic selectors (`article`, `[role="main"]`, `main`) with fallback
- **Selection Mode**: Captures `window.getSelection().toString()`
- **Screenshot Mode**: Uses `chrome.tabs.captureVisibleTab()` API

### Storage Modes
- **Local-first** (default): Save locally, sync in background
- **Server-primary**: Save to server first, cache locally only on success
- **Hybrid**: Both local and server storage maintained

### Sync Architecture
Extension supports flexible sync endpoints:
- Simple REST API (JSON POST)
- FastAPI service with PostgreSQL
- AI pipeline with content enhancement
- Custom backends (Supabase, Firebase, etc.)

### Extension Manifest V3 Features
- Service worker background script
- Content scripts with `document_idle` execution
- Comprehensive permissions for tabs, storage, scripting
- Context menus for quick capture

## File Structure Guide

```
smart-memory-capture/
├── extension/              # Chrome Extension (Manifest V3)
│   ├── manifest.json      # Extension configuration
│   ├── popup.*           # Main capture interface
│   ├── library.*         # Clip library viewer
│   ├── options.*         # Settings page
│   ├── background.js     # Service worker
│   ├── content.js        # Page content scripts
│   └── icons/            # Extension icons
├── service/               # FastAPI + PostgreSQL backend
│   ├── main.py           # API server with CRUD endpoints
│   ├── models.py         # Database models
│   ├── database.py       # SQLAlchemy setup
│   ├── auth.py           # API key authentication
│   └── docker-compose.yml # PostgreSQL + API containers
├── pipeline/              # AI/ML processing pipeline
│   ├── main.py           # FastAPI pipeline server
│   ├── extractors.py     # Content extraction processors
│   ├── processors.py     # AI text processing
│   └── models.py         # Data models
└── *.md                  # Documentation files
```

## Common Development Tasks

### Adding New Capture Modes
1. Update `capturePageContent()` function in `popup.js`
2. Add UI elements to `popup.html`
3. Handle new mode in `background.js` context menu handler

### Customizing Storage Backends
1. Modify `syncToServer()` function in `background.js`
2. Update server endpoint configuration in `options.js`
3. Ensure CORS headers are configured on your backend

### Extending AI Pipeline
1. Add new processors to `pipeline/processors.py`
2. Update processing stages in `pipeline/main.py`
3. Modify data models to include new metadata fields

### Browser Compatibility
- Chrome/Edge/Brave: Full support (Manifest V3)
- Firefox: Requires manifest conversion to v2
- Safari: Not supported (different extension format)