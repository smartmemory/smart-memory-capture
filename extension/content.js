// Content script - runs on all pages

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
      :host { all: initial; }
      .sheet {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18);
        padding: 16px;
        width: 320px;
        border: 1px solid #e2e8f0;
      }
      .sheet-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }
      .sheet-title {
        font-size: 13px;
        font-weight: 600;
        color: #2c3e50;
      }
      .sheet-close {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 18px;
        color: #6c757d;
        padding: 0;
        line-height: 1;
      }
      .sheet-preview {
        font-size: 12px;
        color: #495057;
        background: #f8f9fa;
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
        border: 1.5px solid #e2e8f0;
        border-radius: 6px;
        font-size: 12px;
        font-family: inherit;
        box-sizing: border-box;
        margin-bottom: 10px;
        outline: none;
        transition: border-color 0.15s;
      }
      input:focus { border-color: #667eea; }
      .sheet-actions { display: flex; gap: 8px; }
      .btn-save {
        flex: 1;
        padding: 8px;
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: #fff;
        border: none;
        border-radius: 7px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
      .sheet-status {
        font-size: 12px;
        text-align: center;
        min-height: 16px;
        margin-top: 8px;
        color: #28a745;
      }
      .sheet-status.error { color: #dc3545; }
    </style>
    <div class="sheet">
      <div class="sheet-header">
        <span class="sheet-title">Save to Smart Memory</span>
        <button class="sheet-close" id="smClose">✕</button>
      </div>
      <div class="sheet-preview" id="smPreview"></div>
      <input type="text" id="smTags" placeholder="Tags (comma-separated)">
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

    const result = await chrome.runtime.sendMessage({
      action: 'saveSelectionClip',
      selectionText,
      tags,
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
