import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// Wire shapes follow smart-memory-docs docs/features/SM2-SAVE-1/save-receipt-contract.json.
const RECEIPT = {
  schema_version: '1.1',
  subject: { kind: 'item_save', item_id: 'mem_123' },
  run_id: 'run_1',
  status_url: '/memory/status/run_1',
  processing_stage: 'received',
  execution_state: 'queued',
  outcome: null,
  terminal: false,
  result_availability: 'pending',
  status_version: 1,
};

const CLIP = () => ({
  id: 'clip-1',
  title: 'T',
  url: 'https://example.com/a',
  mode: 'selection',
  content: { type: 'text', data: 'hello' },
  tags: [],
  timestamp: '2026-10-25T00:00:00Z',
  metadata: {},
});

const res = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k] ?? null },
  json: async () => {
    if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
    return body;
  },
});

/** Load lib.js + background.js into a vm with a fake chrome, fetch and timers. */
function load(responses, { stored = [] } = {}) {
  const calls = [];
  const warnings = [];
  const sleeps = [];
  const store = { clips: stored, syncApiToken: 't', syncEndpoint: 'https://api.example.com', syncWorkspaceId: 'w' };
  const queue = [...responses];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const next = queue.shift();
    if (!next) throw new Error('fake fetch exhausted');
    if (next instanceof Error) throw next;
    return next;
  };
  const noop = new Proxy(function () {}, { get: () => noop, apply: () => undefined });
  const chrome = new Proxy(
    {
      storage: {
        local: {
          get: async (keys) => Object.fromEntries(keys.map((k) => [k, store[k]]).filter(([, v]) => v !== undefined)),
          set: async (o) => Object.assign(store, o),
        },
        sync: { get: async (keys) => Object.fromEntries(keys.map((k) => [k, store[k]]).filter(([, v]) => v !== undefined)) },
      },
      permissions: { contains: async () => true },
    },
    { get: (t, k) => (k in t ? t[k] : noop) },
  );
  const sandbox = {
    chrome,
    fetch: fakeFetch,
    crypto: globalThis.crypto,
    URL,
    console: { log() {}, error() {}, warn: (m) => warnings.push(String(m)) },
    setTimeout: (fn, ms) => { sleeps.push(ms); fn(); return 0; },
    clearTimeout() {},
    AbortController,
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    importScripts: (f) => vm.runInContext(read(f), ctx, { filename: f }),
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(read('background.js') + '\n;globalThis.__sync = syncToServer;', ctx, { filename: 'background.js' });
  return { sync: ctx.__sync, calls, warnings, sleeps, store, ctx };
}

test('202 receipt: success carries the receipt and stores its handle on the clip', async () => {
  const t = load([res(202, RECEIPT)], { stored: [CLIP()] });
  const out = await t.sync(CLIP());
  assert.equal(out.success, true);
  assert.equal(out.receipt.run_id, 'run_1');
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].url, 'https://api.example.com/memory/ingest');
  assert.match(t.calls[0].body.idempotency_key, /^sm2_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const stored = t.store.clips[0];
  assert.equal(stored.receipt.run_id, 'run_1');
  assert.equal(stored.receipt.status_url, '/memory/status/run_1');
  assert.equal(stored.receipt.item_id, 'mem_123');
  assert.equal(stored.idempotency_key, t.calls[0].body.idempotency_key);
});

test('503 then 202: the second POST carries the same key and body', async () => {
  const t = load([res(503, {}), res(202, RECEIPT)]);
  const out = await t.sync(CLIP());
  assert.equal(out.success, true);
  assert.equal(t.calls.length, 2);
  assert.equal(t.calls[1].init.body, t.calls[0].init.body);
  assert.ok(t.calls[0].body.idempotency_key);
  assert.equal(t.warnings.filter((w) => /retrying with the same idempotency key/.test(w)).length, 1);
});

// One row per class member of the retry policy (spec.md:40).
const RETRY_ROWS = [
  { name: '400 is not retried', first: res(400, {}), calls: 1, ok: false },
  { name: '401 is not retried', first: res(401, {}), calls: 1, ok: false },
  { name: '409 is not retried', first: res(409, {}), calls: 1, ok: false },
  { name: '422 is not retried', first: res(422, {}), calls: 1, ok: false },
  { name: '429 is retried', first: res(429, {}), calls: 2, ok: true },
  { name: '504 is retried', first: res(504, {}), calls: 2, ok: true },
  { name: 'transport loss is retried', first: new TypeError('Failed to fetch'), calls: 2, ok: true },
];
for (const row of RETRY_ROWS) {
  test(`retry policy: ${row.name}`, async () => {
    const t = load([row.first, res(202, RECEIPT)]);
    const out = await t.sync(CLIP());
    assert.equal(t.calls.length, row.calls);
    assert.equal(out.success, row.ok);
  });
}

test('four 503s: stops after 4 attempts, jittered 0-200/400/800 ms, WARNING says the clip was not saved', async () => {
  const t = load([res(503, {}), res(503, {}), res(503, {}), res(503, {})]);
  const out = await t.sync(CLIP());
  assert.equal(out.success, false);
  assert.equal(out.error, 'HTTP 503');
  assert.equal(t.calls.length, 4);
  assert.deepEqual(t.sleeps, [100, 200, 400]); // random() = 0.5 against 200/400/800
});

test('four lost transports: typed failure and a WARNING naming what was lost', async () => {
  const e = () => new TypeError('Failed to fetch');
  const t = load([e(), e(), e(), e()]);
  const out = await t.sync(CLIP());
  assert.equal(out.success, false);
  assert.equal(t.calls.length, 4);
  assert.ok(t.warnings.some((w) => /NOT saved/.test(w)));
});

// Every refusal arm: success is false, the code is typed, the handle is kept where the body had one.
const REFUSALS = [
  { name: 'admission error', body: { schema_version: '1.1', run_id: 'run_1', status_url: '/memory/status/run_1', admission_error: { code: 'idempotency_conflict', message: 'conflict' } }, code: 'admission_error', handle: 'run_1' },
  { name: 'unsupported major', body: { ...RECEIPT, schema_version: '2.0' }, code: 'unsupported_version', handle: 'run_1' },
  { name: 'unknown subject kind', body: { ...RECEIPT, subject: { kind: 'future_job' } }, code: 'unsupported_subject', handle: 'run_1' },
  { name: 'unknown stage', body: { ...RECEIPT, processing_stage: 'future_stage' }, code: 'unsupported_state', handle: 'run_1' },
  { name: 'unknown execution state', body: { ...RECEIPT, execution_state: 'future_state' }, code: 'unsupported_state', handle: 'run_1' },
  { name: 'no receipt and no id', body: { ok: true }, code: 'unreadable', handle: null },
];
for (const row of REFUSALS) {
  test(`refusal: ${row.name}`, async () => {
    const t = load([res(202, row.body)], { stored: [CLIP()] });
    const out = await t.sync(CLIP());
    assert.equal(out.success, false);
    assert.equal(out.code, row.code);
    assert.equal(out.receipt ? out.receipt.run_id : null, row.handle);
    assert.ok(t.warnings.some((w) => /refused/.test(w)), 'WARNING logged');
    assert.equal(t.store.clips[0].receipt ? t.store.clips[0].receipt.run_id : null, row.handle);
  });
}

test('unparseable 202 body: typed unreadable, WARNING, no handle', async () => {
  const t = load([res(202, undefined)]);
  const out = await t.sync(CLIP());
  assert.equal(out.success, false);
  assert.equal(out.code, 'unreadable');
  assert.ok(t.warnings.some((w) => /unreadable/.test(w)));
});

test('legacy bare {id} body (lite daemon): success without a receipt, WARNING names the lost handle', async () => {
  const t = load([res(200, { item_id: 'legacy_1' })]);
  const out = await t.sync(CLIP());
  assert.equal(out.success, true);
  assert.equal(out.receipt, null);
  assert.equal(out.item_id, 'legacy_1');
  assert.ok(t.warnings.some((w) => /bare item id.*no run_id/.test(w)));
});

test('a clip that already has a key keeps it', async () => {
  const t = load([res(202, RECEIPT)]);
  const clip = { ...CLIP(), idempotency_key: 'sm2_11111111-1111-4111-8111-111111111111' };
  await t.sync(clip);
  assert.equal(t.calls[0].body.idempotency_key, 'sm2_11111111-1111-4111-8111-111111111111');
});

// Retry-After rows (spec: honor a safe minimum on 429/503, bounded by the wait budget).
test('Retry-After 2 on 503 is a minimum delay before the same-key retry', async () => {
  const t = load([res(503, {}, { 'Retry-After': '2' }), res(202, RECEIPT)]);
  const out = await t.sync(CLIP());
  assert.equal(out.success, true);
  assert.deepEqual(t.sleeps, [2000]); // jitter 100 < 2000
  assert.equal(t.calls[1].init.body, t.calls[0].init.body);
});

test('Retry-After 60 cannot fit: no retry, WARNING says the save was not confirmed', async () => {
  const t = load([res(429, {}, { 'Retry-After': '60' })]);
  const out = await t.sync(CLIP());
  assert.equal(out.success, false);
  assert.equal(out.error, 'HTTP 429');
  assert.equal(t.calls.length, 1);
  assert.ok(t.warnings.some((w) => /NOT confirmed.*keeps its idempotency key/.test(w)));
  assert.ok(out.idempotency_key.startsWith('sm2_'));
});

test('Retry-After as a date or on a 500 is no hint', async () => {
  const t = load([res(503, {}, { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }), res(500, {}, { 'Retry-After': '9' }), res(202, RECEIPT)]);
  const out = await t.sync(CLIP());
  assert.equal(out.success, true);
  assert.deepEqual(t.sleeps, [100, 200]);
});
