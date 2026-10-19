// DEPS-SEC-CAPTURE-1: every @capacitor/* dependency declared in package.json must have a
// range floor at or above the version that clears its known advisories (or its peer minimum).
// One row per package; add a row when a new @capacitor/* package is declared (the last test fails otherwise).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const declared = { ...pkg.dependencies, ...pkg.devDependencies };

// package | minimum floor | why
const FLOORS = [
  ['@capacitor/android', '6.2.2', 'GHSA-rvm3-566m-v7fv (internal HTTP proxy loads remote content at the app origin), fixed in 6.2.2'],
  ['@capacitor/core', '6.2.0', 'peer minimum of @capacitor/android 6.2.2 (^6.2.0)'],
  ['@capacitor/cli', '6.1.0', 'no advisory against 6.2.1; floor unchanged'],
  ['@capacitor/app', '6.0.0', 'no advisory against 6.0.3; floor unchanged'],
  ['@capacitor/preferences', '6.0.0', 'no advisory against 6.0.4; floor unchanged'],
];

const parse = (v) => v.replace(/^[\^~>=\s]+/, '').split('.').map(Number);
const gte = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return true;
};

for (const [name, min, why] of FLOORS) {
  test(`${name} range floor >= ${min} (${why})`, () => {
    assert.ok(declared[name], `${name} is not declared in package.json`);
    assert.ok(gte(declared[name], min), `${name} declared as ${declared[name]}, floor must be >= ${min}`);
  });
}

test('every declared @capacitor/* package has a row in FLOORS', () => {
  const rows = new Set(FLOORS.map(([n]) => n));
  const missing = Object.keys(declared).filter((n) => n.startsWith('@capacitor/') && !rows.has(n));
  assert.deepEqual(missing, [], `add a FLOORS row for: ${missing.join(', ')}`);
});

// The lockfile is untracked (mobile-android/.gitignore), so this row only runs where one exists.
const lockUrl = new URL('../package-lock.json', import.meta.url);
test('local lockfile resolves @capacitor/android >= 6.2.2', (t) => {
  if (!existsSync(lockUrl)) {
    console.warn('WARNING: mobile-android/package-lock.json absent (untracked); resolved-version row skipped');
    t.skip('no lockfile');
    return;
  }
  const lock = JSON.parse(readFileSync(lockUrl, 'utf8'));
  const v = lock.packages['node_modules/@capacitor/android'].version;
  assert.ok(gte(v, '6.2.2'), `lockfile resolves @capacitor/android ${v}`);
});
