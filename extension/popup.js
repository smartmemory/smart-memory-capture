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

  const existing = clips.find(c => c.url === tab.url);
  if (!existing) return;

  // In server-primary mode the local cache is partial — skip date-comparison ('prompt') logic.
  // 'never' is allowed through because it's a user intent signal that must always be enforced.
  if (syncMode === 'server-primary' && duplicatePolicy !== 'never') return;

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
    currentDate = result?.result ?? null;
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
  } else if (currentDate && storedDate) {
    // Dates match — same content, disable silently
    noticeEl.textContent = `✓ Already captured on ${capturedOn}`;
    noticeEl.className = 'duplicate-notice saved';
    captureBtn.disabled = true;
    captureBtn.classList.add('btn-disabled');
  } else {
    // Can't compare dates (one or both absent) — show notice but allow re-capture
    noticeEl.textContent = `↻ Already captured on ${capturedOn} — click to re-capture`;
    noticeEl.className = 'duplicate-notice updated';
    noticeEl.style.cursor = 'pointer';
    noticeEl.addEventListener('click', () => {
      captureBtn.disabled = false;
      captureBtn.classList.remove('btn-disabled');
      noticeEl.textContent = `↻ Re-capturing…`;
      noticeEl.style.cursor = '';
    }, { once: true });
  }
  noticeEl.style.display = 'block';
}

// Detect YouTube video pages
function isYouTubeVideo(url) {
  try {
    const u = new URL(url);
    return ((u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') && u.pathname === '/watch')
      || u.hostname === 'youtu.be';
  } catch { return false; }
}

// Runs in MAIN world — accesses ytInitialPlayerResponse global set by YouTube
function extractYouTubePageData() {
  const pr = window.ytInitialPlayerResponse;
  if (!pr) return null;

  const vd = pr.videoDetails ?? {};
  const tracks = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

  // Prefer English; fall back to first available track
  const track = tracks.find(t => t.languageCode === 'en') ??
                tracks.find(t => t.languageCode?.startsWith('en')) ??
                tracks[0] ?? null;

  const duration = parseInt(vd.lengthSeconds ?? '0', 10);
  const thumbnails = vd.thumbnail?.thumbnails ?? [];

  return {
    transcriptUrl: track?.baseUrl ?? null,
    description: (vd.shortDescription ?? '').substring(0, 500),
    metadata: {
      author: vd.author ?? null,
      og_site_name: 'YouTube',
      og_type: 'video',
      og_image: thumbnails[thumbnails.length - 1]?.url ?? null,
      duration_seconds: duration || null,
      video_id: vd.videoId ?? null
    }
  };
}

// Fetch and parse YouTube transcript XML — returns plain text or null
async function fetchYouTubeTranscript(transcriptUrl) {
  // Guard: transcriptUrl comes from MAIN-world page data and may be attacker-controlled
  try {
    const _u = new URL(transcriptUrl);
    const h = _u.hostname;
    if (_u.protocol !== 'https:' && _u.protocol !== 'http:') return null;
    const isInternal =
      h === 'localhost' || /^127\./.test(h) || /^0\./.test(h) || h === '::1' ||
      /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\.|^100\.(6[4-9]|[7-9]\d|1([01]\d|2[0-7]))\./.test(h) ||
      /^f[cd][0-9a-f]{2}:/i.test(h) || /^fe[89ab][0-9a-f]:/i.test(h) || /^::ffff:/i.test(h);
    if (isInternal) return null;
  } catch { return null; }
  try {
    const resp = await fetch(transcriptUrl);
    if (!resp.ok) return null;
    const xml = await resp.text();
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return Array.from(doc.querySelectorAll('text'))
      .map(el => el.textContent.trim())
      .filter(t => t)
      .join(' ');
  } catch { return null; }
}

// Detect known code-hosting URLs — returns site type string or null (CAP-ENH-1e)
function isCodeUrl(url) {
  try {
    const u = new URL(url);
    const h = u.hostname;
    if (h === 'gist.github.com') return 'gist';
    if (h === 'github.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 5 && parts[2] === 'blob') return 'github-file';
      if (parts.length >= 2) return 'github-repo';
    }
    if (h === 'stackoverflow.com' || h.endsWith('.stackexchange.com')) {
      if (u.pathname.startsWith('/questions/')) return 'stackoverflow';
    }
    return null;
  } catch { return null; }
}

// Fetch raw GitHub file content by rewriting blob URL → raw.githubusercontent.com (CAP-ENH-1e)
// The raw hostname is always hard-coded here — it is not derived from user or page input.
async function fetchGitHubRaw(tabUrl) {
  try {
    const u = new URL(tabUrl);
    if (u.hostname !== 'github.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    // Expected shape: [user, repo, 'blob', branch, ...path]
    if (parts.length < 5 || parts[2] !== 'blob') return null;
    const [user, repo, , branch, ...pathParts] = parts;
    const rawUrl = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${pathParts.join('/')}`;
    const resp = await fetch(rawUrl);
    if (!resp.ok) return null;
    return await resp.text();
  } catch { return null; }
}

// Request host permissions for enhanced capture (hero images, transcripts, raw code)
// Called from a user gesture (button click) so chrome.permissions.request() is allowed.
// Fails silently — capture degrades gracefully without host permissions.
async function ensureHostPermissions() {
  try {
    const granted = await chrome.permissions.contains({ origins: ['https://*/*'] });
    if (!granted) {
      await chrome.permissions.request({ origins: ['https://*/*', 'http://*/*'] });
    }
  } catch { /* user declined or API unavailable — capture still works for basic modes */ }
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
    // Request host permissions on first capture for enhanced features
    await ensureHostPermissions();
    let content;
    let metadata = {};
    let captureMode = mode; // may be overridden for specialised pages

    if (mode === 'screenshot') {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      content = { type: 'screenshot', data: dataUrl };
    } else if (mode !== 'selection' && isYouTubeVideo(tab.url)) {
      // YouTube path — runs in MAIN world to access ytInitialPlayerResponse
      statusEl.textContent = 'Fetching transcript…';
      const [ytResult] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractYouTubePageData,
        world: 'MAIN'
      });
      const ytData = ytResult.result;

      const transcript = ytData?.transcriptUrl
        ? await fetchYouTubeTranscript(ytData.transcriptUrl) : null;

      content = {
        type: 'video',
        data: transcript ?? ytData?.description ?? '',
        html: null,
        hasTranscript: !!transcript
      };
      metadata = ytData?.metadata ?? {};
      if (transcript) {
        metadata.word_count = (transcript.match(/\S+/g) || []).length;
        metadata.reading_time_minutes = Math.ceil(metadata.word_count / 200);
      }
      captureMode = 'video';

      // Inline thumbnail as heroImage
      const heroImage = await fetchHeroImage(metadata, null, tab.url);
      if (heroImage) content.heroImage = heroImage;
    } else {
      // General path — inject content capture function into page
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: capturePageContent,
        args: [mode]
      });
      const raw = result.result;

      if (raw.type === 'selection') {
        content = { type: 'text', data: raw.data, html: raw.html ?? null };
        metadata = raw.metadata ?? {};
      } else {
        // Code path (CAP-ENH-1e): known code URL or content heuristics
        const siteType = isCodeUrl(tab.url);
        const useCodePath = siteType === 'github-file' || siteType === 'stackoverflow' ||
                            siteType === 'gist' || raw.codeBlocks?.isCode;

        if (useCodePath) {
          if (siteType === 'github-file') statusEl.textContent = 'Fetching raw file…';
          let codeText = raw.codeBlocks?.data ?? '';
          if (siteType === 'github-file') {
            // Raw URL always returns the full file; DOM is truncated for large files
            const rawContent = await fetchGitHubRaw(tab.url);
            if (rawContent) {
              const lang = raw.codeBlocks?.langs?.[0] ?? '';
              codeText = '```' + lang + '\n' + rawContent + '\n```';
            }
          }
          content = { type: 'text', data: codeText, html: null };
          metadata = {
            ...raw.metadata,
            schema_type: siteType ?? 'code',
            code_languages: raw.codeBlocks?.langs ?? []
          };
          captureMode = 'code';
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
            // Readability returned nothing useful — fall back to body HTML
            // Try to extract main content area; if not found, use full body
            let fallbackHtml = null;
            try {
              const parser = new DOMParser();
              const doc = parser.parseFromString(raw.rawHtml, 'text/html');
              const base = doc.createElement('base');
              base.href = tab.url;
              doc.head.prepend(base);
              // Prefer semantic main content containers
              const main = doc.querySelector('main, article, [role="main"]');
              fallbackHtml = (main ?? doc.body).innerHTML;
            } catch { /* fall back to text-only */ }
            content = {
              type: 'html',
              data: raw.innerText,
              html: fallbackHtml,
              readability: false
            };
          }
          metadata = raw.metadata ?? {};

          // Fetch hero image in popup context (non-blocking — skip silently on failure)
          const heroImage = await fetchHeroImage(metadata, raw.rawHtml, tab.url);
          if (heroImage) content.heroImage = heroImage;
        }
      }
    }

    // Create clip object
    const clip = {
      id: crypto.randomUUID(),
      title: tab.title,
      url: tab.url,
      mode: captureMode,
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
          // Use getAttribute to get the raw src value — img.src resolves against
          // the extension origin in DOMParser context, not the injected <base> href.
          const rawSrc = img.getAttribute('src');
          if (!rawSrc || rawSrc.startsWith('data:') || rawSrc.startsWith('blob:') || rawSrc.startsWith('javascript:')) continue;
          try { imageUrl = new URL(rawSrc, pageUrl).href; break; } catch { /* skip */ }
        }
      }
    } catch { /* ignore */ }
  }

  if (!imageUrl) return null;

  // Guard against SSRF: reject non-http(s) schemes and RFC-1918 / loopback / link-local hosts.
  // The extension has <all_urls> permission so it can reach internal network addresses —
  // a malicious page could set og:image to http://192.168.1.1/admin to probe the LAN.
  try {
    const _u = new URL(imageUrl);
    const h = _u.hostname;
    const isInternal =
      h === 'localhost' || /^127\./.test(h) || /^0\./.test(h) || h === '::1' ||
      /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\.|^100\.(6[4-9]|[7-9]\d|1([01]\d|2[0-7]))\./.test(h) ||
      // IPv6 ULA (fc00::/7), link-local (fe80::/10), and IPv4-mapped (::ffff:)
      /^f[cd][0-9a-f]{2}:/i.test(h) || /^fe[89ab][0-9a-f]:/i.test(h) || /^::ffff:/i.test(h);
    if ((_u.protocol !== 'https:' && _u.protocol !== 'http:') || isInternal) return null;
  } catch { return null; }

  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) return null;
    // Re-validate final URL after redirects — guards against open-redirect SSRF on CDN URLs
    try {
      const finalH = new URL(resp.url).hostname;
      if (finalH !== new URL(imageUrl).hostname) {
        if (finalH === 'localhost' || /^127\./.test(finalH) || /^0\./.test(finalH) || finalH === '::1' ||
            /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\.|^100\.(6[4-9]|[7-9]\d|1([01]\d|2[0-7]))\./.test(finalH) ||
            /^f[cd][0-9a-f]{2}:/i.test(finalH) || /^fe[89ab][0-9a-f]:/i.test(finalH) || /^::ffff:/i.test(finalH)) {
          return null;
        }
      }
    } catch { return null; }
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
    const sel = window.getSelection();
    const text = sel.toString();
    if (!text) {
      throw new Error('No text selected. Please select some text first.');
    }
    // Capture HTML fragment to preserve formatting (bold, links, lists)
    let html = null;
    try {
      if (sel.rangeCount > 0) {
        const container = document.createElement('div');
        for (let i = 0; i < sel.rangeCount; i++) {
          container.appendChild(sel.getRangeAt(i).cloneContents());
        }
        const rawHtml = container.innerHTML.trim();
        if (rawHtml && rawHtml !== text) html = rawHtml;
      }
    } catch { /* fall back to text-only */ }
    return { type: 'selection', data: text, html, metadata: {} };
  }

  // Metadata helpers
  const getMeta = (selector) => document.querySelector(selector)?.content ?? null;
  const getOg = (prop) => getMeta(`meta[property="${prop}"]`);

  // Publish date + schema.org structured data: og/article tag → JSON-LD → <time datetime>
  let publishedAt = getOg('article:published_time');
  let schemaType = null;
  let ldAuthor = null;
  let ldDescription = null;

  const SCHEMA_TYPES = new Set(['Article', 'BlogPosting', 'Recipe', 'Product', 'NewsArticle', 'TechArticle']);

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const items = Array.isArray(data) ? data : [data, ...(data['@graph'] ?? [])];
      for (const item of items) {
        // Normalise @type to bare name (may be a full schema.org URL)
        const rawType = Array.isArray(item['@type']) ? item['@type'][0] : (item['@type'] ?? '');
        const bareType = rawType.replace(/^.*\//, '');
        if (!schemaType && SCHEMA_TYPES.has(bareType)) schemaType = bareType;
        if (!publishedAt && item.datePublished) publishedAt = item.datePublished;
        if (!ldAuthor) {
          const a = item.author;
          if (typeof a === 'string') ldAuthor = a;
          else if (Array.isArray(a) && a.length > 0) ldAuthor = (typeof a[0] === 'string' ? a[0] : (a[0]?.name ?? null));
          else if (a && typeof a === 'object') ldAuthor = a.name ?? null;
        }
        if (!ldDescription && item.description) ldDescription = String(item.description);
      }
    } catch { /* ignore malformed JSON-LD */ }
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
    // <meta name="author"> takes priority; fall back to JSON-LD author
    author: getMeta('meta[name="author"]') ?? ldAuthor,
    // <meta name="description"> takes priority; fall back to JSON-LD description
    description: getMeta('meta[name="description"]') ?? ldDescription,
    published_at: publishedAt,
    schema_type: schemaType,
    word_count: wordCount,
    reading_time_minutes: Math.ceil(wordCount / 200)
  };

  // CAP-ENH-1e: code detection and extraction
  // All helpers are defined inside capturePageContent because this function is serialized
  // and injected into the page — no closure references survive the executeScript boundary.

  function inferLang(pre) {
    const code = pre.querySelector('code') ?? pre;
    const cls = (code.className ?? '') + ' ' + (pre.className ?? '');
    const m = cls.match(/\b(?:language|lang|hljs)-([\w-]+)\b/i);
    return m ? m[1].toLowerCase() : '';
  }

  // Find the last h1-h4 that precedes `el` in document order
  function nearestHeading(el) {
    let result = '';
    for (const h of document.querySelectorAll('h1,h2,h3,h4')) {
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) result = h.textContent.trim();
    }
    return result;
  }

  // Walk prev/next siblings to find the nearest <p> without crossing another <pre>
  function nearestP(el, dir) {
    let node = dir === 'prev' ? el.previousElementSibling : el.nextElementSibling;
    while (node) {
      if (node.tagName === 'P') return node.textContent.trim().substring(0, 200);
      if (node.tagName === 'PRE') break;
      node = dir === 'prev' ? node.previousElementSibling : node.nextElementSibling;
    }
    return '';
  }

  // Serialize a DOM subtree to readable Markdown, preserving fenced code blocks
  function serializeToMd(el) {
    const parts = [];
    function walk(n) {
      if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) parts.push(t); return; }
      if (n.nodeName === 'PRE') {
        const c = n.querySelector('code') ?? n;
        const cls = (c.className ?? '') + ' ' + (n.className ?? '');
        const lm = cls.match(/\b(?:language|lang|hljs)-([\w-]+)\b/i);
        parts.push('```' + (lm ? lm[1].toLowerCase() : '') + '\n' + c.textContent.trim() + '\n```');
        return;
      }
      if (/^H[1-4]$/.test(n.nodeName)) { parts.push('### ' + n.textContent.trim()); return; }
      if (n.nodeName === 'P') { parts.push(n.textContent.trim()); return; }
      if (/^[UO]L$/.test(n.nodeName)) {
        for (const li of n.querySelectorAll('li')) parts.push('- ' + li.textContent.trim());
        return;
      }
      for (const child of n.childNodes) walk(child);
    }
    walk(el);
    return parts.filter(Boolean).join('\n\n');
  }

  const _preBlocks = Array.from(document.querySelectorAll('pre'));
  let _totalCodeChars = 0, _maxLines = 0;
  const _codelangs = new Set();
  for (const pre of _preBlocks) {
    const code = pre.querySelector('code') ?? pre;
    const text = code.textContent ?? '';
    _totalCodeChars += text.length;
    const lines = (text.match(/\n/g) ?? []).length + 1;
    if (lines > _maxLines) _maxLines = lines;
    const lang = inferLang(pre);
    if (lang) _codelangs.add(lang);
  }
  const _bodyLen = (document.body.textContent ?? '').length;
  const _codeRatio = _bodyLen > 0 ? _totalCodeChars / _bodyLen : 0;
  const _isCode = _preBlocks.length >= 2 || _maxLines >= 15 || _codeRatio >= 0.20;

  let _codeData = null;
  if (_isCode) {
    const _host = window.location.hostname;
    const _isSO = _host === 'stackoverflow.com' || _host.endsWith('.stackexchange.com');
    if (_isSO) {
      const sections = [];
      const qBody = document.querySelector('.question [itemprop="text"]');
      if (qBody) sections.push('## Question\n\n' + serializeToMd(qBody));
      const aAccepted = document.querySelector('.accepted-answer [itemprop="text"]');
      if (aAccepted) {
        const score = document.querySelector('.accepted-answer .js-vote-count')?.textContent?.trim() ?? '?';
        sections.push('## Accepted Answer (↑ ' + score + ')\n\n' + serializeToMd(aAccepted));
      }
      const extras = [...document.querySelectorAll('.answer:not(.accepted-answer)')]
        .map(el => ({ el, score: parseInt(el.querySelector('.js-vote-count')?.textContent ?? '0', 10) }))
        .filter(a => a.score > 10)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
      for (const { el, score } of extras) {
        const body = el.querySelector('[itemprop="text"]');
        if (body) sections.push('## Answer (↑ ' + score + ')\n\n' + serializeToMd(body));
      }
      _codeData = sections.join('\n\n---\n\n');
    } else {
      // Generic: extract each <pre> block with surrounding heading and context
      const blocks = [];
      for (const pre of _preBlocks) {
        const code = pre.querySelector('code') ?? pre;
        const codeText = code.textContent.trim();
        if (!codeText) continue;
        const lang = inferLang(pre);
        const heading = nearestHeading(pre);
        const preceding = nearestP(pre, 'prev');
        const following = nearestP(pre, 'next');
        const parts = [];
        if (heading) parts.push('## ' + heading);
        if (preceding) parts.push(preceding);
        parts.push('```' + lang + '\n' + codeText + '\n```');
        if (following) parts.push(following);
        blocks.push(parts.join('\n\n'));
      }
      _codeData = blocks.join('\n\n---\n\n');
    }
  }
  // --- end CAP-ENH-1e ---

  return {
    type: 'html',
    rawHtml: document.documentElement.outerHTML,
    innerText: document.body.innerText,
    metadata,
    codeBlocks: { isCode: _isCode, data: _codeData, count: _preBlocks.length, langs: Array.from(_codelangs) }
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
      // Keep the save receipt's handle and the minted key with the cached clip.
      if (response.idempotency_key) clip.idempotency_key = response.idempotency_key;
      if (response.receipt_handle) clip.receipt = response.receipt_handle;
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
