import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { adminCookie, authenticateAdmin, organizerKey } from './pilotAuth';
import { pilotRequest, type PilotEnv } from './pilot';
import { TidbDocuments } from './tidbDocuments';

const secret = 'fixture-only-session-secret-abcdefghijklmnopqrstuvwxyz';
const owner = { sub: 'owner', name: 'Fixture Owner', linkedAt: '' };
function fixture(t: TestContext) {
  const documents = new Map<string, unknown>([[organizerKey, owner]]);
  let writes = 0, failWrites = false;
  t.mock.method(TidbDocuments.prototype, 'readDocument', async (key: string, fallback: unknown) => structuredClone(documents.get(key) ?? fallback));
  t.mock.method(TidbDocuments.prototype, 'updateDocument', async (key: string, fallback: unknown, mutate: (value: any) => unknown) => {
    if (failWrites) throw Error('simulated database failure');
    const value = structuredClone(documents.get(key) ?? fallback);
    const result = await mutate(value); documents.set(key, value); writes++; return result;
  });
  const env: PilotEnv = { ADMIN_SESSION_SECRET: secret, TIDB_DATABASE_URL: 'mysql://fixture:fixture@gateway01.ap-southeast-1.prod.aws.tidbcloud.com/test' };
  const db = new TidbDocuments(env.TIDB_DATABASE_URL!);
  const request = (cookie?: string, method = 'POST', headers: Record<string, string> = {}) => new Request('https://example.com/api/finance/logout', {
    method, headers: { ...(cookie ? { Cookie: cookie.split(';')[0] } : {}), ...headers },
  });
  const logout = (cookie?: string, method = 'POST', headers: Record<string, string> = {}) => pilotRequest(request(cookie, method, headers), env, async () => owner);
  const authenticate = (cookie: string) => authenticateAdmin(request(cookie), secret, db);
  return { documents, logout, authenticate, writes: () => writes, fail: () => { failWrites = true; } };
}

test('logout through the public pilot route revokes a copied cookie immediately', async t => {
  const f = fixture(t), cookie = await adminCookie(secret, owner);
  assert.equal((await f.authenticate(cookie)).role, 'owner');
  const response = await f.logout(cookie);
  assert.equal(response!.status, 200);
  assert.match(response!.headers.get('set-cookie')!, /Max-Age=0/);
  assert.match(response!.headers.get('set-cookie')!, /HttpOnly; Secure; SameSite=Strict/);
  await assert.rejects(f.authenticate(cookie));
  const revoked = f.documents.get('worker-revoked-admin-sessions') as Record<string, number>;
  assert.equal(Object.keys(revoked).length, 1);
  assert.match(Object.keys(revoked)[0], /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(revoked).includes(cookie.split(';')[0]), false);
});

test('revocation is idempotent and does not log out a different valid session', async t => {
  const f = fixture(t), first = await adminCookie(secret, owner), second = await adminCookie(secret, owner);
  assert.notEqual(first, second);
  assert.equal((await f.logout(first))!.status, 200);
  assert.equal((await f.logout(first))!.status, 200);
  await assert.rejects(f.authenticate(first));
  assert.equal((await f.authenticate(second)).role, 'owner');
  assert.equal(Object.keys(f.documents.get('worker-revoked-admin-sessions') as object).length, 1);
});

test('GET and cross-site logout cannot revoke a valid session', async t => {
  const f = fixture(t), cookie = await adminCookie(secret, owner);
  assert.equal((await f.logout(cookie, 'GET'))!.status, 405);
  assert.equal((await f.logout(cookie, 'POST', { Origin: 'https://other.example' }))!.status, 403);
  assert.equal((await f.logout(cookie, 'POST', { 'Sec-Fetch-Site': 'cross-site' }))!.status, 403);
  assert.equal(f.writes(), 0);
  assert.equal((await f.authenticate(cookie)).role, 'owner');
});

test('missing, forged and expired cookies cannot fill the revocation store', async t => {
  const f = fixture(t), cookie = await adminCookie(secret, owner);
  const raw = cookie.split(';')[0];
  const forged = raw.slice(0, -1) + (raw.endsWith('a') ? 'b' : 'a');
  assert.equal((await f.logout())!.status, 200);
  assert.equal((await f.logout(forged))!.status, 200);
  assert.equal(f.writes(), 0);
  await assert.rejects(f.authenticate(forged));
  const later = Date.now() + 1800001;
  t.mock.method(Date, 'now', () => later);
  assert.equal((await f.logout(cookie))!.status, 200);
  assert.equal(f.writes(), 0);
  await assert.rejects(f.authenticate(cookie));
});

test('failed revocation does not report a successful server-side logout', async t => {
  const f = fixture(t), cookie = await adminCookie(secret, owner); f.fail();
  const response = await f.logout(cookie);
  assert.equal(response!.status, 503);
  assert.equal(response!.headers.get('set-cookie'), null);
  assert.equal(f.writes(), 0);
  assert.equal((await response!.text()).includes('simulated database failure'), false);
});
