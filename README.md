# Smart Memory Capture

**Version:** 1.2.1

Capture surfaces that send web and mobile content into [SmartMemory](https://smartmemory.ai).
Capture is a **thin ingestion surface** — it extracts content well at the edge and posts it
to SmartMemory's `/memory/ingest`. All processing (extraction, entities, embeddings, the
knowledge graph) and storage happen in SmartMemory core. There is **no separate database
or pipeline** in this repo; captures appear in SmartMemory recall, not a local clip list.

## Components

| Path | What it is |
|------|------------|
| `extension/` | Chrome/Edge/Brave MV3 browser extension (the primary surface) |
| `mobile-android/` | Android share-sheet app (Capacitor) |

## How it connects (CAP-CONN-1)

Both surfaces speak one REST contract — `POST /memory/ingest` — implemented by **either**
target. The extension classifies the target by endpoint host and applies the matching rule:

| Target | Endpoint | Auth |
|--------|----------|------|
| **Local (lite)** | `http://127.0.0.1:9014` — a SmartMemory daemon on this machine | No token (loopback is OS-authenticated) |
| **Cloud (service)** | `https://api.smartmemory.ai` (or self-hosted, HTTPS) | **API token + Workspace ID required** (sent as `X-Workspace-Id` — the service scopes every capture to a workspace) |

- **Detect local SmartMemory** probes `GET /health` on the lite daemon and verifies it
  identifies as SmartMemory. If found and no endpoint is configured, it auto-targets the
  daemon. If not found, the UI guides you to start it (`smartmemory server`) or use Cloud.
- The same backend can run on a SQLite (lite) or FalkorDB backend — transparent to capture.

> "Lite" is the local SmartMemory distribution (the `smartmemory` package's daemon), **not**
> a separate clip store. The browser extension needs an HTTP endpoint, so a fully embedded
> install with no running daemon is reachable only via SmartMemory's CLI/MCP, not this extension.

## Browser extension

### Install (unpacked)

1. Open `chrome://extensions/`, enable **Developer mode**
2. **Load unpacked** → select the `extension/` folder
3. Open the extension's **Settings**:
   - Click **Detect local SmartMemory** to use a local daemon, **or**
   - Enter your Cloud **API URL** + **API token**

### Capture modes

- **Full Page** — page text content
- **Article** — main article via Readability (great for news/blogs)
- **Selection** — selected text (right-click → "Capture selection to Smart Memory")
- **Screenshot** — visible-area snapshot

Captures carry rich provenance into SmartMemory `context`/`properties`: `origin=browser:save`
(search-visible user content), `source_url`, `title`, `capture_mode`, plus author / OG / video
metadata where available. Re-capturing the same URL dedupes (CORE-INGEST-DEDUPE-1).

### Settings

- **Storage Mode** — Local First (cache locally, sync in background) or Server Primary (sync first)
- **Local SmartMemory** — detect/auto-target the lite daemon
- **API URL / API Token** — Cloud target (token required) or a local daemon URL
- **Default tags**, **Duplicate URL policy**, **Export/Import**

## Privacy

Captures go only to the SmartMemory endpoint you configure (your local daemon or your
account). Nothing is sent to any third party. The API token is stored device-locally and
is never synced to Google's cloud.

## Documentation

Full SmartMemory documentation: https://docs.smartmemory.ai
