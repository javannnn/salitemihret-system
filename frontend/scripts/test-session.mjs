import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
}
const validation = await load('../src/lib/session-validation.ts');
const session = await load('../src/lib/session.ts');
const storage = new Map();
globalThis.window = new EventTarget();
window.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
globalThis.CustomEvent = class extends Event { constructor(type, options) { super(type); this.detail = options.detail; } };
test('only a confirmed unauthorized response expires the session', async () => {
  for (const [status, expected] of [[200, 'valid'], [401, 'expired'], [403, 'unavailable'], [429, 'unavailable'], [500, 'unavailable'], [503, 'unavailable']]) {
    assert.equal(await validation.validateSessionResponse(async () => new Response(null, {status})), expected);
  }
  assert.equal(await validation.validateSessionResponse(async () => { throw new TypeError('offline'); }), 'unavailable');
});
test('idle expiry follows server policy and activity resets the deadline', () => {
  session.configureSessionPolicy(1);
  session.recordSessionActivity(100_000, true);
  assert.equal(session.getSessionIdleRemainingMs(159_999), 1);
  assert.equal(session.isSessionIdleExpired(160_000), true);
  session.recordSessionActivity(160_000, true);
  assert.equal(session.getSessionIdleRemainingMs(160_000), 60_000);
  session.configureSessionPolicy(30);
  assert.equal(session.getSessionIdleRemainingMs(160_000), 1_800_000);
  assert.equal(session.formatSessionDuration(60), '1 hour');
  assert.equal(session.formatSessionDuration(300), '5 hours');
  assert.equal(session.formatSessionDuration(30), '30 minutes');
});
test('one password prompt suspends all requests and restoration releases them', async () => {
  let prompts = 0;
  const unsubscribe = session.subscribeSessionExpired(() => prompts++);
  session.notifySessionExpired('idle');
  session.notifySessionExpired('unauthorized');
  const first = session.waitForSessionRestored();
  assert.equal(first, session.waitForSessionRestored());
  assert.equal(prompts, 1);
  session.resetSessionExpiryNotice();
  await first;
  session.notifySessionExpired('expired');
  assert.equal(prompts, 2);
  session.resetSessionExpiryNotice();
  unsubscribe();
});
