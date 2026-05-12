#!/usr/bin/env node
// Minimal "build": copy src/* → dist/ and rewrite the bare-module
// imports in main.js to relative paths the Capacitor webview can load.
//
// Capacitor bundles JS via webview, not via a Node bundler, so we either
// need a real bundler (esbuild/vite) or to import the Capacitor runtime
// from its UMD build. Phase 1 keeps this hand-rolled to avoid pulling
// in a bundler before we know we need one.
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'src');
const dist = resolve(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(src, dist, { recursive: true });

// Rewrite bare imports to the Capacitor UMD bundles that ship in
// node_modules/@capacitor/*/dist/. After `cap sync android`, these
// are copied into android/app/src/main/assets/public/ — Capacitor
// also injects native-bridge globals there at runtime.
const mainPath = resolve(dist, 'main.js');
let main = await readFile(mainPath, 'utf8');
main = main
  .replace("from '@capacitor/preferences'", "from './capacitor/preferences.js'")
  .replace("from '@capacitor/app'", "from './capacitor/app.js'")
  .replace("from '@capacitor/core'", "from './capacitor/core.js'");
await writeFile(mainPath, main);

// Stage Capacitor plugin ESM entries into dist/capacitor/.
// `cap sync android` later picks them up from dist/ and copies the
// whole tree into android/app/src/main/assets/public/.
const capDir = resolve(dist, 'capacitor');
await mkdir(capDir, { recursive: true });
const plugins = [
  ['@capacitor/core', 'core.js'],
  ['@capacitor/app', 'app.js'],
  ['@capacitor/preferences', 'preferences.js'],
];
for (const [pkg, outName] of plugins) {
  const candidates = [
    resolve(root, 'node_modules', pkg, 'dist/esm/index.js'),
    resolve(root, 'node_modules', pkg, 'dist/index.js'),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    console.warn(`[build] missing plugin ESM for ${pkg} — run npm install first`);
    continue;
  }
  await cp(found, resolve(capDir, outName));
}

console.log(`[build] dist ready at ${dist}`);
