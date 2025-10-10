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
  if (request.action === 'clipSaved') {
    handleClipSaved(request.clip);
  }
  
  if (request.action === 'syncToServer') {
    syncToServer(request.clip).then(sendResponse);
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

// Sync clip to external server
async function syncToServer(clip, endpoint) {
  if (!endpoint) {
    const { syncEndpoint } = await chrome.storage.sync.get(['syncEndpoint']);
    endpoint = syncEndpoint;
  }
  
  if (!endpoint) {
    return { success: false, error: 'No sync endpoint configured' };
  }
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(clip)
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
      id: Date.now().toString(),
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
