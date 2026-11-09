import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { publicSession, verifyLineIdToken } from './tidbPreview';
import type { Booking, MemberProfile, Session } from '../src/marketplaceTypes';
import { TidbDocuments } from './tidbDocuments';
import { secureResponse } from './securityHeaders';

test('Worker blocks source/env paths, protects asset/API headers and keeps receipt CSP stronger', async () => {
  const env = { ASSETS: { fetch: async () => new Response('<html>app</html>', { headers: { 'Content-Type': 'text/html' } }) } };
  for (const path of ['/.env', '/.env.local', '/.git/config', '/data/private.json', '/artifacts/private-config/key.txt', '/server/auth.ts', '/src/main.tsx', '/package.json', '/wrangler.tidb.jsonc', '/%2eenv']) {
    const response = await worker.fetch(new Request('https://example.com' + path), env);
    assert.equal(response.status, 404, path); assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const app = await worker.fetch(new Request('https://example.com/miniapp'), env);
  assert.equal(app.status, 200); assert.equal(app.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(app.headers.get('cache-control'), 'no-store');
  assert.equal(app.headers.get('referrer-policy'), 'no-referrer'); assert.equal(app.headers.get('x-frame-options'), 'DENY');
  assert.match(app.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
  assert.match(app.headers.get('permissions-policy')!, /camera=\(self\)/);
  const privateApi = await worker.fetch(new Request('https://example.com/api/marketplace'), env);
  assert.equal(privateApi.status, 503); assert.equal(privateApi.headers.get('referrer-policy'), 'no-referrer');
  const receipt = secureResponse(new Response('image', { headers: { 'Content-Security-Policy': "default-src 'none'; sandbox" } }));
  assert.equal(receipt.headers.get('content-security-policy'), "default-src 'none'; sandbox");
});

test('public session API follows current venue visibility and never exposes admin delete policy', async t => {
  const session = { id: 'game', title: 'Game', venue: 'Court', venueId: 'court', area: 'Test', date: '', time: '', price: 190, joined: 0, capacity: 4, dupr: '<3.5', vibe: 'social', host: 'Test', hostRating: 0, courtCount: 1, venueCost: 900, tags: [], startsAt: new Date(Date.now() + 86400000).toISOString(), status: 'open', management: { canDelete: true } };
  t.mock.method(TidbDocuments.prototype, 'readMarketplace', async () => ({ sessions: [session], bookings: [] }));
  t.mock.method(TidbDocuments.prototype, 'readDocument', async () => [{ id: 'court', name: 'Court', active: false }]);
  const result = await worker.fetch(new Request('https://example.com/api/player/sessions'), { TIDB_DATABASE_URL: 'mysql://fixture:fixture@gateway01.ap-southeast-1.prod.aws.tidbcloud.com/test', ASSETS: { fetch: async () => new Response('unused') } });
  const data = await result.json(); assert.equal(result.status, 200); assert.equal(data.sessions[0].bookingPaused, true);
  assert.equal(data.sessions[0].management, undefined); assert.equal(data.sessions[0].venueCost, undefined);
});

test('own tickets expose server deadline and expiry without cancelling protected or old bookings', async t => {
  const now = Date.now(), base: Booking = { id: 'expired', sessionId: 'game', playerId: 'line:user-1', playerName: 'Member', amount: 19000, title: 'Open Play', createdAt: new Date(now - 300001).toISOString(), holdExpiresAt: new Date(now - 1).toISOString() };
  const bookings: Booking[] = [base, { ...base, id: 'paid', paidAt: new Date(now).toISOString() }, { ...base, id: 'legacy', holdExpiresAt: undefined }, { ...base, id: 'foreign', playerId: 'line:someone-else' }];
  t.mock.method(TidbDocuments.prototype, 'readMarketplace', async () => ({ sessions: [], bookings }));
  t.mock.method(TidbDocuments.prototype, 'readDocument', async () => []);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ iss: 'https://access.line.me', aud: 'configured-channel', sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 60, name: 'Member' }));
  const response = await worker.fetch(new Request('https://example.com/api/player/bookings', { headers: { Authorization: 'Bearer test-line-token-member' } }), { LINE_CHANNEL_ID: 'configured-channel', TIDB_DATABASE_URL: 'mysql://fixture:fixture@gateway01.ap-southeast-1.prod.aws.tidbcloud.com/test', ASSETS: { fetch: async () => new Response('unused') } });
  assert.equal(response.status, 200);
  const own = await response.json();
  assert.equal(own.bookings.length, 3); assert.ok(own.serverNow >= now);
  assert.equal(own.bookings[0].holdExpiresAt, base.holdExpiresAt); assert.equal(own.bookings[0].holdExpired, true);
  assert.equal(own.bookings[0].cancelledAt, null); assert.equal(own.bookings[1].holdExpired, false); assert.equal(own.bookings[2].holdExpired, false);
});

test('private document path cannot be served by public asset binding', async () => {
  const response = await worker.fetch(new Request('https://example.com/brand/messageImage_1790922360771.jpg'), {
    ASSETS: { fetch: async () => { throw Error('must not serve private asset'); } },
  });
  assert.equal(response.status, 404);
});

test('Workers public catalog only shows opted-in admitted players before the game', () => {
  const session: Session = {
    id: 'game-1', title: 'Open Play', venue: 'Court', area: 'Khon Kaen', date: '',
    time: '18:00', price: 190, joined: 0, capacity: 12, dupr: '2–3', vibe: 'social',
    host: 'Nui', hostRating: 0, courtCount: 2, venueCost: 800, tags: [],
    startsAt: new Date(Date.now() + 86_400_000).toISOString(), status: 'open',
  };
  const bookings: Booking[] = [
    { id: 'one', sessionId: session.id, playerId: 'line:one', playerName: 'One', amount: 19000, title: 'Open Play', createdAt: '', admissionStatus: 'approved' },
    { id: 'two', sessionId: session.id, playerId: 'line:two', playerName: 'Two', amount: 19000, title: 'Open Play', createdAt: '', admissionStatus: 'approved' },
    { id: 'three', sessionId: session.id, playerId: 'line:three', playerName: 'Three', amount: 19000, title: 'Open Play', createdAt: '', admissionStatus: 'pending' },
  ];
  const profiles: MemberProfile[] = [
    { id: 'profile-one', playerId: 'line:one', name: 'One', picture: 'https://example.com/not-line.png', skill: 3, bio: 'Hello', discoverable: true, updatedAt: '' },
    { id: 'profile-two', playerId: 'line:two', name: 'Two', picture: null, skill: null, bio: '', discoverable: false, updatedAt: '' },
  ];
  const upcoming = publicSession(session, bookings, profiles);
  assert.equal(upcoming.joined, 3);
  assert.deepEqual(upcoming.participants.map(player => player.id), ['profile-one']);
  assert.equal(upcoming.participants[0].picture, null);
  assert.equal(upcoming.privateParticipantCount, 1);

  const completed = publicSession({ ...session, status: 'completed' }, bookings, profiles);
  assert.deepEqual(completed.participants, []);
  assert.equal(completed.privateParticipantCount, 0);
});

test('LINE token verification binds identity to the configured channel', async () => {
  const valid = async () => Response.json({
    iss: 'https://access.line.me', aud: 'configured-channel', sub: 'user-1',
    exp: Math.floor(Date.now() / 1000) + 60, name: 'Member',
    picture: 'https://evil.example/avatar.jpg',
  });
  const identity = await verifyLineIdToken('token', 'configured-channel', valid as typeof fetch);
  assert.deepEqual(identity, { sub: 'user-1', name: 'Member', picture: null });
  await assert.rejects(() => verifyLineIdToken('token', 'different-channel', valid as typeof fetch));
});

test('private player endpoint stays closed without LINE configuration', async () => {
  const response = await worker.fetch(new Request('https://example.com/api/player/me'), {
    ASSETS: { fetch: async () => new Response('unused') }, TIDB_DATABASE_URL: 'unused',
  });
  assert.equal(response.status, 503);
});

test('logged-in player can save profile on Worker without enabling bookings', async t => {
  const data = { sessions: [], bookings: [], profiles: [] as MemberProfile[] };
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    iss: 'https://access.line.me', aud: 'configured-channel', sub: 'user-1',
    exp: Math.floor(Date.now() / 1000) + 60, name: 'Verified Member',
    picture: 'https://profile.line-scdn.net/avatar.jpg',
  }));
  t.mock.method(TidbDocuments.prototype, 'updateMarketplace', async (mutate: (value: typeof data) => unknown) => mutate(data));
  const env = {
    ASSETS: { fetch: async () => new Response('unused') },
    TIDB_DATABASE_URL: 'mysql://fixture:fixture@gateway01.ap-southeast-1.prod.aws.tidbcloud.com/test',
    LINE_CHANNEL_ID: 'configured-channel',
  };
  const response = await worker.fetch(new Request('https://example.com/api/player/me/profile', {
    method: 'POST', headers: { Authorization: 'Bearer test-line-id-token-for-profile', 'Content-Type': 'application/json' },
    body: JSON.stringify({ skill: 3.2, bio: 'เจอกันที่สนาม', discoverable: true, name: 'Spoofed', playerId: 'line:another-user' }),
  }), env);
  assert.equal(response.status, 200, 'profile save must work after LINE login');
  const result = await response.json() as { profile: MemberProfile };
  assert.equal(result.profile.name, 'Verified Member');
  assert.equal(result.profile.skill, 3.2);
  assert.equal(data.profiles.length, 1);
  assert.equal(data.profiles[0].playerId, 'line:user-1');
  assert.equal(result.profile.playerId, undefined, 'internal identity is not returned to the client');
  t.mock.method(TidbDocuments.prototype, 'readDocument', async () => ({}));
  const booking = await worker.fetch(new Request('https://example.com/api/player/bookings', { method: 'POST', headers: { Authorization: 'Bearer test-line-id-token-for-profile', 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'test' }) }), env);
  assert.equal(booking.status, 503);
});

test('Worker profile writes require LINE identity and reject foreign origins', async () => {
  const env = { ASSETS: { fetch: async () => new Response('unused') }, LINE_CHANNEL_ID: 'configured-channel', TIDB_DATABASE_URL: 'unused' };
  const anonymous = await worker.fetch(new Request('https://example.com/api/player/me/profile', { method: 'POST' }), env);
  assert.equal(anonymous.status, 401);
  const foreign = await worker.fetch(new Request('https://example.com/api/player/me/profile', {
    method: 'POST', headers: { Origin: 'https://foreign.example' },
  }), env);
  assert.equal(foreign.status, 403);
});

test('Worker rejects malformed or oversized profile updates before database mutation', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    iss: 'https://access.line.me', aud: 'configured-channel', sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 60,
  }));
  const mutations = t.mock.method(TidbDocuments.prototype, 'updateMarketplace', () => { throw Error('Must not write invalid input'); });
  const env = { ASSETS: { fetch: async () => new Response('unused') }, LINE_CHANNEL_ID: 'configured-channel', TIDB_DATABASE_URL: 'unused' };
  for (const [body, expected] of [
    ['{', 400], ['null', 400],
    [JSON.stringify({ discoverable: true, skill: 5.1, bio: '' }), 400],
    [JSON.stringify({ discoverable: true, skill: 3.25, bio: '' }), 400],
    [JSON.stringify({ discoverable: true, skill: null, bio: 'x'.repeat(161) }), 400],
    ['x'.repeat(4097), 413],
  ] as const) {
    const response = await worker.fetch(new Request('https://example.com/api/player/me/profile', {
      method: 'POST', headers: { Authorization: 'Bearer test-line-id-token-for-profile', 'Content-Type': 'application/json' }, body,
    }), env);
    assert.equal(response.status, expected);
  }
  assert.equal(mutations.mock.callCount(), 0);
});
