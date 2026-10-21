# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Test (security, DEPS-SEC-FLOOR-GUARD-CLASS-1): `mobile-android/test/capacitor-floors.test.mjs` judges a declared range by the lowest version it admits, ordered by full semver precedence (a prerelease sorts below its release), instead of the first numeric triple after stripping the operator. `<6.4.3`, `<=6.4.3`, `^4.1.11-rc.0` and `^4.1.12 || 4.0.18` now fail a stable floor, range syntax the check cannot model fails closed, and installed versions use the same ordering. One row table covers the repros and each grammar form.
- CAPTURE-EXT-BRAND-FU-1 and FU-2: extension v1.3.1, contrast in every button state and a palette taken from the
  design system token file. Primary hover no longer lightens to blue-500 (3.68:1 with white text) and keeps blue-600
  with the token glow. Danger buttons use the destructive token with dark text. Disabled buttons use a muted surface
  instead of 45 to 50 percent opacity. Light-mode status text is gray-900 on a tinted token background. Colors that
  were not in `colors_and_type.css` are remapped to tokens. New `extension/scripts/check_contrast.py` (stdlib only)
  computes the WCAG ratio for every text and background state pair in dark and light and checks every color against
  the token file. No change to capture logic, storage keys, permissions or element ids.
- CAPTURE-EXT-BRAND-1: extension v1.3.0, SmartMemory branding and design. Renamed "Smart Memory Capture" to
  **SmartMemory Capture** (manifest name, toolbar title, popup, settings, library, context menu, notifications).
  New icons (16/32/48/128) rendered from the shipped logo by `extension/generate_icons.py`, and the old emoji
  generator `create-icons.html` is removed. Popup, settings, library and the in-page capture sheet are restyled with
  the design system tokens (`extension/brand.css`), dark by default with a light theme, the logo and wordmark in each
  header, and stroke icons instead of emoji. New manifest description. No change to capture logic, message passing,
  storage keys or defaults, permissions or host permissions.

- DEPS-SEC-CAPTURE-1 — `mobile-android`: `@capacitor/android` floor `^6.1.0` -> `^6.2.2` (clears GHSA-rvm3-566m-v7fv, internal HTTP proxy could load remote content at the app origin) and `@capacitor/core` floor -> `^6.2.0` (peer minimum of android 6.2.2). New `npm test` (`mobile-android/test/capacitor-floors.test.mjs`) pins every `@capacitor/*` floor. The lockfile is untracked: run `npm install` in `mobile-android/` to refresh it.
- Repo references renamed `smartmemory-*` -> `smart-memory-*` in docs, scripts and config (INFRA-REPO-RENAME-1).

### Fixed
- CAP-WORKSPACE-1 — cloud sync actually reaches the service (v1.2.2, found live 2026-07-10
  by DEMO-WALKTHROUGH-4 spike 0.6):
  - **`X-Workspace-Id` header.** The service scopes every write to a workspace and rejects
    `POST /memory/ingest` without `X-Workspace-Id` (the API key alone carries no team
    context — `service_common/auth/scope.py` `team_required` policy). The extension never
    sent it, so every cloud sync failed with HTTP 400. New **Workspace ID** setting
    (options page, `chrome.storage.sync` — it is an identifier, not a secret); sent whenever
    configured; required (fail-fast, mirroring the token rule) for non-loopback targets.
  - **Origin tier.** Captures were stamped `origin: "browser:save"`, which is not a
    registered prefix in core's `origin_policy._TIER_PREFIXES` — clips that DID land fell
    through to tier 4 and were invisible to BOTH search and recall. Now stamped
    `capture:extension`, the registered tier-1 namespace (sibling of `capture:android`).
  - README/QUICKSTART cloud-sync docs now list the Workspace ID requirement.

### Added
- CAP-CONN-1 — lite/service connection model (v1.2.1):
  - **Local SmartMemory detection.** "Detect local SmartMemory" probes the lite daemon
    (`GET http://127.0.0.1:9014/health`, `service=="smartmemory"` identity check) from the
    service worker; absence is reported with guidance (start `smartmemory server`, or use Cloud).
    When detected and no endpoint is configured, the local daemon is auto-set as the capture target.
  - **API token required for cloud (service) sync, optional for local (lite).** Enforced at
    settings entry (warning) and hard-blocked before send in `background.js` — auth keys off the
    endpoint's trust boundary (loopback = OS-authenticated, remote = network).
  - Added `lib.js` (shared classification helpers) loaded by the worker and the options page.
- CAP-ENH-1 hardening batch (1a/1c/1d/1f/1g/1h)
- Readability.js extraction + page metadata (CAP-ENH-1a/1f)
- Duplicate URL detection with `duplicatePolicy` config option (CAP-ENH-1c)
- YouTube transcript extraction (CAP-ENH-1d)
- Hero image inlining + selection-first capture sheet (CAP-ENH-1g/1h)
- Code page detection and extraction (CAP-ENH-1e)
- Compact layout, dark mode, design system tokens (v1.1.0)
- Generated icons committed so install works without manual generation

### Fixed
- CAP-CONN-1 — ingest payload now matches the real `/memory/ingest` contract (`IngestRequest`):
  all provenance moved into `context` (top-level `memory_type`/`metadata` were silently dropped),
  `context.origin = "browser:save"` (origin_policy tier-1) + `source_path` enable URL dedupe
  (CORE-INGEST-DEDUPE-1). Host-permission match patterns now strip the port
  (`http://127.0.0.1:9014` → `http://127.0.0.1/*`) so localhost sync passes the permission check.
  CSP `connect-src` allows `http://127.0.0.1:*`.
- CAP-CONN-1 (E2E-caught) — payload is cross-compatible with BOTH ingest contracts: metadata is
  mirrored into `context` (service reads it there) and `properties` (the lite daemon reads it
  there); `tags` is namespaced to `capture_tags` so it doesn't clobber MemoryItem's first-class
  `tags` field; the `detectLite` worker-message guard keys off the sender URL (`chrome-extension://`)
  instead of `sender.tab`, so options-page messages (which run in a tab) aren't rejected. Verified
  end-to-end against a live lite daemon (origin + metadata persist) and in Chrome via Playwright
  (worker daemon-reach through CSP + options↔worker message round-trip).
- CAP-SEC-1 — harden extension against XSS, auth, and injection vulnerabilities
- Re-capture prompt on updated page (CAP-ENH-1c)
- Remove spurious `return true` from message listener (async channel-closed warning)

### Changed
- Docs aligned to the thin-ingestion-surface design: `README.md` rewritten (capture posts to
  SmartMemory `/memory/ingest`; local-lite vs cloud-service connection model; no local DB/pipeline);
  `QUICKSTART.md` install path corrected to the `extension/` folder and a "Connect to SmartMemory"
  step added (local-detect / cloud-token).
- Bump to v0.4.0; standardize versioning to 0.3.9 baseline (then to 0.4.0)

### Removed
- Standalone clip stack — `service/` (Postgres clip DB + CRUD), `pipeline/` (a mock AI pipeline:
  zero-vector embeddings, hardcoded topics), and root `docker-compose.yml`. This was the rejected
  OneNote-clone architecture; capture is a thin ingestion surface and SmartMemory core is the only
  brain + store (it already runs the real pipeline, including in lite mode).
- Stale docs that documented that dead stack / superseded setup: `PROJECT-SUMMARY.md`,
  `STORAGE-MODES.md`, and `SETUP.md` (icon-generation, obsolete now that icons are committed).
