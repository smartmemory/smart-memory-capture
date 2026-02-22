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

  await checkDuplicate(tab);
}

// Check if this URL has already been captured. Behaviour controlled by duplicatePolicy setting.
async function checkDuplicate(tab) {
  const { syncMode, duplicatePolicy = 'prompt' } = await chrome.storage.sync.get(['syncMode', 'duplicatePolicy']);
  const { clips = [] } = await chrome.storage.local.get(['clips']);

  // 'always': skip check entirely — re-capture without any notice
  if (duplicatePolicy === 'always') return;

  // In server-primary mode local cache is partial — skip the check
  if (syncMode === 'server-primary') return;

  const existing = clips.find(c => c.url === tab.url);
  if (!existing) return;

  const capturedOn = new Date(existing.timestamp).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
  const noticeEl = document.getElementById('duplicateNotice');
  const captureBtn = document.getElementById('captureBtn');

  // 'never': always block, no date check needed
  if (duplicatePolicy === 'never') {
    noticeEl.textContent = `✓ Already captured on ${capturedOn}`;
    noticeEl.className = 'duplicate-notice saved';
    noticeEl.style.display = 'block';
    captureBtn.disabled = true;
    captureBtn.classList.add('btn-disabled');
    return;
  }

  // 'prompt': check date and decide
  let currentDate = null;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const getMeta = (sel) => document.querySelector(sel)?.content ?? null;
        let d = getMeta('meta[property="article:published_time"]');
        if (!d) {
          for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
            try {
              const data = JSON.parse(s.textContent);
              const items = Array.isArray(data) ? data : [data, ...(data['@graph'] ?? [])];
              for (const item of items) { if (item.datePublished) { d = item.datePublished; break; } }
            } catch { /* ignore malformed JSON-LD */ }
            if (d) break;
          }
        }
        if (!d) d = document.querySelector('time[datetime]')?.getAttribute('datetime') ?? null;
        return d;
      }
    });
    currentDate = result.result;
  } catch { /* non-injectable page (chrome:// etc.) — skip check */ return; }

  const storedDate = existing.metadata?.published_at ?? null;
  const dateChanged = currentDate && storedDate &&
    new Date(currentDate).getTime() !== new Date(storedDate).getTime();

  if (dateChanged) {
    // Content has been updated — show notice and require one confirmation click
    noticeEl.textContent = `↻ Page updated since last capture (${capturedOn}) — click to re-capture`;
    noticeEl.className = 'duplicate-notice updated';
    captureBtn.disabled = true;
    captureBtn.classList.add('btn-disabled');
    noticeEl.style.cursor = 'pointer';
    noticeEl.addEventListener('click', () => {
      captureBtn.disabled = false;
      captureBtn.classList.remove('btn-disabled');
      noticeEl.textContent = `↻ Re-capturing updated page…`;
      noticeEl.style.cursor = '';
    }, { once: true });
  } else {
    // Same content — disable capture silently
    noticeEl.textContent = `✓ Already captured on ${capturedOn}`;
    noticeEl.className = 'duplicate-notice saved';
    captureBtn.disabled = true;
    captureBtn.classList.add('btn-disabled');
  }
  noticeEl.style.display = 'block';
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
    let metadata = {};

    if (mode === 'screenshot') {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      content = { type: 'screenshot', data: dataUrl };
    } else {
      // Inject content capture function into page — returns raw HTML + metadata
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: capturePageContent,
        args: [mode]
      });
      const raw = result.result;

      if (raw.type === 'selection') {
        content = { type: 'text', data: raw.data, html: null };
        metadata = raw.metadata ?? {};
      } else {
        // Run Readability in popup context (no page pollution, safe DOMParser sandbox)
        const article = extractWithReadability(raw.rawHtml, tab.url);
        if (article && (article.textContent?.trim().length ?? 0) > 100) {
          content = {
            type: 'html',
            data: article.textContent,
            html: article.content,
            readability: true
          };
          // Readability byline as author fallback
          if (article.byline && !raw.metadata?.author) {
            raw.metadata = raw.metadata ?? {};
            raw.metadata.author = article.byline;
          }
        } else {
          // Readability returned nothing useful — fall back to plain innerText
          content = {
            type: 'html',
            data: raw.innerText,
            html: null,
            readability: false
          };
        }
        metadata = raw.metadata ?? {};

        // Fetch hero image in popup context (non-blocking — skip silently on failure)
        const heroImage = await fetchHeroImage(metadata, raw.rawHtml, tab.url);
        if (heroImage) content.heroImage = heroImage;
      }
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
      favicon: tab.favIconUrl,
      metadata: metadata
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

// Fetch og:image (or first large <img>) and inline as base64 data URI.
// Runs in popup context — extension pages have <all_urls> host permission.
// Returns null on any failure (network, CORS, size over cap, no image found).
async function fetchHeroImage(metadata, rawHtml, pageUrl) {
  const HERO_MAX_BYTES = 500 * 1024; // 500 KB cap

  // Source priority: og:image → first large <img> from raw HTML
  let imageUrl = metadata?.og_image ?? null;

  if (!imageUrl && rawHtml) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawHtml, 'text/html');
      const base = doc.createElement('base');
      base.href = pageUrl;
      doc.head.prepend(base);
      for (const img of doc.querySelectorAll('img[src]')) {
        const w = parseInt(img.getAttribute('width') || '0', 10);
        const h = parseInt(img.getAttribute('height') || '0', 10);
        if (w > 200 || h > 200 || (!w && !h)) {
          // Resolve relative URL using the base
          try { imageUrl = new URL(img.src, pageUrl).href; break; } catch { /* skip */ }
        }
      }
    } catch { /* ignore */ }
  }

  if (!imageUrl) return null;

  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (blob.size > HERO_MAX_BYTES) return null;
    // Only inline supported image types — guard against unexpected content
    if (!/^image\/(jpeg|png|gif|webp)$/.test(blob.type)) return null;
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Run Readability in popup context using DOMParser — never injected into the page
function extractWithReadability(rawHtml, pageUrl) {
  if (typeof Readability === 'undefined') return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    // Set base URL so Readability can resolve relative links
    const base = doc.createElement('base');
    base.href = pageUrl;
    doc.head.prepend(base);
    return new Readability(doc).parse();
  } catch {
    return null;
  }
}

// Injected into page — must be self-contained (no closure references)
// Returns raw HTML + structured metadata for processing in popup context
function capturePageContent(mode) {
  if (mode === 'selection') {
    const selection = window.getSelection().toString();
    if (!selection) {
      throw new Error('No text selected. Please select some text first.');
    }
    return { type: 'selection', data: selection, metadata: {} };
  }

  // Metadata helpers
  const getMeta = (selector) => document.querySelector(selector)?.content ?? null;
  const getOg = (prop) => getMeta(`meta[property="${prop}"]`);

  // Publish date: og/article tag → JSON-LD → <time datetime>
  let publishedAt = getOg('article:published_time');
  if (!publishedAt) {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data, ...(data['@graph'] ?? [])];
        for (const item of items) {
          if (item.datePublished) { publishedAt = item.datePublished; break; }
        }
      } catch { /* ignore malformed JSON-LD */ }
      if (publishedAt) break;
    }
  }
  if (!publishedAt) {
    publishedAt = document.querySelector('time[datetime]')?.getAttribute('datetime') ?? null;
  }

  const wordCount = (document.body.innerText.trim().match(/\S+/g) || []).length;

  const metadata = {
    og_title: getOg('og:title'),
    og_description: getOg('og:description'),
    og_image: getOg('og:image'),
    og_type: getOg('og:type'),
    og_site_name: getOg('og:site_name'),
    author: getMeta('meta[name="author"]'),
    description: getMeta('meta[name="description"]'),
    published_at: publishedAt,
    word_count: wordCount,
    reading_time_minutes: Math.ceil(wordCount / 200)
  };

  return {
    type: 'html',
    rawHtml: document.documentElement.outerHTML,
    innerText: document.body.innerText,
    metadata
  };
}

// Save clip to storage
async function saveClip(clip) {
  const { syncMode, syncEndpoint } = await chrome.storage.sync.get(['syncMode', 'syncEndpoint']);

  if (syncMode === 'server-primary' && syncEndpoint) {
    // Server-first mode: send to server, only cache locally on success
    const response = await chrome.runtime.sendMessage({
      action: 'syncToServer',
      clip: clip
    });

    if (response && response.success) {
      await cacheClipLocally(clip);
    } else {
      throw new Error(response?.error || 'Failed to save to server');
    }
  } else {
    // Local-first mode (default): save locally, then optionally sync
    await cacheClipLocally(clip);
    chrome.runtime.sendMessage({ action: 'clipSaved', clip: clip });
  }
}

// Cache clip in local storage (offline access or sync spool)
async function cacheClipLocally(clip) {
  const { clips = [] } = await chrome.storage.local.get(['clips']);
  clips.unshift(clip);

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
