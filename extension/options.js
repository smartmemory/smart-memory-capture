// Load settings
async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'syncMode',
    'autoSync',
    'syncEndpoint',
    'defaultTags'
  ]);
  
  // Set sync mode
  const syncMode = settings.syncMode || 'local-first';
  document.querySelector(`input[name="syncMode"][value="${syncMode}"]`).checked = true;
  
  document.getElementById('autoSync').checked = settings.autoSync || false;
  document.getElementById('syncEndpoint').value = settings.syncEndpoint || '';
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
  
  const settings = {
    syncMode: syncMode,
    autoSync: document.getElementById('autoSync').checked,
    syncEndpoint: document.getElementById('syncEndpoint').value,
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
  const endpoint = document.getElementById('syncEndpoint').value;
  const statusEl = document.getElementById('syncStatus');
  
  if (!endpoint) {
    statusEl.textContent = 'Please enter a sync endpoint URL';
    statusEl.className = 'status-message error show';
    return;
  }
  
  statusEl.textContent = 'Testing connection...';
  statusEl.className = 'status-message show';
  
  try {
    const testClip = {
      id: 'test',
      title: 'Test Clip',
      url: 'https://example.com',
      content: { type: 'text', data: 'Test' },
      timestamp: new Date().toISOString()
    };
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testClip)
    });
    
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
    
    const { clips = [] } = await chrome.storage.local.get(['clips']);
    const mergedClips = [...clips, ...importedClips];
    
    // Remove duplicates by ID
    const uniqueClips = Array.from(
      new Map(mergedClips.map(clip => [clip.id, clip])).values()
    );
    
    await chrome.storage.local.set({ clips: uniqueClips });
    updateStats();
    showSaveStatus(`Imported ${importedClips.length} clips successfully!`, 'success');
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
document.getElementById('syncEndpoint').addEventListener('blur', saveSettings);
document.getElementById('defaultTags').addEventListener('blur', saveSettings);
document.getElementById('testSyncBtn').addEventListener('click', testSync);
document.getElementById('exportAllBtn').addEventListener('click', exportAll);
document.getElementById('importBtn').addEventListener('click', importClips);
document.getElementById('importFile').addEventListener('change', handleFileImport);
document.getElementById('clearAllBtn').addEventListener('click', clearAll);

// Initialize
loadSettings();
