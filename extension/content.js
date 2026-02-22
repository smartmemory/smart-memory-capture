// Content script - runs on all pages
// This allows for more advanced features like highlighting, annotations, etc.

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

