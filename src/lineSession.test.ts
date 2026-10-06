import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeLine, reauthenticateLine } from './lineSession';
test('StrictMode initialization runs once, failed initialization remains retryable', async () => {
  let count = 0, fail = true;
  const sdk = { init: async () => { count++; if (fail) throw Error('network'); }, isLoggedIn: () => true, isInClient: () => false, logout: () => {}, login: () => {} };
  await assert.rejects(() => initializeLine(sdk, 'app'));
  fail = false; await Promise.all([initializeLine(sdk, 'app'), initializeLine(sdk, 'app')]); assert.equal(count, 2);
});
test('rejected external LINE session gets a fresh login, LIFF client never calls unsupported login', () => {
  const calls: string[] = [], sdk = { init: async () => {}, isLoggedIn: () => true, isInClient: () => false, logout: () => { calls.push('logout'); }, login: ({ redirectUri }: { redirectUri: string }) => { calls.push(redirectUri); } };
  assert.equal(reauthenticateLine(sdk, 'https://app.example/miniapp?view=tickets'), 'redirecting');
  assert.deepEqual(calls, ['logout', 'https://app.example/miniapp?view=tickets']); calls.length = 0;
  sdk.isInClient = () => true; assert.equal(reauthenticateLine(sdk, 'unused'), 'reopen'); assert.deepEqual(calls, []);
});
