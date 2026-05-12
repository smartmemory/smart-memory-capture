import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';

const ShareReceiver = registerPlugin('ShareReceiver');

const PREF_KEY_API = 'sm:apiUrl';
const PREF_KEY_TOKEN = 'sm:apiToken';
const PREF_KEY_QUEUE = 'sm:retryQueue';

const $ = (id) => document.getElementById(id);

const els = {
  share: $('share-form'),
  settings: $('settings-form'),
  empty: $('empty-state'),
  meta: $('meta'),
  title: $('title'),
  url: $('url'),
  content: $('content'),
  tags: $('tags'),
  notes: $('notes'),
  status: $('status'),
  apiUrl: $('api-url'),
  apiToken: $('api-token'),
};

const URL_RE = /\bhttps?:\/\/\S+/i;

async function getConfig() {
  const [apiUrl, token] = await Promise.all([
    Preferences.get({ key: PREF_KEY_API }),
    Preferences.get({ key: PREF_KEY_TOKEN }),
  ]);
  return { apiUrl: apiUrl.value || '', token: token.value || '' };
}

async function saveConfig(apiUrl, token) {
  await Preferences.set({ key: PREF_KEY_API, value: apiUrl });
  await Preferences.set({ key: PREF_KEY_TOKEN, value: token });
}

function showSection(name) {
  els.share.hidden = name !== 'share';
  els.settings.hidden = name !== 'settings';
  els.empty.hidden = name !== 'empty';
}

function setStatus(message, kind) {
  els.status.textContent = message;
  els.status.className = `status${kind ? ' ' + kind : ''}`;
}

function buildClipFromIntent(payload) {
  const clip = {
    title: payload.subject || '',
    url: '',
    content: '',
    tags: [],
    notes: '',
    capture_mode: 'selection',
    origin: 'capture:android',
  };

  if (payload.text) {
    const match = payload.text.match(URL_RE);
    if (match && match[0].length === payload.text.trim().length) {
      clip.url = match[0];
      clip.capture_mode = 'article';
    } else if (match) {
      clip.url = match[0];
      clip.content = payload.text;
      clip.capture_mode = 'selection';
    } else {
      clip.content = payload.text;
      clip.capture_mode = 'selection';
    }
  }

  if (payload.imageDataUrl) {
    clip.screenshot_data = payload.imageDataUrl;
    clip.capture_mode = 'screenshot';
  }

  return clip;
}

function fillForm(clip) {
  els.title.value = clip.title || '';
  els.url.value = clip.url || '';
  els.content.value = clip.content || '';
  els.tags.value = (clip.tags || []).join(', ');
  els.notes.value = clip.notes || '';
  const metaParts = [];
  if (clip.capture_mode) metaParts.push(`mode: ${clip.capture_mode}`);
  if (clip.screenshot_data) metaParts.push('image attached');
  els.meta.textContent = metaParts.join(' · ');
}

function readForm() {
  return {
    title: els.title.value.trim(),
    url: els.url.value.trim(),
    content: els.content.value.trim(),
    tags: els.tags.value.split(',').map((t) => t.trim()).filter(Boolean),
    notes: els.notes.value.trim(),
  };
}

async function postClip(clip) {
  const { apiUrl, token } = await getConfig();
  if (!apiUrl || !token) {
    throw new Error('API not configured. Open Settings to pair the device.');
  }
  const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/clips`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(clip),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST /api/clips → ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function enqueueRetry(clip) {
  const existing = await Preferences.get({ key: PREF_KEY_QUEUE });
  const queue = existing.value ? JSON.parse(existing.value) : [];
  queue.push({ clip, ts: Date.now() });
  await Preferences.set({ key: PREF_KEY_QUEUE, value: JSON.stringify(queue) });
  console.warn('[smartmemory] enqueued failed clip for retry', { size: queue.length });
}

async function drainRetryQueue() {
  const existing = await Preferences.get({ key: PREF_KEY_QUEUE });
  if (!existing.value) return;
  const queue = JSON.parse(existing.value);
  const remaining = [];
  for (const entry of queue) {
    try {
      await postClip(entry.clip);
    } catch {
      remaining.push(entry);
    }
  }
  await Preferences.set({ key: PREF_KEY_QUEUE, value: JSON.stringify(remaining) });
  if (queue.length !== remaining.length) {
    console.info('[smartmemory] drained retry queue', { sent: queue.length - remaining.length, left: remaining.length });
  }
}

async function handleSave() {
  const merged = { ...currentClip, ...readForm() };
  if (!merged.url && !merged.content && !merged.screenshot_data) {
    setStatus('Need a URL, text, or image to save.', 'error');
    return;
  }
  setStatus('Saving…');
  try {
    await postClip(merged);
    setStatus('Saved.', 'success');
    setTimeout(() => App.exitApp(), 600);
  } catch (err) {
    await enqueueRetry(merged);
    setStatus(`Queued for retry: ${err.message}`, 'error');
  }
}

async function handleSettingsSave() {
  const apiUrl = els.apiUrl.value.trim();
  const token = els.apiToken.value.trim();
  await saveConfig(apiUrl, token);
  setStatus('Settings saved.', 'success');
  showSection(currentClip ? 'share' : 'empty');
}

async function loadSettings() {
  const { apiUrl, token } = await getConfig();
  els.apiUrl.value = apiUrl;
  els.apiToken.value = token;
}

let currentClip = null;

async function bootstrap() {
  await drainRetryQueue();

  let payload = null;
  try {
    const result = await ShareReceiver.getSharedPayload();
    if (result && (result.text || result.imageDataUrl)) payload = result;
  } catch (err) {
    console.warn('[smartmemory] no native share payload', err);
  }

  if (payload) {
    currentClip = buildClipFromIntent(payload);
    fillForm(currentClip);
    showSection('share');
  } else {
    showSection('empty');
  }

  await loadSettings();
}

document.addEventListener('DOMContentLoaded', () => {
  $('save-btn').addEventListener('click', handleSave);
  $('cancel-btn').addEventListener('click', () => App.exitApp());
  $('settings-btn').addEventListener('click', () => showSection('settings'));
  $('settings-cancel').addEventListener('click', () => showSection(currentClip ? 'share' : 'empty'));
  $('settings-save').addEventListener('click', handleSettingsSave);
  $('empty-settings-btn').addEventListener('click', () => showSection('settings'));

  bootstrap();
});
