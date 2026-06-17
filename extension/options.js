// Load settings
async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'syncMode',
    'autoSync',
    'syncEndpoint',
    'defaultTags',
    'duplicatePolicy'
  ]);
  // Token is device-local only — never synced to Google's cloud
  const { syncApiToken } = await chrome.storage.local.get(['syncApiToken']);
  settings.syncApiToken = syncApiToken;

  // Set sync mode — whitelist to prevent XSS via querySelector attribute injection
  const allowedModes = ['local-first', 'server-primary'];
  const syncMode = allowedModes.includes(settings.syncMode) ? settings.syncMode : 'local-first';
  document.querySelector(`input[name="syncMode"][value="${syncMode}"]`).checked = true;

  document.getElementById('autoSync').checked = settings.autoSync || false;
  document.getElementById('syncEndpoint').value = settings.syncEndpoint || '';
  document.getElementById('syncApiToken').value = settings.syncApiToken || '';
  document.getElementById('defaultTags').value = settings.defaultTags || '';

  const allowedPolicies = ['prompt', 'always', 'never'];
  const duplicatePolicy = allowedPolicies.includes(settings.duplicatePolicy) ? settings.duplicatePolicy : 'prompt';
  document.getElementById('duplicatePolicy').value = duplicatePolicy;

  updateStats();
  // Silently reflect lite status if we already hold localhost permission (no
  // gesture is available on load, so we can't request it here).
  refreshLiteStatus(true);
}

// Resolve the daemon port to probe: a configured loopback endpoint's explicit
// port wins, else the lite daemon default (9014).
function configuredDaemonPort() {
  try {
    const ep = document.getElementById('syncEndpoint').value.trim();
    if (ep) {
      const u = new URL(ep);
      if (smIsLoopbackHost(u.hostname) && u.port) return Number(u.port);
    }
  } catch { /* fall through to default */ }
  return SM_DEFAULT_DAEMON_PORT;
}

// Render a detectLite result into the lite status line. When lite is up and no
// endpoint is configured yet, auto-target it (an explicit user endpoint always wins).
async function renderLiteStatus(res, fromButton) {
  const statusEl = document.getElementById('liteStatus');
  if (res && res.installed) {
    const verStr = res.version ? ` v${res.version}` : '';
    let msg = `✓ Local SmartMemory running on port ${res.port}${verStr}`;
    const current = document.getElementById('syncEndpoint').value.trim();
    if (!current) {
      const url = `http://${SM_DAEMON_HOST}:${res.port}`;
      document.getElementById('syncEndpoint').value = url;
      document.getElementById('autoSync').checked = true;
      await chrome.storage.sync.set({ syncEndpoint: url, autoSync: true });
      msg += ' — set as your capture target.';
    }
    statusEl.textContent = msg;
    statusEl.className = 'status-message success show';
  } else if (res) {
    const hint = res.reason === 'permission'
      ? 'click "Detect local SmartMemory" to grant localhost access'
      : `start it with \`smartmemory server\` (port ${res.port}), or configure a Cloud URL + API token below`;
    statusEl.textContent = `✗ Local SmartMemory not detected — ${hint}`;
    statusEl.className = `status-message ${fromButton ? 'error ' : ''}show`;
  }
}

// Ask the worker to probe the lite daemon. `silent` skips the probe (and stays
// quiet) when localhost permission hasn't been granted yet.
async function refreshLiteStatus(silent) {
  let granted = false;
  try {
    granted = await chrome.permissions.contains({ origins: [`http://${SM_DAEMON_HOST}/*`] });
  } catch { /* treat as not granted */ }
  if (!granted) {
    if (!silent) renderLiteStatus({ installed: false, port: configuredDaemonPort(), reason: 'permission' }, true);
    return;
  }
  const res = await chrome.runtime.sendMessage({ action: 'detectLite', port: configuredDaemonPort() });
  renderLiteStatus(res, !silent);
}

// "Detect local SmartMemory" button: request localhost permission (user gesture),
// then probe via the worker.
async function detectLiteFlow() {
  const statusEl = document.getElementById('liteStatus');
  statusEl.textContent = 'Requesting localhost access…';
  statusEl.className = 'status-message show';
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [`http://${SM_DAEMON_HOST}/*`] });
  } catch { /* granted stays false */ }
  if (!granted) {
    statusEl.textContent = '✗ Permission denied — cannot probe localhost';
    statusEl.className = 'status-message error show';
    return;
  }
  const port = configuredDaemonPort();
  statusEl.textContent = `Probing 127.0.0.1:${port}…`;
  const res = await chrome.runtime.sendMessage({ action: 'detectLite', port });
  renderLiteStatus(res, true);
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
  const allowedModes = ['local-first', 'server-primary'];
  const syncMode = document.querySelector('input[name="syncMode"]:checked').value;
  if (!allowedModes.includes(syncMode)) return;
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
    defaultTags: document.getElementById('defaultTags').value
  };

  await chrome.storage.sync.set(settings);
  // Token is device-local only — stored in .local, never synced.
  // Also saved here (not just on blur) so radio/checkbox changes don't lose an unsaved token.
  await chrome.storage.local.set({ syncApiToken: document.getElementById('syncApiToken').value.trim() });
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

  // Validate HTTPS and block RFC-1918/loopback ranges before sending the token
  try {
    const parsed = new URL(endpoint);
    const h = parsed.hostname;
    const isLocalhost = h === 'localhost' || h === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalhost)) {
      statusEl.textContent = '✗ Endpoint must use HTTPS';
      statusEl.className = 'status-message error show';
      return;
    }
    const isInternal = !isLocalhost && (
      h === '::1' || /^127\./.test(h) || /^0\./.test(h) ||
      /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\.|^100\.(6[4-9]|[7-9]\d|1([01]\d|2[0-7]))\./.test(h) ||
      /^f[cd][0-9a-f]{2}:/i.test(h) || /^fe[89ab][0-9a-f]:/i.test(h) || /^::ffff:/i.test(h)
    );
    if (isInternal) {
      statusEl.textContent = '✗ Endpoint must not be a private/internal address';
      statusEl.className = 'status-message error show';
      return;
    }
  } catch {
    statusEl.textContent = '✗ Invalid endpoint URL';
    statusEl.className = 'status-message error show';
    return;
  }

  // Auth rule (CAP-CONN-1): cloud (service) endpoints require a token.
  if (smTokenRequired(endpoint) && !token) {
    statusEl.textContent = '✗ API token required for cloud sync';
    statusEl.className = 'status-message error show';
    return;
  }

  // Request host permission for the sync endpoint origin (user gesture context).
  // Match patterns can't carry a port — protocol+host matches all ports.
  try {
    const granted = await chrome.permissions.request({ origins: [smOriginPattern(endpoint)] });
    if (!granted) {
      statusEl.textContent = '✗ Permission denied — cannot connect to this endpoint';
      statusEl.className = 'status-message error show';
      return;
    }
  } catch {
    statusEl.textContent = '✗ Failed to request host permission';
    statusEl.className = 'status-message error show';
    return;
  }

  statusEl.textContent = 'Testing connection...';
  statusEl.className = 'status-message show';

  // Loopback (lite) endpoint: probe via the worker — the keyless daemon sends no
  // CORS headers, so a page-context fetch would be blocked. Also verifies identity.
  if (smClassifyTarget(endpoint) === 'lite') {
    let port = SM_DEFAULT_DAEMON_PORT;
    try { port = Number(new URL(endpoint).port) || SM_DEFAULT_DAEMON_PORT; } catch { /* default */ }
    const res = await chrome.runtime.sendMessage({ action: 'detectLite', port });
    if (res && res.installed) {
      statusEl.textContent = `✓ Local SmartMemory running (port ${res.port})`;
      statusEl.className = 'status-message success show';
    } else {
      statusEl.textContent = `✗ Local SmartMemory not detected (${res?.reason || 'unreachable'})`;
      statusEl.className = 'status-message error show';
    }
    return;
  }

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
  // Auth rule (CAP-CONN-1): warn (don't block entry) when a cloud endpoint has no
  // token yet — the actual sync is hard-blocked in background.js until one is set.
  if (rawEndpoint && smTokenRequired(rawEndpoint) && !document.getElementById('syncApiToken').value.trim()) {
    showSaveStatus('Saved. API token is required for cloud sync — add it below.', 'error');
  } else {
    showSaveStatus('Settings saved successfully!', 'success');
  }
});
document.getElementById('syncApiToken').addEventListener('blur', async () => {
  // Token stored locally only — not synced to Google's cloud
  await chrome.storage.local.set({ syncApiToken: document.getElementById('syncApiToken').value.trim() });
  showSaveStatus('Settings saved successfully!', 'success');
});
document.getElementById('defaultTags').addEventListener('blur', async () => {
  await chrome.storage.sync.set({ defaultTags: document.getElementById('defaultTags').value });
  showSaveStatus('Settings saved successfully!', 'success');
});
document.getElementById('duplicatePolicy').addEventListener('change', async () => {
  const allowedPolicies = ['prompt', 'always', 'never'];
  const val = document.getElementById('duplicatePolicy').value;
  if (!allowedPolicies.includes(val)) return;
  await chrome.storage.sync.set({ duplicatePolicy: val });
  showSaveStatus('Settings saved successfully!', 'success');
});
document.getElementById('detectLiteBtn').addEventListener('click', detectLiteFlow);
document.getElementById('testSyncBtn').addEventListener('click', testSync);
document.getElementById('exportAllBtn').addEventListener('click', exportAll);
document.getElementById('importBtn').addEventListener('click', importClips);
document.getElementById('importFile').addEventListener('change', handleFileImport);
document.getElementById('clearAllBtn').addEventListener('click', clearAll);

// Initialize
loadSettings();
