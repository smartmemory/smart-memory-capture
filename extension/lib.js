// Shared helpers for Smart Memory Capture (CAP-CONN-1).
// Loaded by both the service worker (via importScripts) and the options page
// (via <script src>), so it must stay framework-free and side-effect-free.
//
// Connection model:
//   • LITE target    — a loopback endpoint (127.0.0.1 / localhost): the local
//                      SmartMemory daemon (DIST-DAEMON-1, default port 9014).
//                      OS-authenticated, so the daemon ships keyless → API token OPTIONAL.
//   • SERVICE target — any remote host (hosted or self-hosted service).
//                      Crosses the network → API token REQUIRED.

// Default port the lite daemon binds (smart-memory/smartmemory_app/config.py:
// daemon_port = 9014). Probe 127.0.0.1 (not "localhost") to match the daemon's
// bind exactly and avoid the localhost→::1 (IPv6) resolution footgun.
const SM_DEFAULT_DAEMON_PORT = 9014;
const SM_DAEMON_HOST = '127.0.0.1';

// Origin tag for browser captures — origin_policy tier-1 (user content, search-visible).
// MUST stay under the `capture:` prefix: that is the namespace registered in core's
// origin_policy._TIER_PREFIXES (sibling: mobile's `capture:android`). The previous value
// `browser:save` was unregistered and fell through to tier 4 — every clip synced to the
// service was silently hidden from BOTH search and recall (found live 2026-07-10, spike 0.6).
const SM_CAPTURE_ORIGIN = 'capture:extension';

function smIsLoopbackHost(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

// Classify a configured endpoint: 'lite' | 'service' | 'invalid'.
function smClassifyTarget(endpoint) {
  if (!endpoint) return 'invalid';
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    return 'invalid';
  }
  return smIsLoopbackHost(parsed.hostname) ? 'lite' : 'service';
}

// Is an API token required to sync here? Only for remote (service) targets —
// loopback is OS-authenticated, so the lite daemon needs no token.
function smTokenRequired(endpoint) {
  return smClassifyTarget(endpoint) === 'service';
}

// Build a host-permission match pattern for an endpoint. Match patterns CANNOT
// include a port, so an endpoint like http://127.0.0.1:9014 must request
// http://127.0.0.1/* (matches all ports) — using `.origin + '/*'` would yield an
// invalid pattern for any non-default port and break the permission check.
function smOriginPattern(endpoint) {
  const u = new URL(endpoint);
  return `${u.protocol}//${u.hostname}/*`;
}

// Build the POST /memory/ingest body for a captured clip (carries the clip's
// `idempotency_key` so a retry is the same save, not a second one). Cross-compatible with
// BOTH ingest contracts, which diverge on where metadata lives:
//   • Service (IngestRequest: content + context) reads metadata from `context`
//     (passed to the pipeline as raw_metadata) and origin from `context.origin`.
//   • Lite daemon (local_api IngestRequest) reads origin from `context.origin` but
//     metadata from `properties` (flattened onto the stored node); other `context`
//     keys are ignored.
// Each side ignores the fields it doesn't use, so we send `origin` in `context` and
// MIRROR scalar metadata into both `context` and `properties`. `properties` values
// are stringified (it becomes node properties); `tags` is an array in `context` and
// a joined string in `properties`. Never include raw HTML.
function smBuildIngestPayload(clip) {
  const meta = (clip && clip.metadata) || {};
  const content = (clip && clip.content && clip.content.data) || '';
  const tags = Array.isArray(clip.tags) ? clip.tags : [];

  // Scalar provenance shared by both metadata sinks.
  const scalar = {
    source_url: clip.url,
    title: clip.title,
    capture_mode: clip.mode,
    captured_at: clip.timestamp,
    ...(meta.author && { author: meta.author }),
    ...(meta.published_at && { published_at: meta.published_at }),
    ...(meta.og_site_name && { site_name: meta.og_site_name }),
    ...(meta.og_type && { content_type: meta.og_type }),
    ...(meta.og_description && { description: meta.og_description }),
    ...(meta.word_count && { word_count: meta.word_count }),
    ...(meta.reading_time_minutes && { reading_time_minutes: meta.reading_time_minutes }),
    ...(meta.schema_type && { schema_type: meta.schema_type }),
    ...(clip.content && clip.content.heroImage && { hero_image: clip.content.heroImage }),
    ...(meta.video_id && { video_id: meta.video_id }),
    ...(meta.duration_seconds && { duration_seconds: meta.duration_seconds }),
    ...(clip.notes && { notes: clip.notes }),
  };

  // Lite `properties` sink — node properties, so stringify every value. Tags use a
  // namespaced key: a bare `tags` property collides with MemoryItem's first-class
  // `tags` field (defaults to []) and gets clobbered to "[]" (verified via E2E).
  const properties = {};
  for (const [k, v] of Object.entries(scalar)) properties[k] = String(v);
  if (tags.length) properties.capture_tags = tags.join(', ');

  return {
    content,
    context: {
      origin: SM_CAPTURE_ORIGIN,
      source_path: clip.url,
      ...scalar,
      tags,
      readability_extracted: (clip.content && clip.content.readability) || false,
      ...(clip.content && clip.content.hasTranscript !== undefined && { has_transcript: clip.content.hasTranscript }),
    },
    properties,
    ...(clip.idempotency_key && { idempotency_key: clip.idempotency_key }),
  };
}

// ---- Save receipt (SM2-SAVE-1 save-receipt-contract.json, schema_version 1.x) ----
// POST /memory/ingest answers 202 with a receipt, not a bare {id}. The handle
// (run_id + status_url) is what lets the library re-open a clip's status later.

// One key per clip, minted before the first POST and reused on every retry.
// Shape: `sm2_` + lowercase UUID v4 (within the server's 1-128 char key charset).
function smMintIdempotencyKey() {
  return 'sm2_' + crypto.randomUUID().toLowerCase();
}

const SM_RECEIPT_STAGES = ['received', 'stored', 'extracted'];
const SM_RECEIPT_EXECUTION = ['queued', 'waiting', 'running', 'paused', 'completed', 'failed', 'dead'];

// A refusal keeps the handle so the clip can still be re-opened; it is never success.
class SmReceiptError extends Error {
  constructor(code, message, handle) {
    super(`${code}: ${message}`);
    this.name = 'SmReceiptError';
    this.code = code;
    this.handle = handle || null;
  }
}

// The persistable handle of a receipt (what the clip stores).
function smReceiptHandle(wire) {
  if (!wire || typeof wire !== 'object' || !wire.run_id) return null;
  return {
    run_id: wire.run_id,
    status_url: wire.status_url || null,
    item_id: (wire.subject && wire.subject.item_id) || null,
    processing_stage: wire.processing_stage || null,
    execution_state: wire.execution_state || null,
    status_version: wire.status_version ?? null,
    schema_version: wire.schema_version || null,
  };
}

// Decode a response body. Returns {kind:'receipt', receipt} for a 1.x save receipt,
// {kind:'legacy', item_id} for a pre-receipt `{id}`/`{item_id}` body (lite daemon),
// and throws SmReceiptError for everything else (admission error, unknown major,
// unknown subject/state, unreadable body).
function smDecodeReceipt(wire) {
  if (!wire || typeof wire !== 'object') {
    throw new SmReceiptError('unreadable', 'response body is not a JSON object');
  }
  const handle = smReceiptHandle(wire);
  if (wire.admission_error) {
    const e = wire.admission_error;
    throw new SmReceiptError('admission_error', `${e.code}: ${e.message}`, handle);
  }
  if (wire.schema_version === undefined) {
    const id = wire.item_id || wire.id;
    if (typeof id === 'string' && id) return { kind: 'legacy', item_id: id };
    throw new SmReceiptError('unreadable', 'response has neither a receipt nor an item id', handle);
  }
  if (!/^1\.\d+$/.test(String(wire.schema_version))) {
    throw new SmReceiptError('unsupported_version', `schema_version ${JSON.stringify(wire.schema_version)}`, handle);
  }
  const kind = wire.subject && wire.subject.kind;
  if (kind !== 'item_save' && kind !== 'edit') {
    throw new SmReceiptError('unsupported_subject', `subject.kind ${JSON.stringify(kind)}`, handle);
  }
  if (!SM_RECEIPT_STAGES.includes(wire.processing_stage) || !SM_RECEIPT_EXECUTION.includes(wire.execution_state)) {
    throw new SmReceiptError(
      'unsupported_state',
      `processing_stage=${JSON.stringify(wire.processing_stage)}, execution_state=${JSON.stringify(wire.execution_state)}`,
      handle,
    );
  }
  if (!handle) throw new SmReceiptError('unreadable', 'receipt has no run_id');
  return { kind: 'receipt', receipt: wire };
}

// Retry policy (SM2-SAVE-1 spec: at most 4 attempts, transport loss and
// 408/429/500/502/503/504 only, full jitter 0-200/400/800 ms, same key + payload).
const SM_RETRY_STATUS = [408, 429, 500, 502, 503, 504];
const SM_RETRY_JITTER_MAX_MS = [200, 400, 800];

// POST with the receipt retry policy. Returns the final Response (ok or not);
// throws the last transport error when every attempt was lost.
async function smPostWithRetry(fetchFn, url, init, opts = {}) {
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const random = opts.random || Math.random;
  const warn = opts.warn || ((m) => console.warn(m));
  const attempts = SM_RETRY_JITTER_MAX_MS.length + 1;
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    let response = null;
    try {
      response = await fetchFn(url, init);
    } catch (e) {
      lastError = e;
    }
    if (response && !SM_RETRY_STATUS.includes(response.status)) return response;
    if (i === attempts - 1) {
      if (response) return response;
      warn(`SmartMemory Capture: save lost after ${attempts} attempts (${lastError && lastError.message}); the clip was NOT saved`);
      throw lastError;
    }
    const why = response ? `HTTP ${response.status}` : `transport error ${lastError && lastError.message}`;
    warn(`SmartMemory Capture: save attempt ${i + 1} failed (${why}); retrying with the same idempotency key`);
    await sleep(Math.floor(random() * SM_RETRY_JITTER_MAX_MS[i]));
  }
  throw lastError;
}
