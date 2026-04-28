// Background service worker

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
      title: 'Capture selection to Smart Memory',
      contexts: ['selection']
    });
  });
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

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
    title: 'Clip Saved',
    message: `"${clip.title}" has been saved to your library`,
    priority: 1
  });
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

  const headers = { 'Content-Type': 'application/json' };
  if (syncApiToken) {
    headers['Authorization'] = `Bearer ${syncApiToken}`;
  }

  // Verify we have host permission for the sync endpoint
  try {
    const origin = new URL(endpoint).origin + '/*';
    const hasPermission = await chrome.permissions.contains({ origins: [origin] });
    if (!hasPermission) {
      return { success: false, error: 'Host permission not granted. Open Settings and test the connection to grant access.' };
    }
  } catch {
    return { success: false, error: 'Invalid sync endpoint URL' };
  }

  // Map to SmartMemory ingest shape — never send raw HTML to the server
  const meta = clip.metadata ?? {};
  const payload = {
    content: clip.content?.data ?? '',
    memory_type: 'episodic',
    metadata: {
      source_url: clip.url,
      title: clip.title,
      tags: clip.tags || [],
      captured_at: clip.timestamp,
      capture_mode: clip.mode,
      // Rich metadata from CAP-ENH-1a
      ...(meta.author && { author: meta.author }),
      ...(meta.published_at && { published_at: meta.published_at }),
      ...(meta.og_site_name && { site_name: meta.og_site_name }),
      ...(meta.og_type && { content_type: meta.og_type }),
      ...(meta.og_description && { description: meta.og_description }),
      ...(meta.word_count && { word_count: meta.word_count }),
      ...(meta.reading_time_minutes && { reading_time_minutes: meta.reading_time_minutes }),
      ...(meta.schema_type && { schema_type: meta.schema_type }),
      readability_extracted: clip.content?.readability ?? false,
      ...(clip.content?.heroImage && { hero_image: clip.content.heroImage }),
      ...(meta.video_id && { video_id: meta.video_id }),
      ...(meta.duration_seconds && { duration_seconds: meta.duration_seconds }),
      ...(clip.content?.hasTranscript !== undefined && { has_transcript: clip.content.hasTranscript }),
      ...(clip.notes && { notes: clip.notes })
    }
  };

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
      title: 'Clip Saved',
      message: `"${clip.title}" has been saved to your library`,
      priority: 1
    });
  } else {
    // Await before returning so the MV3 service worker stays alive through the notification + autoSync fetch
    try { await handleClipSaved(clip); } catch (e) { console.error(e); }
  }
  return { success: true };
}
