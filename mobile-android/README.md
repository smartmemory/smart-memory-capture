# SmartMemory Android Share Target (PARKED)

> **Status (2026-05-12):** Parked. This Capacitor scaffold is the deferred sub-feature **DIST-SHARE-ANDROID-NATIVE-1**. The primary Android share-target approach pivoted to a **PWA + Web Share Target API** because Play Store policy 4.2 reliably rejects share-only apps. The native APK work below is preserved (and produces a verified 3.6 MB debug APK) for the day we have signal that mobile is a real distribution channel and `ACTION_PROCESS_TEXT` is worth pursuing.
>
> See:
> - [DIST-SHARE-ANDROID-1 design](../../smart-memory-docs/docs/features/DIST-SHARE-ANDROID-1/design.md) — current PWA-first plan
> - [DIST-SHARE-ANDROID-NATIVE-1 design](../../smart-memory-docs/docs/features/DIST-SHARE-ANDROID-NATIVE-1/design.md) — this parked work, un-park triggers
>
> **Un-park triggers:** ≥100 PWA installs + `ACTION_PROCESS_TEXT` demand, *or* a specific customer ask, *or* a decision to build a full Android companion app (capture + viewer + Maya).

---

Capacitor wrapper that registers SmartMemory as a system share target on Android. Tap **Share** in any app, pick **SmartMemory**, and the payload is POSTed to SmartMemory.

> **⚠️ Backend changed (2026-06-17):** this scaffold's code still posts to the old
> standalone `/api/clips` clip service, which has been **removed** (capture is now a thin
> ingestion surface — see the repo README). When un-parked, port the POST to SmartMemory's
> `/memory/ingest` using the same connection model as the browser extension (CAP-CONN-1:
> local lite daemon `http://127.0.0.1:9014` no-token, or cloud HTTPS + API token). The
> `main.js` retry queue and config UI carry over; only the request shape + endpoint change.

Feature: [DIST-SHARE-ANDROID-NATIVE-1](../../smart-memory-docs/docs/features/DIST-SHARE-ANDROID-NATIVE-1/design.md) (parked)

## What's in this directory

| Path | Purpose |
|---|---|
| `src/index.html`, `src/main.js`, `src/style.css` | Web entry — share form, settings, retry queue |
| `scripts/build.mjs` | Hand-rolled "build": copies `src/` → `dist/` and stages Capacitor plugin ESMs |
| `capacitor.config.ts` | Capacitor app id, name, web dir |
| `android-patches/ShareReceiverPlugin.kt` | Native Kotlin plugin (drop into generated `android/` after `cap add android`) |
| `android-patches/AndroidManifest.share-additions.xml` | Intent-filter snippets to merge into the generated manifest |
| `package.json` | Capacitor + plugin deps |

The generated `android/` directory (Gradle project, MainActivity, manifest, etc.) is **not checked in** — it's produced fresh by `npx cap add android` on each clone. Anything we want to keep lives in `android-patches/`.

## First-time setup

Requires: Node 20+, JDK 17, Android Studio (or `sdkmanager` + platform-tools), an Android device or emulator.

```bash
cd smart-memory-capture/mobile-android
npm install
npm run build
npx cap add android        # generates android/ from Capacitor templates
```

Then patch in the share-target pieces:

1. Copy `android-patches/ShareReceiverPlugin.kt` to `android/app/src/main/java/ai/smartmemory/capture/ShareReceiverPlugin.kt` (create the package directories if needed).
2. In `android/app/src/main/java/.../MainActivity.java` (or `.kt`), register the plugin in `onCreate`:
   ```java
   registerPlugin(ShareReceiverPlugin.class);
   ```
3. In `android/app/src/main/AndroidManifest.xml`, paste the three intent-filters from `android-patches/AndroidManifest.share-additions.xml` inside `<activity android:name=".MainActivity">`, as siblings to the existing launcher filter.

Then sync and run:

```bash
npm run sync               # build + cap sync android
npm run android:run        # build and install on device/emulator
# or
npm run android:apk        # build a debug APK at android/app/build/outputs/apk/debug/
```

## Verifying the share flow

On a device with the app installed:

1. Open Chrome, navigate to any article.
2. Tap the share icon → **SmartMemory** appears in the share sheet.
3. Tap it. App opens with the URL pre-filled.
4. Tap **Save**. The clip POSTs to your configured `/api/clips` endpoint.

Other entry points to verify:

- **Twitter/X / Reddit / YouTube** Share → SmartMemory (URL share)
- **Photos** Share → SmartMemory (image share, capture_mode=screenshot)
- **Long-press text on any page** → Select **SmartMemory** in the text-selection menu (PROCESS_TEXT intent)
- **Notes / Mail** Share text → SmartMemory (text share)

## Configuration

The first launch (no payload) shows the empty state. Tap **Settings** to set:

- **API endpoint** — e.g. `https://capture.smartmemory.ai`
- **Device token** — bearer token from the pairing flow (DIST-OBSIDIAN-1 shares the same endpoint)

Stored via Capacitor `Preferences` (Android `EncryptedSharedPreferences` under the hood when the secure-storage plugin is added in Phase 2 of the plan).

## Failure handling

Every `/api/clips` POST that fails (network, 5xx, missing config) is appended to a local retry queue stored in `Preferences`. The queue drains on next app launch (`drainRetryQueue()` in `main.js`). Per `.claude/rules/no-silent-degradation.md`, failures `console.warn` with queue size — they are never silently dropped.

## What's intentionally left out

- **No bundler.** `scripts/build.mjs` is ~30 lines of `cp` + import-rewriting. If we outgrow it (e.g. need TS, JSX, code-splitting), swap in Vite — but only when the pain is concrete.
- **No React.** The share form is ~10 fields; vanilla JS is shorter than the React boilerplate would be.
- **No library / search UI.** Capture-only by design (per DIST-SHARE-ANDROID-1 scope). Browse on the web.
- **No automated pairing flow yet.** Phase 2 of the plan wires `ASWebAuthenticationSession`-equivalent (`Custom Tabs` + deep-link) into Settings. For now, paste the token manually.
- **No offline-first sync queue beyond the simple retry buffer.** WorkManager-based queue is a follow-up (filed in plan as out-of-scope for v1).

## Plan + status

See [DIST-SHARE-ANDROID-1/plan.md](../../smart-memory-docs/docs/features/DIST-SHARE-ANDROID-1/plan.md).

Phase 1 (Capacitor scaffold) — **this directory.** Once `cap add android` runs cleanly and the app launches, Phase 1 is done.
