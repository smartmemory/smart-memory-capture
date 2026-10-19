// Background service worker
importScripts('lib.js');

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default settings
    chrome.storage.sync.set({
      storageType: 'local',
      autoSync: false,
      defaultTags: ''
    });
    
    // Open welcome page
    chrome.tabs.create({ url: 'options.html' });
  }
  
  // Remove existing menu entries before re-creating to avoid duplicate-id errors on update
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'captureSelection',
      title: 'Capture selection to SmartMemory',
      contexts: ['selection']
    });
  });
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  // Lite-daemon detection — extension pages only (options/popup), carries no clip.
  // Guard on the sender URL scheme, NOT sender.tab: the options page runs IN a tab
  // (so sender.tab is set), while content scripts in web tabs have an http(s) url.
  if (request.action === 'detectLite') {
    if (!(sender.url || '').startsWith('chrome-extension://')) return false;
    detectLite(request.port).then(sendResponse);
    return true; // async response
  }

  // Validate clip shape before any action that uses it
  const clip = request.clip;
  const clipIsValid = clip && typeof clip === 'object' &&
    typeof clip.id === 'string' && clip.id &&
    typeof clip.url === 'string' && clip.url;

  if (request.action === 'clipSaved') {
    if (sender.tab) return false;
    if (!clipIsValid) return false;
    handleClipSaved(clip)
      .catch(console.error)
      .finally(() => sendResponse({}));
    return true; // keep channel open so the worker stays alive through the async work
  } else if (request.action === 'syncToServer') {
    // Only accept from extension pages (popup/options), not content scripts (sender.tab is set for content scripts)
    if (sender.tab) return false;
    if (!clipIsValid) { sendResponse({ success: false, error: 'Invalid clip' }); return false; }
    syncToServer(clip).then(sendResponse);
    return true;
  } else if (request.action === 'saveSelectionClip') {
    // Accepts from content scripts only
    if (!sender.tab) return false;
    if (typeof request.selectionText !== 'string' || !request.selectionText) {
      sendResponse({ success: false, error: 'No selection text' }); return false;
    }
    saveSelectionClip(request, sender.tab)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Handle clip saved event
async function handleClipSaved(clip) {
  const { autoSync, syncEndpoint } = await chrome.storage.sync.get(['autoSync', 'syncEndpoint']);
  
  if (autoSync && syncEndpoint) {
    await syncToServer(clip, syncEndpoint);
  }
  
  // Show notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'SmartMemory Capture: Clip Saved',
    message: `"${clip.title}" has been saved to your library`,
    priority: 1
  });
}

// Probe for a locally-running SmartMemory lite daemon (DIST-DAEMON-1).
// Mirrors smartmemory_app/daemon.py: GET /health on the loopback port, and the
// process must self-identify as "smartmemory" — so a random server squatting on
// the port isn't mistaken for lite. Runs in the worker (not the options page) so
// the keyless daemon's absent CORS headers don't block the cross-origin read.
async function detectLite(port) {
  const p = Number.isInteger(port) && port > 0 ? port : SM_DEFAULT_DAEMON_PORT;

  // Reading a cross-origin loopback response requires host permission for it.
  try {
    const granted = await chrome.permissions.contains({ origins: [`http://${SM_DAEMON_HOST}/*`] });
    if (!granted) return { installed: false, port: p, reason: 'permission' };
  } catch {
    return { installed: false, port: p, reason: 'permission' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`http://${SM_DAEMON_HOST}:${p}/health`, { method: 'GET', signal: controller.signal });
    if (!res.ok) return { installed: false, port: p, reason: 'unhealthy' };
    const data = await res.json().catch(() => null);
    if (data && data.service === 'smartmemory') {
      return { installed: true, port: p, version: data.version ?? null, status: data.status ?? null };
    }
    return { installed: false, port: p, reason: 'identity' };
  } catch (e) {
    return { installed: false, port: p, reason: e.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

// Sync clip to SmartMemory API
async function syncToServer(clip, endpoint) {
  if (!endpoint) {
    const { syncEndpoint } = await chrome.storage.sync.get(['syncEndpoint']);
    endpoint = syncEndpoint;
  }

  if (!endpoint) {
    return { success: false, error: 'No sync endpoint configured' };
  }

  // Validate HTTPS (allow localhost for development)
  try {
    const parsed = new URL(endpoint);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalhost)) {
      return { success: false, error: 'Sync endpoint must use HTTPS' };
    }
  } catch {
    return { success: false, error: 'Invalid sync endpoint URL' };
  }

  // Token is device-local only — never synced to Google's cloud via storage.sync
  const { syncApiToken } = await chrome.storage.local.get(['syncApiToken']);
  const { syncWorkspaceId } = await chrome.storage.sync.get(['syncWorkspaceId']);

  // Auth rule (CAP-CONN-1): a remote (service) target crosses the network and
  // REQUIRES a token; a loopback (lite daemon) target is OS-authenticated and
  // ships keyless. Fail fast here rather than firing an unauthenticated request.
  if (smTokenRequired(endpoint) && !syncApiToken) {
    return { success: false, error: 'API token required for cloud sync. Add it in Settings, or run SmartMemory locally (lite).' };
  }

  // Workspace rule (CAP-WORKSPACE-1): the SmartMemory service scopes every write
  // to a workspace and rejects ingest without X-Workspace-Id (the API key alone
  // carries no team context). The lite daemon needs none. A loopback endpoint may
  // be either one, so the header is sent whenever configured and only REQUIRED
  // where the target is unambiguously the service (non-loopback).
  if (smTokenRequired(endpoint) && !syncWorkspaceId) {
    return { success: false, error: 'Workspace ID required for cloud sync. Add it in Settings (dashboard → Settings → Workspace).' };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (syncApiToken) {
    headers['Authorization'] = `Bearer ${syncApiToken}`;
  }
  if (syncWorkspaceId) {
    headers['X-Workspace-Id'] = syncWorkspaceId;
  }

  // Verify we have host permission for the sync endpoint (match patterns can't
  // include a port, so use protocol+host — http://127.0.0.1/* matches all ports).
  try {
    const origin = smOriginPattern(endpoint);
    const hasPermission = await chrome.permissions.contains({ origins: [origin] });
    if (!hasPermission) {
      return { success: false, error: 'Host permission not granted. Open Settings and test the connection to grant access.' };
    }
  } catch {
    return { success: false, error: 'Invalid sync endpoint URL' };
  }

  // Build the cross-compatible ingest body (service reads metadata from `context`,
  // the lite daemon from `properties`; both read `context.origin`). See lib.js.
  const payload = smBuildIngestPayload(clip);

  try {
    const response = await fetch(`${endpoint}/memory/ingest`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Sync error:', error);
    return { success: false, error: error.message };
  }
}

// Context menu click handler — inject content script on demand, then show capture sheet (CAP-ENH-1h)
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'captureSelection') {
    // Inject content script on demand — activeTab grants permission on context menu click
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (err) {
      console.error('Failed to inject content script:', err);
      return;
    }
    const { defaultTags = '' } = await chrome.storage.sync.get(['defaultTags']);
    chrome.tabs.sendMessage(tab.id, {
      action: 'showCaptureSheet',
      selectionText: info.selectionText,
      defaultTags
    });
  }
});

// Save a selection clip originating from the inline capture sheet
async function saveSelectionClip(request, tab) {
  const clip = {
    id: crypto.randomUUID(),
    title: tab.title,   // always use trusted tab values, not page-controlled request fields
    url: tab.url,
    mode: 'selection',
    content: { type: 'text', data: request.selectionText, html: null },
    tags: Array.isArray(request.tags) ? request.tags : [],
    notes: request.notes ?? '',
    timestamp: new Date().toISOString(),
    favicon: tab.favIconUrl,  // always use browser-verified favicon, never page-supplied
    metadata: request.metadata ?? {}
  };

  const { syncMode, syncEndpoint } = await chrome.storage.sync.get(['syncMode', 'syncEndpoint']);

  if (syncMode === 'server-primary' && syncEndpoint) {
    const result = await syncToServer(clip);
    if (!result.success) return result;
  }

  const { clips = [] } = await chrome.storage.local.get(['clips']);
  clips.unshift(clip);
  const maxCache = syncMode === 'server-primary' ? 100 : 1000;
  if (clips.length > maxCache) clips.splice(maxCache);
  await chrome.storage.local.set({ clips });
  if (syncMode === 'server-primary') {
    // Sync already completed above — show notification only, don't re-sync via handleClipSaved
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'SmartMemory Capture: Clip Saved',
      message: `"${clip.title}" has been saved to your library`,
      priority: 1
    });
  } else {
    // Await before returning so the MV3 service worker stays alive through the notification + autoSync fetch
    try { await handleClipSaved(clip); } catch (e) { console.error(e); }
  }
  return { success: true };
}
