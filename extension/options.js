// Load settings
async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'syncMode',
    'autoSync',
    'syncEndpoint',
    'syncApiToken',
    'defaultTags'
  ]);

  // Set sync mode — whitelist to prevent XSS via querySelector attribute injection
  const allowedModes = ['local-first', 'server-primary'];
  const syncMode = allowedModes.includes(settings.syncMode) ? settings.syncMode : 'local-first';
  document.querySelector(`input[name="syncMode"][value="${syncMode}"]`).checked = true;

  document.getElementById('autoSync').checked = settings.autoSync || false;
  document.getElementById('syncEndpoint').value = settings.syncEndpoint || '';
  document.getElementById('syncApiToken').value = settings.syncApiToken || '';
  document.getElementById('defaultTags').value = settings.defaultTags || '';

  updateStats();
}

// Update statistics
async function updateStats() {
  const { clips = [] } = await chrome.storage.local.get(['clips']);
  document.getElementById('clipCount').textContent = clips.length;
  
  // Calculate storage size
  const size = new Blob([JSON.stringify(clips)]).size;
  const sizeKB = (size / 1024).toFixed(2);
  document.getElementById('storageSize').textContent = `${sizeKB} KB`;
}

// Save settings
async function saveSettings() {
  const syncMode = document.querySelector('input[name="syncMode"]:checked').value;
  const endpointRaw = document.getElementById('syncEndpoint').value.trim();

  // Validate endpoint: require HTTPS (allow http://localhost for dev)
  if (endpointRaw) {
    try {
      const parsed = new URL(endpointRaw);
      const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalhost)) {
        showSaveStatus('Sync endpoint must use HTTPS (or http://localhost for development)', 'error');
        return;
      }
    } catch {
      showSaveStatus('Sync endpoint is not a valid URL', 'error');
      return;
    }
  }

  const settings = {
    syncMode: syncMode,
    autoSync: document.getElementById('autoSync').checked,
    syncEndpoint: endpointRaw,
    syncApiToken: document.getElementById('syncApiToken').value,
    defaultTags: document.getElementById('defaultTags').value
  };

  await chrome.storage.sync.set(settings);
  showSaveStatus('Settings saved successfully!', 'success');
}

// Show save status
function showSaveStatus(message, type) {
  const status = document.getElementById('saveStatus');
  status.textContent = message;
  status.className = `save-status ${type}`;
  
  setTimeout(() => {
    status.textContent = '';
    status.className = 'save-status';
  }, 3000);
}

// Test sync connection
async function testSync() {
  const endpoint = document.getElementById('syncEndpoint').value.trim();
  const token = document.getElementById('syncApiToken').value;
  const statusEl = document.getElementById('syncStatus');

  if (!endpoint) {
    statusEl.textContent = 'Please enter a sync endpoint URL';
    statusEl.className = 'status-message error show';
    return;
  }

  // Validate HTTPS before attempting request
  try {
    const parsed = new URL(endpoint);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalhost)) {
      statusEl.textContent = '✗ Endpoint must use HTTPS';
      statusEl.className = 'status-message error show';
      return;
    }
  } catch {
    statusEl.textContent = '✗ Invalid endpoint URL';
    statusEl.className = 'status-message error show';
    return;
  }

  statusEl.textContent = 'Testing connection...';
  statusEl.className = 'status-message show';

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${endpoint}/health`, { method: 'GET', headers });

    if (response.ok) {
      statusEl.textContent = '✓ Connection successful!';
      statusEl.className = 'status-message success show';
    } else {
      statusEl.textContent = `✗ Error: HTTP ${response.status}`;
      statusEl.className = 'status-message error show';
    }
  } catch (error) {
    statusEl.textContent = `✗ Error: ${error.message}`;
    statusEl.className = 'status-message error show';
  }
}

// Export all clips
async function exportAll() {
  const { clips = [] } = await chrome.storage.local.get(['clips']);
  const dataStr = JSON.stringify(clips, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `smart-memory-clips-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showSaveStatus('Clips exported successfully!', 'success');
}

// Validate a clip object before import
function isValidClip(clip) {
  if (typeof clip !== 'object' || clip === null) return false;
  if (typeof clip.id !== 'string' || !clip.id) return false;
  if (typeof clip.url !== 'string' || !clip.url) return false;
  if (typeof clip.timestamp !== 'string' || !clip.timestamp) return false;
  if ('title' in clip && typeof clip.title !== 'string') return false;
  if ('tags' in clip && !Array.isArray(clip.tags)) return false;
  if ('content' in clip) {
    if (typeof clip.content !== 'object' || clip.content === null) return false;
    if ('data' in clip.content && typeof clip.content.data !== 'string') return false;
  }
  return true;
}

// Import clips
function importClips() {
  document.getElementById('importFile').click();
}

// Handle file import
async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importedClips = JSON.parse(text);

    if (!Array.isArray(importedClips)) {
      throw new Error('Invalid file format');
    }

    const validClips = importedClips.filter(isValidClip);
    const skipped = importedClips.length - validClips.length;

    const { clips = [] } = await chrome.storage.local.get(['clips']);
    // Existing clips take precedence — imported entries cannot silently overwrite local data
    const mergedClips = [...validClips, ...clips];
    const uniqueClips = Array.from(
      new Map(mergedClips.map(clip => [clip.id, clip])).values()
    );

    await chrome.storage.local.set({ clips: uniqueClips });
    updateStats();
    const skippedMsg = skipped > 0 ? ` (${skipped} invalid clips skipped)` : '';
    showSaveStatus(`Imported ${validClips.length} clips successfully!${skippedMsg}`, 'success');
  } catch (error) {
    showSaveStatus(`Import failed: ${error.message}`, 'error');
  }
}

// Clear all data
async function clearAll() {
  if (!confirm('Are you sure you want to delete ALL clips? This cannot be undone!')) {
    return;
  }
  
  if (!confirm('Really delete everything? This is your last chance!')) {
    return;
  }
  
  await chrome.storage.local.set({ clips: [] });
  updateStats();
  showSaveStatus('All clips deleted', 'success');
}

// Event listeners
document.querySelectorAll('input[name="syncMode"]').forEach(radio => {
  radio.addEventListener('change', saveSettings);
});
document.getElementById('autoSync').addEventListener('change', saveSettings);
// Blur handlers save only their own key to avoid overwriting unrelated fields
document.getElementById('syncEndpoint').addEventListener('blur', async () => {
  const rawEndpoint = document.getElementById('syncEndpoint').value.trim();
  if (rawEndpoint) {
    try {
      const parsed = new URL(rawEndpoint);
      const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalhost)) {
        showSaveStatus('Sync endpoint must use HTTPS (or http://localhost for development)', 'error');
        return;
      }
    } catch {
      showSaveStatus('Sync endpoint is not a valid URL', 'error');
      return;
    }
  }
  await chrome.storage.sync.set({ syncEndpoint: rawEndpoint });
  showSaveStatus('Settings saved successfully!', 'success');
});
document.getElementById('syncApiToken').addEventListener('blur', async () => {
  await chrome.storage.sync.set({ syncApiToken: document.getElementById('syncApiToken').value.trim() });
  showSaveStatus('Settings saved successfully!', 'success');
});
document.getElementById('defaultTags').addEventListener('blur', async () => {
  await chrome.storage.sync.set({ defaultTags: document.getElementById('defaultTags').value });
  showSaveStatus('Settings saved successfully!', 'success');
});
document.getElementById('testSyncBtn').addEventListener('click', testSync);
document.getElementById('exportAllBtn').addEventListener('click', exportAll);
document.getElementById('importBtn').addEventListener('click', importClips);
document.getElementById('importFile').addEventListener('change', handleFileImport);
document.getElementById('clearAllBtn').addEventListener('click', clearAll);

// Initialize
loadSettings();
