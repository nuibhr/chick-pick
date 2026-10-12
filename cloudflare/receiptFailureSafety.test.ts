import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { digest } from './pilotAuth';
import { checkStoredReceipt } from './slipokReceipts';
import { book, unavailableOcr } from './pilotDomain';
import { reviewLessonReceipt } from './coachingDomain';
import { paymentHoldExpired } from '../src/bookingHold';
import { lessonHoldExpired } from '../src/coachingTypes';
import { recordVerifiedTransfer } from './receiptVerification';
import type { FinanceDocuments } from './financeDomain';
import type { TidbDocuments } from './tidbDocuments';
import type { ReceiptSubmission, Session } from '../src/marketplaceTypes';

async function fixture(t: TestContext, kind: 'game' | 'coaching', code: number) {
  const now = Date.now(), image = new Uint8Array([137,80,78,71,13,10,26,10,42]);
  const deadline = new Date(now + (kind === 'game' ? 5 : 30) * 60000).toISOString();
  const receipt: ReceiptSubmission = {
    id: 'receipt-fixture', fileName: 'fixture.png', mimeType: 'image/png', size: image.length,
    sha256: await digest(image), submittedAt: new Date(now).toISOString(), status: 'pending', ocr: unavailableOcr(),
  };
  const account = { bankName: 'KBANK', accountName: 'Fixture', accountNumber: '0000000000' };
  const session: Session = {
    id: 'game', title: 'Fixture', venue: 'Test Court', area: 'Test', date: '', time: '',
    price: 190, joined: 0, capacity: 1, dupr: '', vibe: '', host: 'Fixture', hostRating: 0,
    courtCount: 1, venueCost: 0, tags: [], startsAt: new Date(now + 86400000).toISOString(), status: 'open',
  };
  const docs: FinanceDocuments = {
    marketplace: { sessions: [session], bookings: kind === 'game' ? [{
      id: 'booking', sessionId: 'game', playerId: 'line:fixture', playerName: 'Fixture', title: 'Fixture',
      amount: 19000, createdAt: new Date(now).toISOString(), holdExpiresAt: deadline,
      transferAccount: account, receipts: [receipt],
    }] : [] },
    coaching: kind === 'coaching' ? [{
      id: 'booking', coachId: 'coach', playerId: 'line:fixture', student: 'Fixture', phone: '', title: 'Fixture',
      totalHours: 1, amount: 190, payment: 'pending', createdAt: new Date(now).toISOString(), holdExpiresAt: deadline,
      transferAccount: account, receipts: [receipt], lessons: [{ id: 'lesson', start: session.startsAt, hours: 1, status: 'scheduled' }],
    }] : [],
    finance: [], 'revenue-config': [], 'revenue-settlements': [],
  };
  const row = () => kind === 'game' ? docs.marketplace.bookings[0] : docs.coaching[0];
  const db = { updateFinance: async (mutate: (value: FinanceDocuments) => unknown) => {
    const copy = structuredClone(docs); const result = await mutate(copy); Object.assign(docs, copy); return result;
  } } as unknown as TidbDocuments;
  let imageBytes: ArrayBuffer = image.buffer, deleted = false, calls = 0;
  const env = { SLIPOK_API_KEY: 'fixture-private-key', SLIPOK_BRANCH_ID: '123', RECEIPTS: {
    get: async () => imageBytes, put: async () => {}, delete: async () => { deleted = true; },
  } };
  t.mock.method(globalThis, 'fetch', async () => {
    calls++; return Response.json({ code, data: code === 1010 ? { delay: 8 } : {} }, { status: 400 });
  });
  const check = () => checkStoredReceipt(db, env, kind, 'booking', receipt.id, { actorId: 'fixture', actorType: 'line', action: 'test', entityId: receipt.id });
  return { docs, row, check, deadline, receipt, image,
    corruptImage: () => { imageBytes = new Uint8Array([1,2,3]).buffer; },
    calls: () => calls, deleted: () => deleted };
}

for (const code of [1005, 1006, 1007, 1008]) test('invalid image code ' + code + ' releases only at the original deadline and preserves evidence', async t => {
  const f = await fixture(t, 'game', code); await f.check();
  const row = f.row(), receipt = row.receipts![0];
  assert.equal(receipt.status, 'rejected'); assert.equal(receipt.verification!.code, code);
  assert.equal(row.holdExpiresAt, f.deadline); assert.equal(row.paidAt, undefined); assert.equal(row.refund, undefined);
  assert.equal(receipt.sha256, f.receipt.sha256); assert.equal(f.deleted(), false);
  assert.equal(paymentHoldExpired(row, Date.parse(f.deadline) - 1), false);
  assert.equal(paymentHoldExpired(row, Date.parse(f.deadline)), true);
  assert.throws(() => recordVerifiedTransfer(receipt, 19000, { transferReference: 'TEST123456', receivedAmount: 190 }, [receipt]));
  row.holdExpiresAt = new Date(Date.now() - 1000).toISOString();
  const context = { enabled: true, closed: [], account: row.transferAccount!, venues: [{ id: 'court', name: 'Test Court', area: '', address: '', active: true }] };
  assert.ok(book(f.docs.marketplace, context, { sub: 'replacement', name: 'Replacement' }, 'game').id);
  assert.throws(() => book(f.docs.marketplace, context, { sub: 'third', name: 'Third' }, 'game'));
  assert.equal(f.docs.marketplace.bookings[0].receipts![0].sha256, f.receipt.sha256);
});

for (const code of [1009, 1010, 1011, 1012, 1013, 1014]) test('bank result ' + code + ' does not discard evidence or infer missing funds', async t => {
  const f = await fixture(t, 'game', code); await f.check();
  const row = f.row();
  assert.equal(row.receipts![0].status, 'pending');
  assert.equal(paymentHoldExpired(row, Date.parse(f.deadline) + 86400000), false);
  assert.equal(row.paidAt, undefined); assert.equal(row.refund, undefined); assert.equal(f.deleted(), false);
});

test('automatic invalid-image rejection cannot later renew an expired coaching slot through staff rejection', async t => {
  const f = await fixture(t, 'coaching', 1007); await f.check();
  const row = f.docs.coaching[0];
  assert.equal(row.receipts![0].status, 'rejected'); assert.equal(row.holdExpiresAt, f.deadline);
  row.holdExpiresAt = new Date(Date.now() - 1).toISOString();
  const deadline = row.holdExpiresAt;
  assert.equal(lessonHoldExpired(row), true);
  assert.throws(() => reviewLessonReceipt(f.docs, row.id, f.receipt.id, { action: 'reject', reason: 'retry image' }));
  assert.throws(() => reviewLessonReceipt(f.docs, row.id, f.receipt.id, { action: 'approve', fundsChecked: true }));
  assert.equal(row.holdExpiresAt, deadline); assert.equal(row.paidAt, undefined); assert.equal(f.deleted(), false);
});

test('normal verification detects changed stored bytes before contacting SlipOK', async t => {
  const f = await fixture(t, 'game', 1007); f.corruptImage();
  const result = await f.check();
  assert.equal(result.status, 'retry'); assert.equal(f.calls(), 0);
  assert.equal(f.row().receipts![0].status, 'pending'); assert.equal(f.row().paidAt, undefined);
  assert.equal(f.row().receipts![0].sha256, f.receipt.sha256); assert.equal(f.deleted(), false);
});
