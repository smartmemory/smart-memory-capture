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
  
  // Create context menu (on install or update)
  chrome.contextMenus.create({
    id: 'captureSelection',
    title: 'Capture selection to Smart Memory',
    contexts: ['selection']
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
    handleClipSaved(clip).catch(console.error);
    return false;
  } else if (request.action === 'syncToServer') {
    // Only accept from extension pages (popup/options), not content scripts (sender.tab is set for content scripts)
    if (sender.tab) return false;
    if (!clipIsValid) { sendResponse({ success: false, error: 'Invalid clip' }); return false; }
    syncToServer(clip).then(sendResponse);
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

  const { syncApiToken } = await chrome.storage.sync.get(['syncApiToken']);

  const headers = { 'Content-Type': 'application/json' };
  if (syncApiToken) {
    headers['Authorization'] = `Bearer ${syncApiToken}`;
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
      readability_extracted: clip.content?.readability ?? false
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

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'captureSelection') {
    const clip = {
      id: crypto.randomUUID(),
      title: tab.title,
      url: tab.url,
      mode: 'selection',
      content: {
        type: 'text',
        data: info.selectionText,
        html: null
      },
      tags: [],
      notes: '',
      timestamp: new Date().toISOString(),
      favicon: tab.favIconUrl
    };
    
    const { clips = [] } = await chrome.storage.local.get(['clips']);
    clips.unshift(clip);
    await chrome.storage.local.set({ clips });
    
    handleClipSaved(clip);
  }
});
