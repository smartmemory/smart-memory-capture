// Content script - injected on demand via chrome.scripting.executeScript

// Guard against duplicate injection (context menu can fire multiple times)
if (window.__smartMemoryCaptureLoaded) {
  // Already loaded — skip re-registration
} else {
window.__smartMemoryCaptureLoaded = true;

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  if (request.action === 'getSelection') {
    sendResponse({ selection: window.getSelection().toString() });
    return;
  }

  if (request.action === 'highlightSelection') {
    sendResponse(highlightSelectedText());
    return;
  }

  if (request.action === 'showCaptureSheet') {
    showCaptureSheet(request.selectionText, request.defaultTags);
    sendResponse({ ok: true });
    return;
  }
});

// Highlight selected text (optional feature)
function highlightSelectedText() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return { success: false, error: 'No selection' };

  const range = selection.getRangeAt(0);
  const span = document.createElement('span');
  span.style.backgroundColor = '#ffeb3b';
  span.style.padding = '2px';

  try {
    range.surroundContents(span);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Selection-first capture sheet (CAP-ENH-1h)
// Injected into the page via shadow DOM — fully isolated from page styles.
function showCaptureSheet(selectionText, defaultTags) {
  // Only one sheet at a time
  if (document.getElementById('sm-capture-host')) return;

  const host = document.createElement('div');
  host.id = 'sm-capture-host';
  host.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  shadow.innerHTML = `
    <style>
      /* Tokens from smart-memory-design-system/colors_and_type.css (dark surface, blue primary) */
      :host { all: initial; }
      .sheet {
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: #111827;
        color: #d1d5db;
        border-radius: 12px;
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.4), 0 25px 50px -12px rgba(0,0,0,0.6);
        padding: 16px;
        width: 320px;
        border: 1px solid #374151;
      }
      .sheet-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .sheet-brand { display: flex; align-items: center; gap: 8px; }
      .sheet-logo { display: block; flex: none; }
      .sheet-title {
        font-size: 14px;
        font-weight: 600;
        letter-spacing: -0.025em;
        color: #ffffff;
      }
      .sheet-close {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 18px;
        color: #9ca3af;
        padding: 2px 6px;
        border-radius: 6px;
        line-height: 1;
      }
      .sheet-close:hover { color: #ffffff; background: #1f2937; }
      .sheet-preview {
        font-size: 12px;
        color: #d1d5db;
        background: #030712;
        border: 1px solid #1f2937;
        border-radius: 6px;
        padding: 8px;
        max-height: 64px;
        overflow: hidden;
        margin-bottom: 10px;
        line-height: 1.4;
      }
      input {
        width: 100%;
        padding: 7px 10px;
        border: 1px solid #374151;
        border-radius: 6px;
        font-size: 12px;
        font-family: inherit;
        background: #030712;
        color: #ffffff;
        box-sizing: border-box;
        margin-bottom: 10px;
        outline: none;
        transition: border-color 0.15s;
      }
      input::placeholder { color: #9ca3af; opacity: 1; }
      input:focus { border-color: #60a5fa; box-shadow: 0 0 0 1px #60a5fa; }
      .sheet-actions { display: flex; gap: 8px; }
      .btn-save {
        flex: 1;
        padding: 8px;
        background: #2563eb;
        color: #ffffff;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.15s;
      }
      .btn-save:hover { background: #3b82f6; }
      .btn-save:focus-visible, .sheet-close:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
      .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
      .sheet-status {
        font-size: 12px;
        text-align: center;
        min-height: 16px;
        margin-top: 8px;
        color: #4ade80;
      }
      .sheet-status.error { color: #f87171; }
    </style>
    <div class="sheet">
      <div class="sheet-header">
        <div class="sheet-brand">
          <svg class="sheet-logo" viewBox="0 0 100 100" width="22" height="22" aria-hidden="true"><defs><mask id="smm" maskUnits="userSpaceOnUse"><rect x="-10" y="-10" width="120" height="120" fill="white"/><circle cx="50" cy="80" r="6.1" fill="black"/></mask><linearGradient id="smg" gradientUnits="userSpaceOnUse" x1="50" y1="0" x2="50" y2="100"><stop offset="0%" stop-color="#3ddcb0"/><stop offset="100%" stop-color="#2bb1ff"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="#02040a"/><g transform="translate(4 4) scale(.92)" fill="none" stroke="url(#smg)" stroke-width="4.348" stroke-linecap="round" stroke-linejoin="round"><g mask="url(#smm)"><path d="M 50 80 C 37.72 64.81, 22.72 60.52, 22.72 41.04"/><path d="M 50 80 C 62.28 64.81, 77.28 60.52, 77.28 41.04"/></g><circle cx="22.72" cy="41.04" r="4.8"/><circle cx="50" cy="22" r="4.8"/><circle cx="77.28" cy="41.04" r="4.8"/><circle cx="50" cy="80" r="8.2"/><circle cx="50" cy="80" r="3.2" fill="url(#smg)" stroke="none"/></g></svg>
          <span class="sheet-title">Save to SmartMemory</span>
        </div>
        <button class="sheet-close" id="smClose">✕</button>
      </div>
      <div class="sheet-preview" id="smPreview"></div>
      <input type="text" id="smTags" placeholder="Tags (comma-separated)">
      <input type="text" id="smNotes" placeholder="Notes (optional)">
      <div class="sheet-actions">
        <button class="btn-save" id="smSave">Save</button>
      </div>
      <div class="sheet-status" id="smStatus"></div>
    </div>
  `;

  // Sanitize preview text — textContent only, no HTML
  shadow.getElementById('smPreview').textContent =
    selectionText.length > 200 ? selectionText.substring(0, 200) + '…' : selectionText;

  if (defaultTags) shadow.getElementById('smTags').value = defaultTags;

  shadow.getElementById('smClose').addEventListener('click', () => host.remove());

  shadow.getElementById('smSave').addEventListener('click', async () => {
    const btn = shadow.getElementById('smSave');
    const statusEl = shadow.getElementById('smStatus');
    btn.disabled = true;
    statusEl.textContent = 'Saving…';
    statusEl.className = 'sheet-status';

    const tags = shadow.getElementById('smTags').value
      .split(',').map(t => t.trim()).filter(t => t);

    const notes = shadow.getElementById('smNotes').value.trim();

    const result = await chrome.runtime.sendMessage({
      action: 'saveSelectionClip',
      selectionText,
      tags,
      notes,
      title: document.title,
      url: location.href,
      favicon: document.querySelector('link[rel~="icon"]')?.href ?? ''
    });

    if (result?.success) {
      statusEl.textContent = '✓ Saved!';
      setTimeout(() => host.remove(), 1200);
    } else {
      statusEl.textContent = '✗ ' + (result?.error ?? 'Failed');
      statusEl.className = 'sheet-status error';
      btn.disabled = false;
    }
  });

  // Dismiss on Escape
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { host.remove(); document.removeEventListener('keydown', onKey); }
  });
}

} // end idempotency guard
