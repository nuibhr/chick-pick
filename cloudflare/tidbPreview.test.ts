import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { publicSession, verifyLineIdToken } from './tidbPreview';
import type { Booking, MemberProfile, Session } from '../src/marketplaceTypes';

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
