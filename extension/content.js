// Content script - runs on all pages
// This allows for more advanced features like highlighting, annotations, etc.

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSelection') {
    sendResponse({ selection: window.getSelection().toString() });
  }
  
  if (request.action === 'highlightSelection') {
    highlightSelectedText();
    sendResponse({ success: true });
  }
  
  return true;
});

// Highlight selected text (optional feature)
function highlightSelectedText() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  
  const range = selection.getRangeAt(0);
  const span = document.createElement('span');
  span.style.backgroundColor = '#ffeb3b';
  span.style.padding = '2px';
  
  try {
    range.surroundContents(span);
  } catch (e) {
    console.log('Cannot highlight complex selection');
  }
}

// Add context menu support (right-click capture)
document.addEventListener('mouseup', () => {
  const selection = window.getSelection().toString();
  if (selection.length > 0) {
    // Store selection for quick capture
    chrome.storage.local.set({ lastSelection: selection });
  }
});
