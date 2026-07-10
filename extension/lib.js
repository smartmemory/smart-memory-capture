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

// Build the POST /memory/ingest body for a captured clip. Cross-compatible with
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
  };
}
