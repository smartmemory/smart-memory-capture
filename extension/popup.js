// Get current tab info
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Initialize popup
async function init() {
  const tab = await getCurrentTab();
  
  document.getElementById('pageTitle').textContent = tab.title || 'Untitled';
  document.getElementById('pageUrl').textContent = tab.url;
  
  // Load saved preferences
  const { defaultTags } = await chrome.storage.sync.get(['defaultTags']);
  if (defaultTags) {
    document.getElementById('tags').value = defaultTags;
  }
}

// Capture content based on selected mode
async function captureContent() {
  const tab = await getCurrentTab();
  const mode = document.querySelector('input[name="captureMode"]:checked').value;
  const tags = document.getElementById('tags').value;
  const notes = document.getElementById('notes').value;
  
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Capturing...';
  statusEl.className = 'status';
  
  try {
    let content;
    
    if (mode === 'screenshot') {
      // Capture screenshot
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      content = {
        type: 'screenshot',
        data: dataUrl
      };
    } else {
      // Inject content script and get content
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: capturePageContent,
        args: [mode]
      });
      content = result.result;
    }
    
    // Create clip object
    const clip = {
      id: crypto.randomUUID(),
      title: tab.title,
      url: tab.url,
      mode: mode,
      content: content,
      tags: tags.split(',').map(t => t.trim()).filter(t => t),
      notes: notes,
      timestamp: new Date().toISOString(),
      favicon: tab.favIconUrl
    };
    
    // Save to storage
    await saveClip(clip);
    
    statusEl.textContent = '✓ Saved successfully!';
    statusEl.className = 'status success';
    
    // Clear form after 1.5 seconds
    setTimeout(() => {
      document.getElementById('notes').value = '';
      statusEl.textContent = '';
    }, 1500);
    
  } catch (error) {
    console.error('Capture error:', error);
    statusEl.textContent = '✗ Error: ' + error.message;
    statusEl.className = 'status error';
  }
}

// Function to inject into page for content capture
function capturePageContent(mode) {
  if (mode === 'selection') {
    const selection = window.getSelection().toString();
    if (!selection) {
      throw new Error('No text selected. Please select some text first.');
    }
    return {
      type: 'text',
      data: selection,
      html: null
    };
  }
  
  if (mode === 'article') {
    // Try to find main article content
    const article = document.querySelector('article') || 
                   document.querySelector('[role="main"]') ||
                   document.querySelector('main') ||
                   document.querySelector('.article') ||
                   document.querySelector('.post-content');
    
    if (article) {
      return {
        type: 'html',
        data: article.innerText,
        html: article.innerHTML
      };
    }
    // Fallback to full page if no article found
  }
  
  // Full page capture
  return {
    type: 'html',
    data: document.body.innerText,
    html: document.body.innerHTML
  };
}

// Save clip to storage
async function saveClip(clip) {
  const { syncMode, syncEndpoint } = await chrome.storage.sync.get(['syncMode', 'syncEndpoint']);
  
  if (syncMode === 'server-primary' && syncEndpoint) {
    // Server-first mode: Send to server, only cache locally on success
    const response = await chrome.runtime.sendMessage({ 
      action: 'syncToServer', 
      clip: clip 
    });
    
    if (response && response.success) {
      // Only cache locally after successful server save
      await cacheClipLocally(clip);
    } else {
      throw new Error(response?.error || 'Failed to save to server');
    }
  } else {
    // Local-first mode (default): Save locally, then optionally sync
    await cacheClipLocally(clip);
    
    // Send to background for potential sync
    chrome.runtime.sendMessage({ 
      action: 'clipSaved', 
      clip: clip 
    });
  }
}

// Cache clip in local storage (for offline access or as spool)
async function cacheClipLocally(clip) {
  const { clips = [] } = await chrome.storage.local.get(['clips']);
  clips.unshift(clip);
  
  // Keep only last 100 clips in local cache when in server-primary mode
  const { syncMode } = await chrome.storage.sync.get(['syncMode']);
  const maxCache = syncMode === 'server-primary' ? 100 : 1000;
  
  if (clips.length > maxCache) {
    clips.splice(maxCache);
  }
  
  await chrome.storage.local.set({ clips });
}

// Event listeners
document.getElementById('captureBtn').addEventListener('click', captureContent);

document.getElementById('viewLibraryBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'library.html' });
});

document.getElementById('settingsLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Initialize on load
init();
