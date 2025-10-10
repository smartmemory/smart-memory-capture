# Storage Modes

The extension now supports two storage modes to fit different use cases.

## Mode 1: Local First (Default)

**Best for:** Personal use, offline access, privacy

### How it works:
1. Clip is captured
2. **Saved to local storage immediately** ✓
3. Optionally synced to server (if auto-sync enabled)
4. User sees success message

### Characteristics:
- ✅ Works offline
- ✅ Fast (no network latency)
- ✅ Stores up to 1000 clips locally
- ✅ Server is optional backup
- ✅ Can export/import locally

### Configuration:
```
Settings → Storage Mode → "Local First"
Settings → Sync Configuration → Enable automatic sync (optional)
Settings → Sync Configuration → Set endpoint URL
```

---

## Mode 2: Server Primary (Production)

**Best for:** Enterprise, team sharing, centralized storage

### How it works:
1. Clip is captured
2. **Sent to server first** (blocks until success)
3. Only cached locally after server confirms save
4. User sees success message

### Characteristics:
- ✅ Server is source of truth
- ✅ Requires internet connection
- ✅ Caches last 100 clips locally (for viewing)
- ✅ Fails if server is unreachable
- ⚠️ No offline capture

### Configuration:
```
Settings → Storage Mode → "Server Primary"
Settings → Sync Configuration → Set endpoint URL (required)
```

---

## API Requirements

### For Local First Mode
- **Optional:** Server endpoint can be omitted
- **Sync:** One-way push (fire and forget)
- **Response:** Not critical (logged but doesn't block)

### For Server Primary Mode
- **Required:** Server endpoint must be configured
- **Sync:** Synchronous (waits for response)
- **Response:** Must return success/error
  ```json
  { "success": true }
  ```
  or
  ```json
  { "success": false, "error": "Error message" }
  ```

---

## Server Endpoint Specification

**URL:** Your configured endpoint (e.g., `https://api.example.com/clips`)

**Method:** `POST`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "id": "1728519120000",
  "title": "Page Title",
  "url": "https://example.com",
  "mode": "full|article|selection|screenshot",
  "content": {
    "type": "html|text|screenshot",
    "data": "content...",
    "html": "<html>..."
  },
  "tags": ["tag1", "tag2"],
  "notes": "User notes",
  "timestamp": "2025-10-09T19:21:50.000Z",
  "favicon": "https://example.com/favicon.ico"
}
```

**Response (Server Primary mode):**
```json
{
  "success": true
}
```

---

## Switching Modes

You can switch between modes at any time in Settings. 

**Note:** Existing clips in local storage are not automatically uploaded when switching to Server Primary mode. Use Export/Import if you need to migrate data.

---

## Local Cache in Server Primary Mode

Even in Server Primary mode, the extension caches the last 100 clips locally for:
- Viewing in the library
- Offline browsing of recent clips
- Quick access without server requests

The cache is automatically pruned to keep only the most recent 100 clips.

---

## Recommendations

### Use Local First if:
- You want offline access
- Privacy is important
- Server is optional/experimental
- You're the only user

### Use Server Primary if:
- You need centralized storage
- Multiple users/devices need access
- You want server-side search/analytics
- You have reliable internet
- Data must be backed up immediately

---

## Example Production Setup

For production with Server Primary mode:

1. **Set up your server** with the POST endpoint
2. **Test the connection** in Settings
3. **Switch to Server Primary** mode
4. **Set endpoint URL** to your production API
5. **Test a capture** to verify it works

The extension will now save all clips to your server first, using local storage only as a temporary cache.
