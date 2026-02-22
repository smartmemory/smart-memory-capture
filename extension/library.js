let allClips = [];
let filteredClips = [];
let selectedTag = null;

// Initialize library
async function init() {
  await loadClips();
  updateStats();
  renderTagsFilter();
  renderClips();
  setupEventListeners();
}

// Load clips from storage
async function loadClips() {
  const { clips = [] } = await chrome.storage.local.get(['clips']);
  allClips = clips;
  filteredClips = clips;
}

// Update statistics
function updateStats() {
  document.getElementById('totalClips').textContent = allClips.length;
  
  // Count clips from this week
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const thisWeek = allClips.filter(clip => new Date(clip.timestamp) > oneWeekAgo).length;
  document.getElementById('thisWeek').textContent = thisWeek;
  
  // Count unique tags
  const allTags = new Set();
  allClips.forEach(clip => {
    (clip.tags || []).forEach(tag => allTags.add(tag));
  });
  document.getElementById('totalTags').textContent = allTags.size;
}

// Render tags filter
function renderTagsFilter() {
  const allTags = new Set();
  allClips.forEach(clip => {
    (clip.tags || []).forEach(tag => allTags.add(tag));
  });

  const tagsFilter = document.getElementById('tagsFilter');
  
  if (allTags.size === 0) {
    tagsFilter.style.display = 'none';
    return;
  }
  
  tagsFilter.style.display = 'flex';
  tagsFilter.innerHTML = '<div style="color: #6c757d; font-size: 13px; font-weight: 600;">Filter by tag:</div>';
  
  Array.from(allTags).sort().forEach(tag => {
    const tagEl = document.createElement('div');
    tagEl.className = 'tag-filter';
    tagEl.textContent = tag;
    tagEl.addEventListener('click', () => {
      if (selectedTag === tag) {
        selectedTag = null;
        tagEl.classList.remove('active');
      } else {
        document.querySelectorAll('.tag-filter').forEach(t => t.classList.remove('active'));
        selectedTag = tag;
        tagEl.classList.add('active');
      }
      applyFilters();
    });
    tagsFilter.appendChild(tagEl);
  });
}

// Apply filters
function applyFilters() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const filterMode = document.getElementById('filterMode').value;
  const sortBy = document.getElementById('sortBy').value;
  
  filteredClips = allClips.filter(clip => {
    // Search filter
    const matchesSearch = !searchTerm ||
      clip.title?.toLowerCase().includes(searchTerm) ||
      (clip.content?.type !== 'screenshot' && clip.content?.data?.toLowerCase().includes(searchTerm)) ||
      (clip.tags || []).some(tag => tag.toLowerCase().includes(searchTerm));
    
    // Mode filter
    const matchesMode = filterMode === 'all' || clip.mode === filterMode;
    
    // Tag filter
    const matchesTag = !selectedTag || (clip.tags || []).includes(selectedTag);
    
    return matchesSearch && matchesMode && matchesTag;
  });
  
  // Sort
  if (sortBy === 'newest') {
    filteredClips.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } else if (sortBy === 'oldest') {
    filteredClips.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  } else if (sortBy === 'title') {
    filteredClips.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
  }
  
  renderClips();
}

// Render clips
function renderClips() {
  const container = document.getElementById('clipsContainer');
  const emptyState = document.getElementById('emptyState');
  
  if (allClips.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }
  
  container.style.display = 'grid';
  emptyState.style.display = 'none';
  
  if (filteredClips.length === 0) {
    container.innerHTML = '<div class="loading">No clips match your filters</div>';
    return;
  }
  
  container.innerHTML = filteredClips.map(clip => createClipCard(clip)).join('');
  
  // Add click listeners
  document.querySelectorAll('.clip-card').forEach(card => {
    card.addEventListener('click', () => {
      const clipId = card.dataset.clipId;
      const clip = allClips.find(c => String(c.id) === clipId);
      if (!clip) return;
      showClipModal(clip);
    });
  });
}

// Create clip card HTML
function createClipCard(clip) {
  const date = new Date(clip.timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  
  let preview = '';
  if (clip.content?.type === 'screenshot') {
    const src = clip.content?.data ?? '';
    const img = document.createElement('img');
    img.src = /^data:image\/(png|jpeg|gif|webp);base64,/.test(src) ? src : '';
    img.alt = 'Screenshot';
    preview = img.outerHTML;
  } else {
    const text = clip.content?.data?.substring(0, 150) ?? '';
    preview = escapeHtml(text) + ((clip.content?.data?.length ?? 0) > 150 ? '...' : '');
  }

  const tagsHtml = (clip.tags || []).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  
  const author = clip.metadata?.author
    ? `<span class="clip-author">${escapeHtml(clip.metadata.author)}</span>` : '';
  const siteName = clip.metadata?.og_site_name
    ? `<span class="clip-site">${escapeHtml(clip.metadata.og_site_name)}</span>` : '';
  const readingTime = clip.metadata?.reading_time_minutes
    ? `<span class="clip-reading-time">${clip.metadata.reading_time_minutes} min read</span>` : '';

  return `
    <div class="clip-card" data-clip-id="${escapeHtml(clip.id)}">
      <div class="clip-header">
        <div class="clip-title">${escapeHtml(clip.title)}</div>
        <div class="clip-url">${escapeHtml(clip.url)}</div>
        ${author || siteName ? `<div class="clip-byline">${author}${author && siteName ? ' · ' : ''}${siteName}</div>` : ''}
      </div>
      <div class="clip-body">
        <div class="clip-preview">${preview}</div>
        ${tagsHtml ? `<div class="clip-tags">${tagsHtml}</div>` : ''}
      </div>
      <div class="clip-footer">
        <span class="clip-date">${date}</span>
        ${readingTime}
        <span class="clip-type">${escapeHtml(clip.mode)}</span>
      </div>
    </div>
  `;
}

// Show clip modal
function showClipModal(clip) {
  const modal = document.getElementById('clipModal');
  
  document.getElementById('modalTitle').textContent = clip.title;
  const urlEl = document.getElementById('modalUrl');
  try {
    const parsed = new URL(clip.url ?? '');
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      urlEl.href = clip.url;
    } else {
      urlEl.removeAttribute('href');
    }
  } catch {
    urlEl.removeAttribute('href');
  }
  urlEl.textContent = clip.url ?? '';
  
  const date = new Date(clip.timestamp).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
  document.getElementById('modalDate').textContent = date;
  document.getElementById('modalType').textContent = clip.mode;

  // Rich metadata (CAP-ENH-1a)
  const metaEl = document.getElementById('modalMetaContainer');
  if (metaEl) {
    const parts = [];
    if (clip.metadata?.author) parts.push(`By ${clip.metadata.author}`);
    if (clip.metadata?.og_site_name) parts.push(clip.metadata.og_site_name);
    if (clip.metadata?.published_at) {
      try {
        const pub = new Date(clip.metadata.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        parts.push(`Published ${pub}`);
      } catch { /* ignore invalid date */ }
    }
    if (clip.metadata?.reading_time_minutes) parts.push(`${clip.metadata.reading_time_minutes} min read`);
    if (parts.length > 0) {
      metaEl.style.display = 'block';
      metaEl.textContent = parts.join(' · ');
    } else {
      metaEl.style.display = 'none';
    }
  }

  // Tags
  if ((clip.tags || []).length > 0) {
    document.getElementById('modalTagsContainer').style.display = 'block';
    document.getElementById('modalTags').textContent = (clip.tags || []).join(', ');
  } else {
    document.getElementById('modalTagsContainer').style.display = 'none';
  }
  
  // Notes
  if (clip.notes) {
    document.getElementById('modalNotesContainer').style.display = 'block';
    document.getElementById('modalNotes').textContent = clip.notes;
  } else {
    document.getElementById('modalNotesContainer').style.display = 'none';
  }
  
  // Content
  const contentArea = document.getElementById('modalContent');
  if (clip.content?.type === 'screenshot') {
    contentArea.textContent = '';
    const src = clip.content?.data ?? '';
    const img = document.createElement('img');
    img.src = /^data:image\/(png|jpeg|gif|webp);base64,/.test(src) ? src : '';
    img.alt = 'Screenshot';
    contentArea.appendChild(img);
  } else if (clip.content?.html) {
    if (typeof DOMPurify !== 'undefined') {
      contentArea.innerHTML = DOMPurify.sanitize(clip.content.html, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math'],
        ALLOW_DATA_ATTR: false,
        ALLOW_UNKNOWN_PROTOCOLS: false
      });
    } else {
      contentArea.textContent = '[Content sanitizer unavailable — reload the page]';
    }
  } else {
    contentArea.textContent = clip.content?.data ?? '';
  }
  
  modal.classList.add('show');
  
  // Set up delete button
  document.getElementById('deleteClipBtn').onclick = async () => {
    if (confirm('Are you sure you want to delete this clip?')) {
      await deleteClip(clip.id);
      modal.classList.remove('show');
      await loadClips();
      updateStats();
      renderTagsFilter();
      renderClips();
    }
  };
  
  // Set up export button
  document.getElementById('exportClipBtn').onclick = () => {
    exportSingleClip(clip);
  };
}

// Delete clip
async function deleteClip(clipId) {
  const { clips = [] } = await chrome.storage.local.get(['clips']);
  const updatedClips = clips.filter(c => c.id !== clipId);
  await chrome.storage.local.set({ clips: updatedClips });
}

// Export single clip
function exportSingleClip(clip) {
  const dataStr = JSON.stringify(clip, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clip-${clip.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Export all clips
async function exportAllClips() {
  const { clips = [] } = await chrome.storage.local.get(['clips']);
  const dataStr = JSON.stringify(clips, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `smart-memory-clips-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Setup event listeners
function setupEventListeners() {
  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('filterMode').addEventListener('change', applyFilters);
  document.getElementById('sortBy').addEventListener('change', applyFilters);
  
  document.getElementById('exportBtn').addEventListener('click', exportAllClips);
  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('clipModal').classList.remove('show');
  });
  
  // Close modal on background click
  document.getElementById('clipModal').addEventListener('click', (e) => {
    if (e.target.id === 'clipModal') {
      document.getElementById('clipModal').classList.remove('show');
    }
  });
}

// Utility function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize on load
init();
