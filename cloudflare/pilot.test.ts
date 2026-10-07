import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { pilotRequest, type PilotEnv } from './pilot';
import { TidbDocuments } from './tidbDocuments';
import { organizerKey } from './pilotAuth';
import type { MarketplaceData } from '../src/marketplaceTypes';
import type { PilotContext } from './pilotDomain';
import Stripe from 'stripe';
import { prepareCheckout, attachCheckout, applyStripeSession } from './stripePayments';
import { cancel } from './pilotDomain';
import { lessonHoldExpired } from '../src/coachingTypes';
const stripeAudit = { actorId: 'test', actorType: 'admin' as const, action: 'test.stripe', entityId: 'fixture' };

function slipOKPayload(amount = 190, reference = 'SLIPOKTEST0001') {
  const now = new Date();
  return { success: true, data: { success: true, amount, transRef: reference, receivingBank: '004', countryCode: 'TH', paidLocalCurrency: '764', transDate: now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).replaceAll('-', ''), transTime: now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hourCycle: 'h23' }), receiver: { displayName: 'Test', account: { value: 'xxx-x-x0000-x' } } } };
}

test('SlipOK concurrent duplicate transfers reserve one reference across receipts; no money until admin approval', async t => {
  const f = fixture(t), owner = await f.signIn();
  Object.assign(f.env, { SLIPOK_API_KEY: 'fixture-private-slipok-secret', SLIPOK_BRANCH_ID: '77946' });
  f.docs.set('transfer-account', { bankName: 'KBANK', accountName: 'Test', accountNumber: '0000000000' }); f.docs.set('worker-pilot', { bookingEnabled: true });
  const ids = []; for (const who of ['a','b']) ids.push((await (await f.request('/api/player/bookings', { sessionId: 'game' }, f.player(who))).json()).booking.id);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: any, init: any) => { calls++; assert.equal(String(url), 'https://api.slipok.com/api/line/apikey/77946'); assert.equal(init.body.get('amount'), '190.00'); assert.equal(init.body.get('log'), 'true'); return new Response(JSON.stringify(slipOKPayload())); });
  const upload = (id: string, who: string, byte: number) => pilotRequest(new Request(`https://example.com/api/player/bookings/${id}/receipt`, { method: 'POST', headers: { ...f.player(who), 'Content-Type': 'image/png' }, body: new Uint8Array([137,80,78,71,13,10,26,10,byte]) }), f.env, f.verify);
  const responses = await Promise.all([upload(ids[0], 'a', 1), upload(ids[1], 'b', 2)]); assert.deepEqual(responses.map(r => r?.status), [201,201]); assert.equal(calls, 2);
  const results = f.data.bookings.map(b => b.receipts![0].verification!.status).sort(); assert.deepEqual(results, ['rejected','verified']);
  assert.equal(f.data.bookings.filter(b => b.paidAt).length, 0); assert.equal((await (await f.request('/api/finance/report', undefined, owner)).json()).summary.income, 0);
  const good = f.data.bookings.find(b => b.receipts![0].verification!.status === 'verified')!, bad = f.data.bookings.find(b => b.id !== good.id)!;
  const reviewPath = (b: any) => `/api/marketplace/bookings/${b.id}/receipts/${b.receipts[0].id}/review`;
  assert.equal((await f.request(reviewPath(good), { action: 'approve', fundsChecked: true, transferReference: 'FORGED0001', receivedAmount: 190 }, owner)).status, 409);
  assert.equal((await f.request(reviewPath(good), { action: 'approve', fundsChecked: true, transferReference: 'SLIPOKTEST0001', receivedAmount: 190 }, owner)).status, 200);
  assert.equal((await f.request(reviewPath(bad), { action: 'approve', fundsChecked: true, transferReference: 'OTHER0001', receivedAmount: 190 }, owner)).status, 409);
  const report = await (await f.request('/api/finance/report', undefined, owner)).json(); assert.equal(report.summary.income, 19000); assert.equal(f.data.bookings.find(b => b.id === good.id)!.admissionStatus, 'pending');
  assert.doesNotMatch(JSON.stringify(await (await f.request('/api/player/config')).json()), /fixture-private-slipok-secret/);
});

test('SlipOK bank delay retains private evidence, blocks approval and throttles retries without another API charge', async t => {
  const f = fixture(t), owner = await f.signIn(); Object.assign(f.env, { SLIPOK_API_KEY: 'fixture-private-secret', SLIPOK_BRANCH_ID: '77946' });
  f.docs.set('transfer-account', { bankName: 'KBANK', accountName: 'Test', accountNumber: '0000000000' }); f.docs.set('worker-pilot', { bookingEnabled: true });
  const id = (await (await f.request('/api/player/bookings', { sessionId: 'game' }, f.player('a'))).json()).booking.id;
  let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(JSON.stringify({ code: 1010, data: { delay: 8 } }), { status: 400 }); });
  const response = await pilotRequest(new Request(`https://example.com/api/player/bookings/${id}/receipt`, { method: 'POST', headers: { ...f.player('a'), 'Content-Type': 'image/png' }, body: new Uint8Array([137,80,78,71,13,10,26,10,1]) }), f.env, f.verify);
  assert.equal(response?.status, 201); const receipt = f.data.bookings[0].receipts![0]; assert.equal(receipt.verification!.status, 'retry'); assert.equal(f.images.size, 1);
  const path = `/api/marketplace/bookings/${id}/receipts/${receipt.id}`;
  assert.equal((await f.request(path + '/verify', {}, owner)).status, 429); assert.equal(calls, 1);
  assert.equal((await f.request(path + '/review', { action: 'approve', fundsChecked: true, transferReference: 'OTHER0001', receivedAmount: 190 }, owner)).status, 409);
  assert.equal(f.data.bookings[0].paidAt, undefined);
});

test('SlipOK coaching uses server slot price and private account; owner quota and verification obey team permissions', async t => {
  const f = fixture(t), owner = await f.signIn(); Object.assign(f.env, { SLIPOK_API_KEY: 'fixture-private-secret', SLIPOK_BRANCH_ID: '77946' });
  f.docs.set('transfer-account', { bankName: 'KBANK', accountName: 'Test', accountNumber: '0000000000' }); f.docs.set('worker-pilot', { bookingEnabled: true });
  const coach = await (await f.request('/api/coaching/coaches', { name: 'Test', specialty: 'Test', bio: '', venue: 'Court', hourlyRate: 550, bookingFee: 100, active: true }, owner)).json();
  const slot = await (await f.request('/api/coaching/slots', { coachId: coach.id, start: new Date(Math.ceil((Date.now() + 86400000) / 1800000) * 1800000).toISOString(), hours: 2, status: 'open' }, owner)).json();
  const lesson = await (await f.request('/api/player/lessons', { slotId: slot.id, amount: 1 }, f.player('a'))).json();
  let calls = 0; t.mock.method(globalThis, 'fetch', async (url: any, init: any) => { calls++; if (String(url).endsWith('/quota')) return new Response(JSON.stringify({ success: true, data: { quota: 10, overQuota: 0 } })); assert.equal(init.body.get('amount'), '1100.00'); return new Response(JSON.stringify(slipOKPayload(1100, 'COACHSLIP0001'))); });
  const response = await pilotRequest(new Request(`https://example.com/api/player/lessons/${lesson.id}/receipt`, { method: 'POST', headers: { ...f.player('a'), 'Content-Type': 'image/png' }, body: new Uint8Array([137,80,78,71,13,10,26,10,1]) }), f.env, f.verify);
  assert.equal(response?.status, 201); const own = await (await f.request('/api/player/lessons', undefined, f.player('a'))).json();
  assert.equal(own.lessons[0].receipt.verification.status, 'verified'); assert.equal(own.lessons[0].paidAt, null);
  const invite = await (await f.request('/api/finance/admin-team', { action: 'invite', role: 'operator' }, owner)).json();
  const signed = await f.request('/api/finance/auth', { idToken: 'test-line-token-staff', pairingToken: invite.code }); const staff = { Cookie: signed.headers.get('set-cookie')!.split(';')[0] };
  assert.equal((await f.request('/api/marketplace/setup/slipok')).status, 401); assert.equal((await f.request('/api/marketplace/setup/slipok', undefined, staff)).status, 403);
  const quota = await (await f.request('/api/marketplace/setup/slipok', undefined, owner)).json(); assert.equal(quota.connected, true); assert.equal(quota.quota, 10); assert.doesNotMatch(JSON.stringify(quota), /fixture-private-secret/);
  const receiptId = own.lessons[0].receipt.id, path = `/api/coaching/enrollments/${lesson.id}/receipts/${receiptId}`;
  assert.equal((await f.request(path + '/verify', {}, staff)).status, 409); assert.equal(calls, 2);
  assert.equal((await f.request(path + '/review', { action: 'approve', fundsChecked: true, transferReference: 'COACHSLIP0001', receivedAmount: 1100 }, staff)).status, 200);
});

test('one LINE player cannot gain extra seats or payments from concurrent bookings and different slips', async t => {
  const f = fixture(t), admin = await f.signIn();
  f.docs.set('transfer-account', { bankName: 'test', accountName: 'test', accountNumber: '0000000000' });
  f.docs.set('worker-pilot', { bookingEnabled: true });
  const replies = await Promise.all(Array.from({ length: 12 }, () => f.request('/api/player/bookings', { sessionId: 'game', playerId: 'forged' }, f.player('a'))));
  assert.equal(replies.filter(r => r.status === 201).length, 1);
  assert.equal(replies.filter(r => r.status === 200).length, 11);
  assert.equal(f.data.bookings.length, 1);
  const id = f.data.bookings[0].id;
  const upload = (suffix: number) => pilotRequest(new Request(`https://example.com/api/player/bookings/${id}/receipt`, { method: 'POST', headers: { ...f.player('a'), 'Content-Type': 'image/png' }, body: new Uint8Array([137,80,78,71,13,10,26,10,suffix]) }), f.env, f.verify);
  const slips = await Promise.all(Array.from({ length: 5 }, (_, i) => upload(i)));
  assert.equal(slips.filter(r => r.status === 201).length, 1);
  assert.equal(slips.filter(r => r.status === 409).length, 4);
  assert.equal(f.images.size, 1);
  const receiptId = f.data.bookings[0].receipts![0].id;
  const path = `/api/marketplace/bookings/${id}/receipts/${receiptId}/review`;
  const approvals = await Promise.all(Array.from({ length: 3 }, () => f.request(path, { action: 'approve', fundsChecked: true, transferReference: 'TEST-ONCE-0001', receivedAmount: 190 }, admin)));
  assert.deepEqual(approvals.map(r => r.status).sort(), [200,409,409]);
  assert.equal((await upload(99)).status, 409);
  assert.equal(f.data.bookings.length, 1);
  const report = await (await f.request('/api/finance/report', undefined, admin)).json();
  assert.equal(report.summary.income, 19000);
});

test('same bank transfer with different images is rejected across games and coaching atomically', async t => {
  const f = fixture(t), admin = await f.signIn();
  f.docs.set('transfer-account', { bankName: 'test', accountName: 'test', accountNumber: '0000000000' });
  f.docs.set('worker-pilot', { bookingEnabled: true });
  const upload = (path: string, who: string, suffix: number) => pilotRequest(new Request('https://example.com' + path, { method: 'POST', headers: { ...f.player(who), 'Content-Type': 'image/png' }, body: new Uint8Array([137,80,78,71,13,10,26,10,suffix]) }), f.env, f.verify);
  const paths: string[] = [];
  for (const [n, who] of ['a','b','c'].entries()) {
    const id = (await (await f.request('/api/player/bookings', { sessionId: 'game' }, f.player(who))).json()).booking.id;
    const receiptId = (await (await upload(`/api/player/bookings/${id}/receipt`, who, n + 1))!.json()).receipt.id;
    paths.push(`/api/marketplace/bookings/${id}/receipts/${receiptId}/review`);
  }
  const approval = { action: 'approve', fundsChecked: true, transferReference: 'TEST-TRANSFER-0001', receivedAmount: 190 };
  assert.equal((await f.request(paths[0], approval, admin)).status, 200);
  assert.equal((await f.request(paths[1], { ...approval, transferReference: 'test transfer 0001' }, admin)).status, 409);
  assert.equal(f.data.bookings[1].paidAt, undefined);
  assert.equal(f.data.bookings[1].receipts![0].status, 'pending');
  const race = await Promise.all(paths.slice(1).map(path => f.request(path, { ...approval, transferReference: 'TEST-TRANSFER-0002' }, admin)));
  assert.deepEqual(race.map(r => r.status).sort(), [200,409]);
  const coach = await (await f.request('/api/coaching/coaches', { name: 'Test', specialty: 'Test', bio: '', venue: 'Court', hourlyRate: 600, bookingFee: 100, active: true }, admin)).json();
  const start = new Date(Math.ceil((Date.now() + 86400000) / 1800000) * 1800000).toISOString();
  const slot = await (await f.request('/api/coaching/slots', { coachId: coach.id, start, hours: 1, status: 'open' }, admin)).json();
  const lesson = await (await f.request('/api/player/lessons', { slotId: slot.id }, f.player('a'))).json();
  const slip = (await (await upload(`/api/player/lessons/${lesson.id}/receipt`, 'a', 10))!.json()).receipt.id;
  const reviewPath = `/api/coaching/enrollments/${lesson.id}/receipts/${slip}/review`;
  assert.equal((await f.request(reviewPath, { ...approval, receivedAmount: 600 }, admin)).status, 409);
  assert.equal((await f.request(reviewPath, { ...approval, transferReference: 'TEST-TRANSFER-0003', receivedAmount: 1 }, admin)).status, 400);
  assert.equal((await f.request(reviewPath, { ...approval, transferReference: '', receivedAmount: 600 }, admin)).status, 400);
  assert.equal((await f.request(reviewPath, { ...approval, transferReference: 'TEST-TRANSFER-0003', receivedAmount: 600 }, admin)).status, 200);
  const unpaidPath = paths[f.data.bookings.findIndex(b => !b.paidAt)];
  assert.equal((await f.request(unpaidPath, { ...approval, transferReference: 'TEST-TRANSFER-0003' }, admin)).status, 409);
});

test('opening Open Play requires a registered active venue and a future game', async t => {
  const f = fixture(t), owner = await f.signIn();
  f.docs.set('transfer-account', { bankName: 'test', accountName: 'test', accountNumber: '0000000000' });
  assert.equal((await f.request('/api/marketplace/setup/pilot', { bookingEnabled: true }, owner)).status, 409);
  f.docs.set('court-venues', [{ id: 'court', name: 'สนาม', area: 'ขอนแก่น', address: '', active: true }]);
  f.data.sessions[0].startsAt = new Date(Date.now() - 86400000).toISOString();
  assert.equal((await f.request('/api/marketplace/setup/pilot', { bookingEnabled: true }, owner)).status, 409);
  f.data.sessions[0].startsAt = new Date(Date.now() + 86400000).toISOString();
  assert.equal((await f.request('/api/marketplace/setup/pilot', { bookingEnabled: true }, owner)).status, 200);
  assert.equal((await (await f.request('/api/marketplace/setup', undefined, owner)).json()).readiness.openPlayReady, true);
  assert.equal((await f.request('/api/marketplace/setup/pilot', { bookingEnabled: false }, owner)).status, 200);
});

test('new Open Play uses a registered venue and derives the displayed Thai time from its start and end', async t => {
  const f = fixture(t), owner = await f.signIn();
  const start = new Date(Date.now() + 86400000), end = new Date(start.getTime() + 7200000);
  const value = { title: 'Test Open Play', venueId: 'court', venue: 'forged', area: 'forged', host: 'Test', startsAt: start.toISOString(), endsAt: end.toISOString(), time: 'wrong', price: 190, capacity: 12, courtCount: 1, style: 'casual' };
  assert.equal((await f.request('/api/marketplace/sessions', value, owner)).status, 400);
  f.docs.set('court-venues', [{ id: 'court', name: 'สนามจริง', area: 'ย่านจริง', address: '', active: true }]);
  assert.equal((await f.request('/api/marketplace/sessions', { ...value, endsAt: start.toISOString() }, owner)).status, 400);
  const created = await f.request('/api/marketplace/sessions', value, owner);
  assert.equal(created.status, 201);
  const game = await created.json();
  assert.equal(game.venue, 'สนามจริง'); assert.equal(game.area, 'ย่านจริง');
  assert.equal(game.endsAt, end.toISOString()); assert.notEqual(game.time, 'wrong');
  f.docs.set('court-venues', [{ id: 'court', name: 'เปลี่ยนชื่อสนาม', area: 'ย่านจริง', address: '', active: true }]);
  assert.equal((await (await f.request('/api/marketplace/setup', undefined, owner)).json()).readiness.futureOpenPlayCount, 1);
  assert.equal((await f.request('/api/marketplace/sessions', { ...value, price: 1.999 }, owner)).status, 400);
});

test('real coach calendar: no anonymous admin access, server pricing, overlap, last-slot race and cancellation', async t => {
  const f = fixture(t), admin = await f.signIn();
  assert.equal((await f.request('/api/coaching')).status, 401);
  f.docs.set('transfer-account', { bankName: 'test', accountName: 'test', accountNumber: '0000000000' });
  f.docs.set('worker-pilot', { bookingEnabled: true });
  const coachResponse = await f.request('/api/coaching/coaches', { name: 'Coach Test', specialty: 'Beginner', bio: '', venue: 'Test Court', hourlyRate: 600, bookingFee: 100, active: true }, admin);
  assert.equal(coachResponse.status, 201);
  const coach = await coachResponse.json();
  const start = new Date(Math.ceil((Date.now() + 86400000) / 1800000) * 1800000).toISOString();
  const slotResponse = await f.request('/api/coaching/slots', { coachId: coach.id, start, hours: 1, status: 'open', price: 1 }, admin);
  assert.equal(slotResponse.status, 201);
  const slot = await slotResponse.json();
  assert.equal(slot.price, 600);
  assert.equal((await f.request('/api/coaching/slots', { coachId: coach.id, start, hours: 1, status: 'open' }, admin)).status, 409);
  const results = await Promise.all(['a', 'b'].map(who => f.request('/api/player/lessons', { slotId: slot.id, amount: 1, playerId: 'someone-else' }, f.player(who))));
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  const winner = results[0].status === 201 ? 'a' : 'b';
  const enrollment = (f.docs.get('coaching') as any[])[0];
  assert.equal(enrollment.amount, 600);
  assert.equal(enrollment.playerId, 'line:player-' + winner);
  assert.equal((await f.request('/api/player/lessons', { slotId: slot.id }, f.player(winner))).status, 200);
  assert.equal((await f.request('/api/coaching/slots/' + slot.id, { status: 'blocked' }, admin)).status, 409);
  assert.equal((await f.request('/api/player/lessons/' + enrollment.id + '/cancel', {}, f.player('stranger'))).status, 404);
  assert.equal((await f.request('/api/player/lessons/' + enrollment.id + '/cancel', {}, f.player(winner))).status, 200);
  const finance = await (await f.request('/api/finance/report', undefined, admin)).json();
  assert.equal(finance.rows.find((r: any) => r.source === 'coaching').status, 'void');
  assert.equal((await f.request('/api/player/lessons', { slotId: slot.id }, f.player('c'))).status, 201);
  const held = (f.docs.get('coaching') as any[]).find(e => e.playerId === 'line:player-c');
  held.holdExpiresAt = new Date(Date.now()-1000).toISOString();
  assert.equal((await f.request('/api/player/lessons', {slotId:slot.id}, f.player('d'))).status,201);
  assert.ok((await(await f.request('/api/player/lessons',undefined,f.player('c'))).json()).lessons[0].cancelledAt);
});

test('coaching receipts are private, cannot reuse game slips, require manual approval and retain booking fee', async t => {
  const f = fixture(t), admin = await f.signIn();
  f.docs.set('transfer-account', { bankName: 'test', accountName: 'test', accountNumber: '0000000000' });
  f.docs.set('worker-pilot', { bookingEnabled: true });
  const coach = await (await f.request('/api/coaching/coaches', { name: 'Test', specialty: 'Test', bio: '', venue: 'Court', hourlyRate: 600, bookingFee: 100, active: true }, admin)).json();
  const start = new Date(Math.ceil((Date.now() + 86400000) / 1800000) * 1800000).toISOString();
  const slot = await (await f.request('/api/coaching/slots', { coachId: coach.id, start, hours: 1, status: 'open' }, admin)).json();
  const enrollment = await (await f.request('/api/player/lessons', { slotId: slot.id }, f.player('a'))).json();
  const id = enrollment.id;
  const game = (await (await f.request('/api/player/bookings', {sessionId:'game'}, f.player('a'))).json()).booking;
  const upload = (path:string, suffix:number) => pilotRequest(new Request('https://example.com'+path, {method:'POST', headers:{...f.player('a'),'Content-Type':'image/png'},body:new Uint8Array([137,80,78,71,13,10,26,10,suffix])}), f.env, f.verify);
  assert.equal((await upload('/api/player/bookings/'+game.id+'/receipt',1)).status,201);
  assert.equal((await upload('/api/player/lessons/'+id+'/receipt',1)).status,409);
  const first = await upload('/api/player/lessons/'+id+'/receipt',2);
  assert.equal(first.status,201);
  const receipt = (await first.json()).receipt.id, route = '/api/coaching/enrollments/'+id+'/receipts/'+receipt;
  assert.equal((await f.request(route)).status,401);
  assert.equal((await f.request(route,undefined,admin)).status,200);
  assert.equal((await f.request('/api/player/lessons/'+id+'/cancel',{},f.player('a'))).status,409);
  assert.equal((await f.request(route+'/review',{action:'approve'},admin)).status,400);
  assert.equal((await f.request(route+'/review',{action:'reject',reason:'ภาพไม่ชัด'},admin)).status,200);
  const second = await upload('/api/player/lessons/'+id+'/receipt',3);
  const secondId = (await second.json()).receipt.id;
  assert.equal((await f.request('/api/coaching/enrollments/'+id+'/receipts/'+secondId+'/review',{action:'approve',fundsChecked:true,transferReference:'TEST-COACH-0001',receivedAmount:600},admin)).status,200);
  assert.equal((await f.request('/api/player/lessons/'+id+'/cancel',{},f.player('a'))).status,409);
  await f.request('/api/coaching/coaches/'+coach.id,{...coach,bookingFee:700},admin);
  assert.equal((await f.request('/api/player/lessons',{slotId:slot.id},f.player('a'))).status,200);
  let report = await (await f.request('/api/finance/revenue',undefined,admin)).json();
  let unit = report.units.find((u:any)=>u.key==='coaching:'+id);
  assert.equal(unit.platform,10000); assert.equal(unit.partner,50000);
  assert.equal((await f.request('/api/coaching/enrollments/'+id+'/complete',{},admin)).status,409);
  const closing = {key:unit.key,fingerprint:unit.fingerprint,configVersion:report.config.version};
  assert.equal((await f.request('/api/finance/revenue/settle',closing,admin)).status,409);
  const stored = (f.docs.get('coaching') as any[]).find(e=>e.id===id);
  stored.lessons[0].start = new Date(Date.now()-7200000).toISOString();
  assert.equal((await f.request('/api/coaching/enrollments/'+id+'/complete',{},admin)).status,200);
  report = await (await f.request('/api/finance/revenue',undefined,admin)).json();
  unit = report.units.find((u:any)=>u.key==='coaching:'+id);
  assert.equal((await f.request('/api/finance/revenue/settle',{key:unit.key,fingerprint:unit.fingerprint,configVersion:report.config.version},admin)).status,201);
  const cfg = {expectedVersion:0,game:{basis:'margin',platformBps:2500,processingBps:0},coaching:{basis:'margin',platformBps:2500,processingBps:0,platformFixedSatang:-1}};
  assert.equal((await f.request('/api/finance/revenue/config',cfg,admin)).status,400);
  const catalog = await (await f.request('/api/coach-catalog')).json();
  assert.equal(catalog.demo,false); assert.equal(catalog.coaches[0].bookingFee,undefined); assert.equal(catalog.enrollments,undefined);
});

test('venue editing and coach head fees obey operator permissions on the server', async t => {
  const f=fixture(t), owner=await f.signIn();
  const invitation=await(await f.request('/api/finance/admin-team',{action:'invite',role:'operator'},owner)).json();
  const login=await f.request('/api/finance/auth',{idToken:'test-line-token-staff',pairingToken:invitation.code});
  assert.equal(login.status,200);
  const operator={Cookie:login.headers.get('set-cookie')!.split(';')[0]};
  const venue=await(await f.request('/api/marketplace/venues',{name:'Test Court',area:'Test',address:'',active:true},operator)).json();
  assert.ok(venue.id);
  assert.equal((await(await f.request('/api/venues')).json()).venues.length,1);
  await f.request('/api/marketplace/venues/'+venue.id,{...venue,active:false},operator);
  assert.equal((await(await f.request('/api/venues')).json()).venues.length,0);
  const coach={name:'Test',specialty:'Test',bio:'',venue:'Court',hourlyRate:600,active:true};
  assert.equal((await f.request('/api/coaching/coaches',{...coach,bookingFee:100},operator)).status,403);
  assert.equal((await f.request('/api/coaching/coaches',coach,operator)).status,201);
  const catalog=await(await f.request('/api/coach-catalog')).json();
  assert.equal(catalog.coaches[0].bookingReady,false);
});

test('organizer releases unpaid game reservations, but cannot cancel payments or pending slips', async t => {
  const f=fixture(t),owner=await f.signIn();
  f.docs.set('transfer-account',{bankName:'test',accountName:'test',accountNumber:'0000000000'});
  f.docs.set('worker-pilot',{bookingEnabled:true});
  const id=(await(await f.request('/api/player/bookings',{sessionId:'game'},f.player('a'))).json()).booking.id;
  const path='/api/marketplace/bookings/'+id+'/cancel';
  assert.equal((await f.request(path,{})).status,401);
  assert.equal((await f.request(path,{},owner)).status,200);
  assert.equal(f.data.bookings[0].cancelledBy,'organizer');
  assert.equal((await f.request(path,{},owner)).status,200);
  const next=(await(await f.request('/api/player/bookings',{sessionId:'game'},f.player('a'))).json()).booking.id;
  f.data.bookings[1].paidAt=new Date().toISOString();
  assert.equal((await f.request('/api/marketplace/bookings/'+next+'/cancel',{},owner)).status,409);
  f.data.bookings[1].paidAt=undefined;
  f.data.bookings[1].receipts=[{id:'pending',fileName:'test',mimeType:'image/png',size:1,submittedAt:new Date().toISOString(),status:'pending',ocr:{status:'unavailable',amount:null,transferredAt:null,reference:null,sender:null,receiver:null,rawText:null,confidence:null}}];
  assert.equal((await f.request('/api/marketplace/bookings/'+next+'/cancel',{},owner)).status,409);
});

function fixture(t: TestContext) {
  const data: MarketplaceData = { sessions: [{ id:'game',title:'ก๊วนทดสอบ',venue:'สนาม',area:'ขอนแก่น',date:'',time:'18–20',price:190,joined:0,capacity:4,dupr:'<3.5',vibe:'เบา–กลาง',host:'ผู้จัด',hostRating:0,courtCount:1,venueCost:0,tags:[],startsAt:new Date(Date.now()+86400000).toISOString(),status:'open' }], bookings:[] };
  const docs = new Map<string,unknown>(), images = new Map<string,ArrayBuffer>(); let tail = Promise.resolve();
  const lock = async <T>(fn:()=>T|Promise<T>) => { const previous=tail; let release:()=>void; tail=new Promise<void>(r=>release=r); await previous; try { return await fn(); } finally { release!(); } };
  t.mock.method(TidbDocuments.prototype,'readMarketplace',async()=>structuredClone(data));
  t.mock.method(TidbDocuments.prototype,'readDocument',async(key:string,fallback:unknown)=>structuredClone(docs.get(key)??fallback));
  t.mock.method(TidbDocuments.prototype,'readTransferAccount',async()=>structuredClone(docs.get('transfer-account')||null));
  t.mock.method(TidbDocuments.prototype,'updateDocument',async(key:string,fallback:unknown,mutate:(v:any)=>unknown)=>lock(async()=>{ const v=structuredClone(docs.get(key)??fallback); const result=await mutate(v); docs.set(key,v); return result; }));
  t.mock.method(TidbDocuments.prototype,'updateMarketplace',async(mutate:(v:MarketplaceData,ctx:PilotContext)=>unknown)=>lock(async()=>{ const copy=structuredClone(data); const r=await mutate(copy,{account:docs.get('transfer-account') as any,enabled:(docs.get('worker-pilot') as any)?.bookingEnabled===true,paymentProvider:(docs.get('worker-pilot') as any)?.paymentProvider || 'manual',closed:(docs.get('revenue-settlements') as any[]||[]).map(r=>r.key)}); Object.assign(data,copy); return r; }));
  const financialSnapshot=()=>({marketplace:structuredClone(data),finance:structuredClone(docs.get('finance')||[]),coaching:structuredClone(docs.get('coaching')||[]),'coach-profiles':structuredClone(docs.get('coach-profiles')||[]),'coach-slots':structuredClone(docs.get('coach-slots')||[]),'revenue-config':structuredClone(docs.get('revenue-config')||[]),'revenue-settlements':structuredClone(docs.get('revenue-settlements')||[])});
  t.mock.method(TidbDocuments.prototype,'readFinance',async()=>financialSnapshot());
  t.mock.method(TidbDocuments.prototype,'updateFinance',async(mutate:(v:any,ctx:PilotContext)=>unknown)=>lock(async()=>{const v=financialSnapshot();const result=await mutate(v,{account:docs.get('transfer-account') as any,enabled:(docs.get('worker-pilot') as any)?.bookingEnabled===true,paymentProvider:(docs.get('worker-pilot') as any)?.paymentProvider || 'manual',closed:(docs.get('revenue-settlements') as any[]||[]).map(r=>r.key)});Object.assign(data,v.marketplace);for(const key of ['finance','coaching','coach-profiles','coach-slots','revenue-config','revenue-settlements'])docs.set(key,v[key]);return result;}));
  const env:PilotEnv={TIDB_DATABASE_URL:'mysql://fixture:fixture@gateway01.ap-southeast-1.prod.aws.tidbcloud.com/test',LINE_CHANNEL_ID:'test-channel',VITE_LIFF_ID:'test-liff',ADMIN_SESSION_SECRET:'test-only-secret-for-cookie-signing',ADMIN_PAIRING_TOKEN:'TEST12CODEAB',RECEIPTS:{put:async(k,v)=>{images.set(k,v);},get:async k=>images.get(k)||null,delete:async k=>{images.delete(k);}}};
  const verify=async(token:string)=>{if(!token.startsWith('test-line-token-'))throw Error('invalid'); return {sub:token.slice(16),name:token.slice(16)};};
  const request=async(path:string,body?:unknown,headers:Record<string,string>={},method=body===undefined?'GET':'POST')=>pilotRequest(new Request('https://example.com'+path,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)}),env,verify);
  const player=(id:string)=>({Authorization:'Bearer test-line-token-player-'+id});
  const signIn=async()=>{ const r=await request('/api/finance/auth',{idToken:'test-line-token-owner',pairingToken:"  "+env.ADMIN_PAIRING_TOKEN.toLowerCase()+"  "}); assert.equal(r.status,200); return {Cookie:r.headers.get('set-cookie')!.split(';')[0]}; };
  return {data,docs,images,env,verify,request,player,signIn};
}

test('LINE organizer pairing is one-time, private, cookie signed and restricted to owner',async t=>{
  const f=fixture(t);
  assert.equal((await f.request('/api/marketplace')).status,401);
  assert.equal((await f.request('/api/finance/auth',{idToken:'test-line-token-owner',pairingToken:'wrong'})).status,403);
  const admin=await f.signIn(); assert.ok(f.docs.get(organizerKey));
  assert.equal((await f.request('/api/marketplace',undefined,admin)).status,200);
  assert.equal((await f.request('/api/finance/auth',{idToken:'test-line-token-stranger',pairingToken:f.env.ADMIN_PAIRING_TOKEN})).status,403);
  assert.equal((await f.request('/api/marketplace',undefined,{Cookie:admin.Cookie.slice(0,-1)+'z'})).status,401);
  assert.equal((await f.request('/api/marketplace/setup/pilot',{bookingEnabled:true},{...admin,Origin:'https://other.example'})).status,403);
  assert.equal((await f.request('/api/finance/logout')).status,405);
});
test('private uploads reject strangers, invalid files and reuse across bookings without orphan images', async t => {
  const f=fixture(t); await f.signIn(); f.docs.set('transfer-account',{bankName:'test',accountName:'test',accountNumber:'0000000000'}); f.docs.set('worker-pilot',{bookingEnabled:true});
  const ids=[]; for(const who of ['a','b']) ids.push((await (await f.request('/api/player/bookings',{sessionId:'game'},f.player(who))).json()).booking.id);
  const upload=(id:string,who:string,content:Uint8Array,type='image/png')=>pilotRequest(new Request(`https://example.com/api/player/bookings/${id}/receipt`,{method:'POST',headers:{...f.player(who),'Content-Type':type},body:new Uint8Array(content).buffer}),f.env,f.verify);
  const png=new Uint8Array([137,80,78,71,13,10,26,10,1]);
  assert.equal((await upload(ids[0],'b',png)).status,404); assert.equal(f.images.size,0);
  assert.equal((await upload(ids[0],'a',new Uint8Array([1,2,3]))).status,415);
  assert.equal((await upload(ids[0],'a',new Uint8Array(5*1024*1024+1))).status,413);
  assert.equal((await upload(ids[0],'a',png)).status,201);
  assert.equal((await upload(ids[1],'b',png)).status,409); assert.equal(f.images.size,1);
  assert.equal(f.data.bookings[1].receipts,undefined);
});
test('unknown database commit outcome retains receipt evidence; daily upload quota is durable', async t => {
  const f=fixture(t); await f.signIn(); f.docs.set('transfer-account',{bankName:'test',accountName:'test',accountNumber:'0000000000'}); f.docs.set('worker-pilot',{bookingEnabled:true});
  const id=(await (await f.request('/api/player/bookings',{sessionId:'game'},f.player('a'))).json()).booking.id;
  t.mock.method(TidbDocuments.prototype,'updateFinance',async()=>{throw Error('unknown commit outcome');});
  const upload=()=>pilotRequest(new Request(`https://example.com/api/player/bookings/${id}/receipt`,{method:'POST',headers:{...f.player('a'),'Content-Type':'image/png'},body:new Uint8Array([137,80,78,71,13,10,26,10,2])}),f.env,f.verify);
  t.mock.method(console,'error',()=>{});
  for(let n=0;n<20;n++) assert.equal((await upload()).status,503);
  assert.equal(f.images.size,20); assert.equal((await upload()).status,429); assert.equal(f.images.size,20);
});
test('pilot booking, private slip, rejection/resubmission, manual funds approval and organizer admission',async t=>{
  const f=fixture(t),admin=await f.signIn(),player=f.player('player');
  assert.equal((await f.request('/api/player/bookings',{sessionId:'game'},player)).status,503);
  assert.equal((await f.request('/api/marketplace/setup/pilot',{bookingEnabled:true},admin)).status,409);
  assert.equal((await f.request('/api/marketplace/setup/transfer-account',{bankName:'ธนาคารทดสอบ',accountName:'บัญชีจำลอง',accountNumber:'0000000000'},admin)).status,200);
  f.docs.set('court-venues', [{ id: 'court', name: 'สนาม', area: 'ขอนแก่น', address: '', active: true }]);
  await f.request('/api/marketplace/setup/pilot',{bookingEnabled:true},admin);
  assert.equal((await (await f.request('/api/player/config')).json()).bookingEnabled,true);
  const created=await f.request('/api/player/bookings',{sessionId:'game',amount:1,playerId:'other'},player); assert.equal(created.status,201);
  const id=(await created.json()).booking.id; assert.equal(f.data.bookings[0].amount,19000);
  assert.equal((await f.request('/api/player/bookings',{sessionId:'game'},player)).status,200); assert.equal(f.data.bookings.length,1);
  assert.equal((await f.request(`/api/marketplace/bookings/${id}/admission`,{action:'approve'},admin)).status,409);
  const upload=()=>pilotRequest(new Request(`https://example.com/api/player/bookings/${id}/receipt`,{method:'POST',headers:{...player,'Content-Type':'image/png'},body:new Uint8Array([137,80,78,71,13,10,26,10,1])}),f.env,f.verify);
  const first=await upload(); assert.equal(first.status,201); const receiptId=(await first.json()).receipt.id;
  assert.equal((await upload()).status,409); assert.equal(f.images.size,1);
  assert.equal((await f.request(`/api/marketplace/bookings/${id}/receipts/${receiptId}`)).status,401);
  assert.equal((await f.request(`/api/marketplace/bookings/${id}/receipts/${receiptId}`,undefined,admin)).status,200);
  assert.equal((await f.request(`/api/marketplace/bookings/${id}/receipts/${receiptId}/review`,{action:'reject',reason:'ภาพไม่ชัด'},admin)).status,200);
  const second=await upload(),next=(await second.json()).receipt.id; assert.equal(second.status,201);
  assert.equal((await f.request(`/api/marketplace/bookings/${id}/receipts/${next}/review`,{action:'approve'},admin)).status,400);
  assert.equal((await f.request(`/api/marketplace/bookings/${id}/receipts/${next}/review`,{action:'approve',fundsChecked:true},admin)).status,400);
  assert.equal((await f.request(`/api/marketplace/bookings/${id}/receipts/${next}/review`,{action:'approve',fundsChecked:true,transferReference:'TEST-GAME-0001',receivedAmount:190},admin)).status,200);
  assert.equal(f.data.bookings[0].admissionStatus,'pending');
  assert.equal((await f.request(`/api/marketplace/bookings/${id}/receipts/${next}/review`,{action:'approve',fundsChecked:true},admin)).status,409);
  assert.equal((await f.request(`/api/marketplace/bookings/${id}/admission`,{action:'approve'},admin)).status,200);
  assert.equal((await f.request(`/api/player/bookings/${id}/cancel`,{},player)).status,409);
  assert.equal((await f.request(`/api/player/bookings/${id}/cancel`,{},f.player('stranger'))).status,404);
});
test('concurrent last seat and retry never oversell or create duplicate active bookings',async t=>{
  const f=fixture(t); await f.signIn(); f.docs.set('transfer-account',{bankName:'test',accountName:'test',accountNumber:'0000000000'});f.docs.set('worker-pilot',{bookingEnabled:true});
  for(const id of ['a','b','c'])await f.request('/api/player/bookings',{sessionId:'game'},f.player(id));
  const results=await Promise.all(['d','e'].map(id=>f.request('/api/player/bookings',{sessionId:'game'},f.player(id))));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(f.data.bookings.length,4);
  const retry=await f.request('/api/player/bookings',{sessionId:'game'},f.player('d')); assert.equal(retry.status,200);
});

test('LINE finance joins real-source receipts, ledger, commissions and immutable team distribution',async t=>{
  const f=fixture(t),admin=await f.signIn();
  assert.equal((await f.request('/api/finance/report')).status,401);
  assert.equal((await f.request('/api/finance/revenue')).status,401);
  f.data.bookings.push({id:'paid',sessionId:'game',playerId:'line:a',playerName:'Test',title:'Game',amount:19000,createdAt:new Date().toISOString(),paidAt:new Date().toISOString(),paymentMethod:'transfer',admissionStatus:'pending'});
  const cfg={expectedVersion:0,game:{basis:'margin',platformBps:2500,processingBps:0},coaching:{basis:'gross',platformBps:1000,processingBps:0},platformAllocation:{developerBps:1000,marketingBps:2000,confirmed:true}};
  assert.equal((await f.request('/api/finance/revenue/config',{...cfg,platformAllocation:{...cfg.platformAllocation,marketingBps:9500}},admin)).status,400);
  assert.equal((await f.request('/api/finance/revenue/config',cfg,{...admin,Origin:'https://foreign.example'})).status,403);
  assert.equal((await f.request('/api/finance/revenue/config',cfg,admin)).status,200);
  assert.equal((await f.request('/api/finance/revenue/config',cfg,admin)).status,409);
  const draft={type:'expense',category:'venue',amount:3000,description:'=TEST()',counterparty:'Court',date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'}),method:'transfer',status:'pending',reference:'',requestId:crypto.randomUUID(),allocationKey:'game:game'};
  assert.equal((await f.request('/api/finance/entries',{...draft,amount:1.5},admin)).status,400);
  const added=await f.request('/api/finance/entries',draft,admin);assert.equal(added.status,201);
  const cost=(await added.json()).id;
  assert.equal((await f.request('/api/finance/entries',draft,admin)).status,200);
  let report=await(await f.request('/api/finance/report',undefined,admin)).json();assert.equal(report.summary.income,19000);assert.equal(report.summary.pendingExpense,3000);assert.equal(report.rows.length,2);
  assert.equal((await f.request('/api/finance/entries/booking_paid',{action:'void',reason:'fake'},admin)).status,409);
  assert.equal((await f.request('/api/finance/report?from=2026-02-30',undefined,admin)).status,400);
  const csv=await f.request('/api/finance/export',undefined,admin);assert.equal(csv.status,200);assert.match(await csv.text(),/'=TEST/);
  let rev=await(await f.request('/api/finance/revenue',undefined,admin)).json(),unit=rev.units[0];
  assert.equal(unit.platform,4000);assert.equal(unit.partner,12000);assert.deepEqual(rev.platformDistribution,{developer:400,marketing:800,retained:2800,unconfigured:0});
  assert.equal((await f.request('/api/finance/revenue/settle',{key:unit.key,fingerprint:'stale',configVersion:1},admin)).status,409);
  assert.equal((await f.request('/api/finance/revenue/settle',{key:unit.key,fingerprint:unit.fingerprint,configVersion:1},admin)).status,201);
  assert.equal((await f.request('/api/finance/revenue/settle',{key:unit.key,fingerprint:unit.fingerprint,configVersion:1},admin)).status,409);
  assert.equal((await f.request('/api/finance/entries/'+cost,{action:'settle',settledOn:draft.date},admin)).status,200);
  assert.equal((await f.request('/api/finance/entries/'+cost,{action:'void',reason:'fake'},admin)).status,409);
  assert.equal((await f.request('/api/finance/entries',{...draft,requestId:crypto.randomUUID()},admin)).status,409);
  assert.equal((await f.request('/api/finance/revenue/config',{...cfg,expectedVersion:1,game:{...cfg.game,platformBps:5000},platformAllocation:{developerBps:9000,marketingBps:0,confirmed:true}},admin)).status,200);
  rev=await(await f.request('/api/finance/revenue',undefined,admin)).json();assert.equal(rev.units[0].platform,4000);assert.equal(rev.units[0].changed,false);assert.equal(rev.platformDistribution.developer,400);
  const payout={...draft,category:'organizer',amount:12000,requestId:crypto.randomUUID()};
  const attempts=await Promise.all([payout,{...payout,requestId:crypto.randomUUID()}].map(d=>f.request('/api/finance/entries',d,admin)));
  assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);
  const paid=await attempts.find(r=>r.status===201).json();
  assert.equal((await f.request('/api/finance/entries',{...payout,requestId:paid.id.slice('manual_'.length)},admin)).status,200);
  f.data.bookings[0].amount+=100;
  assert.equal((await f.request('/api/finance/entries/'+paid.id,{action:'settle',settledOn:draft.date},admin)).status,409);
});
test('closing rejects unresolved bookings and prevents new bookings after settlement',async t=>{
  const f=fixture(t),admin=await f.signIn();
  f.data.bookings.push({id:'paid',sessionId:'game',playerId:'line:a',playerName:'A',title:'Game',amount:19000,createdAt:new Date().toISOString(),paidAt:new Date().toISOString()},{id:'waiting',sessionId:'game',playerId:'line:b',playerName:'B',title:'Game',amount:19000,createdAt:new Date().toISOString()});
  await f.request('/api/finance/revenue/config',{expectedVersion:0,game:{basis:'margin',platformBps:2500,processingBps:0},coaching:{basis:'margin',platformBps:2500,processingBps:0}},admin);
  let unit=(await(await f.request('/api/finance/revenue',undefined,admin)).json()).units[0];
  assert.equal((await f.request('/api/finance/revenue/settle',{key:unit.key,fingerprint:unit.fingerprint,configVersion:1},admin)).status,409);
  f.data.bookings[1].cancelledAt=new Date().toISOString();
  assert.equal((await f.request('/api/finance/revenue/settle',{key:unit.key,fingerprint:unit.fingerprint,configVersion:1},admin)).status,201);
  f.docs.set('worker-pilot',{bookingEnabled:true});f.docs.set('transfer-account',{bankName:'test',accountName:'test',accountNumber:'0000000000'});
  assert.equal((await f.request('/api/player/bookings',{sessionId:'game'},f.player('new'))).status,409);
});


test('team roles protect platform settings, financial writes and private receipts at the API', async t => {
  const f=fixture(t), owner=await f.signIn();
  const sessions:Record<string,Record<string,string>>={};
  for(const role of ['operator','finance','viewer']) {
    const issued=await f.request('/api/finance/admin-team',{action:'invite',role},owner);assert.equal(issued.status,201);
    const {code}=await issued.json();assert.match(code,/^[A-Z2-9]{12}$/);
    const login=await f.request('/api/finance/auth',{idToken:'test-line-token-'+role,pairingToken:code.toLowerCase()});assert.equal(login.status,200);
    sessions[role]={Cookie:login.headers.get('set-cookie')!.split(';')[0]};
  }
  const {operator,finance,viewer}=sessions;
  assert.equal((await f.request('/api/marketplace',undefined,operator)).status,200);
  assert.equal((await f.request('/api/finance/report',undefined,operator)).status,403);
  for(const staff of [operator,finance,viewer]) {
    assert.equal((await f.request('/api/finance/revenue/config',{},staff)).status,403);
    assert.equal((await f.request('/api/marketplace/setup/transfer-account',{},staff)).status,403);
    assert.equal((await f.request('/api/marketplace/setup/pilot',{},staff)).status,403);
    assert.equal((await f.request('/api/finance/admin-team',{action:'invite',role:'owner'},staff)).status,403);
    assert.equal((await f.request('/api/finance/admin-team',undefined,staff)).status,403);
  }
  assert.equal((await f.request('/api/finance/report',undefined,finance)).status,200);
  assert.equal((await f.request('/api/marketplace/bookings/missing/admission',{action:'approve'},finance)).status,403);
  assert.equal((await f.request('/api/finance/report',undefined,viewer)).status,200);
  assert.equal((await f.request('/api/finance/revenue',undefined,viewer)).status,200);
  assert.equal((await f.request('/api/finance/entries',{},viewer)).status,403);
  assert.equal((await f.request('/api/finance/revenue/settle',{},viewer)).status,403);
  assert.equal((await f.request('/api/marketplace',undefined,viewer)).status,403);
  assert.equal((await f.request('/api/marketplace/bookings/missing/receipts/missing',undefined,viewer)).status,403);
  f.docs.set('transfer-account',{bankName:'private',accountName:'private',accountNumber:'0000000000'});
  assert.equal((await (await f.request('/api/marketplace/setup',undefined,viewer)).json()).transferAccount,null);
  assert.equal((await f.request('/api/finance/admin-team',{action:'invite',role:'owner'},owner)).status,400);
  const publicTeam=await(await f.request('/api/finance/admin-team',undefined,owner)).text();assert.doesNotMatch(publicTeam,/"(hash|sub|version)":/);
  const draft={requestId:crypto.randomUUID(),type:'expense',category:'other_expense',description:'test',counterparty:'test',amount:100,date:new Date().toISOString().slice(0,10),method:'transfer',status:'pending',reference:''};
  assert.equal((await f.request('/api/finance/entries',draft,finance)).status,201);
  assert.equal((await f.request('/api/finance/entries',draft,operator)).status,403);
  const members=(await(await f.request('/api/finance/admin-team',undefined,owner)).json()).members;
  const member=members.find((m:any)=>m.role==='operator');
  assert.equal((await f.request('/api/finance/admin-team',{action:'role',id:member.id,role:'viewer'},owner)).status,200);
  assert.equal((await f.request('/api/marketplace',undefined,operator)).status,401);
  const again=await f.request('/api/finance/auth',{idToken:'test-line-token-operator'});assert.equal(again.status,200);
  const updated={Cookie:again.headers.get('set-cookie')!.split(';')[0]};
  assert.equal((await f.request('/api/finance/report',undefined,updated)).status,200);
  assert.equal((await f.request('/api/marketplace',undefined,updated)).status,403);
  assert.equal((await f.request('/api/finance/admin-team',{action:'revoke',id:member.id},owner)).status,200);
  assert.equal((await f.request('/api/finance/report',undefined,updated)).status,401);
  assert.equal((await f.request('/api/finance/auth',{idToken:'test-line-token-operator'})).status,403);
  assert.equal((await f.request('/api/marketplace',undefined,owner)).status,200);
});

test('invitations are atomic, one use, expiring and revocable without sharing owner pairing',async t=>{
  const f=fixture(t), owner=await f.signIn();
  const issued=await(await f.request('/api/finance/admin-team',{action:'invite',role:'operator'},owner)).json();
  const attempts=await Promise.all(['a','b'].map(id=>f.request('/api/finance/auth',{idToken:'test-line-token-guest-'+id,pairingToken:issued.code})));
  assert.deepEqual(attempts.map(r=>r.status).sort(),[200,403]);
  assert.equal((await f.request('/api/finance/auth',{idToken:'test-line-token-guest-c',pairingToken:issued.code})).status,403);
  const cancelled=await(await f.request('/api/finance/admin-team',{action:'invite',role:'finance'},owner)).json();
  await f.request('/api/finance/admin-team',{action:'cancel-invite',id:cancelled.invitation.id},owner);
  assert.equal((await f.request('/api/finance/auth',{idToken:'test-line-token-guest-c',pairingToken:cancelled.code})).status,403);
  const expired=await(await f.request('/api/finance/admin-team',{action:'invite',role:'viewer'},owner)).json();
  const team=f.docs.get('worker-admin-team') as any;team.invitations.find((i:any)=>i.id===expired.invitation.id).expiresAt=new Date(Date.now()-1).toISOString();
  assert.equal((await f.request('/api/finance/auth',{idToken:'test-line-token-guest-c',pairingToken:expired.code})).status,403);
  const current=await(await f.request('/api/finance/admin-team',{action:'invite',role:'viewer'},owner)).json();
  assert.equal((await f.request('/api/finance/auth',{idToken:'test-line-token-guest-c',pairingToken:current.code},{Origin:'https://evil.example'})).status,403);
  assert.equal((await f.request('/api/finance/admin-team',{action:'invite',role:'operator'},{...owner,Origin:'https://evil.example'})).status,403);
});

test('one staff member can combine operations and finance without gaining owner privileges', async t => {
  const f = fixture(t), owner = await f.signIn();
  const issued = await (await f.request('/api/finance/admin-team', { action: 'invite', roles: ['finance', 'operator', 'finance'] }, owner)).json();
  assert.deepEqual(issued.invitation.roles, ['operator', 'finance']);
  const login = await f.request('/api/finance/auth', { idToken: 'test-line-token-combined', pairingToken: issued.code });
  assert.deepEqual((await login.json()).roles, ['operator', 'finance']);
  const staff = { Cookie: login.headers.get('set-cookie')!.split(';')[0] };
  assert.equal((await f.request('/api/marketplace', undefined, staff)).status, 200);
  assert.equal((await f.request('/api/finance/report', undefined, staff)).status, 200);
  assert.equal((await f.request('/api/finance/entries', { requestId: crypto.randomUUID(), type: 'expense', category: 'other_expense', description: 'test', counterparty: 'test', amount: 100, date: new Date().toISOString().slice(0,10), method: 'transfer', status: 'pending', reference: '' }, staff)).status, 201);
  for (const path of ['/api/marketplace/setup/payment', '/api/marketplace/setup/pilot', '/api/finance/revenue/config', '/api/finance/admin-team']) assert.equal((await f.request(path, {}, staff)).status, 403);
  for (const roles of [[], ['owner'], ['operator', 'unknown'], 'operator']) assert.equal((await f.request('/api/finance/admin-team', { action: 'invite', roles }, owner)).status, 400);
  const team = await (await f.request('/api/finance/admin-team', undefined, owner)).json();
  assert.equal((await f.request('/api/finance/admin-team', { action: 'role', id: team.members[0].id, roles: ['operator'] }, owner)).status, 200);
  assert.equal((await f.request('/api/marketplace', undefined, staff)).status, 401);
  const refreshed = await f.request('/api/finance/auth', { idToken: 'test-line-token-combined' });
  const reduced = { Cookie: refreshed.headers.get('set-cookie')!.split(';')[0] };
  assert.equal((await f.request('/api/marketplace', undefined, reduced)).status, 200);
  assert.equal((await f.request('/api/finance/report', undefined, reduced)).status, 403);
  // Legacy rows without roles still work; invalid present arrays cannot fall back to a privileged role.
  const saved = f.docs.get('worker-admin-team') as any; delete saved.members[0].roles;
  assert.equal((await f.request('/api/marketplace', undefined, reduced)).status, 200);
  saved.members[0].roles = ['owner'];
  assert.equal((await f.request('/api/marketplace', undefined, reduced)).status, 401);
});

test('new Stripe Checkout is retired even with stale settings; transfer booking preserves server pricing and ownership', async t => {
  const f = fixture(t), owner = await f.signIn();
  Object.assign(f.env, { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture', PUBLIC_APP_URL: 'https://example.com' });
  f.docs.set('transfer-account', { bankName: 'Test', accountName: 'Test', accountNumber: '0000000000' });
  f.docs.set('worker-pilot', { bookingEnabled: true, paymentProvider: 'stripe' });
  assert.equal((await f.request('/api/marketplace/setup/payment', { paymentProvider: 'stripe' }, owner)).status, 410);
  const id = (await (await f.request('/api/player/bookings', { sessionId: 'game', amount: 1 }, f.player('a'))).json()).booking.id;
  assert.equal(f.data.bookings[0].amount, 19000); assert.ok(f.data.bookings[0].transferAccount);
  assert.equal((await f.request('/api/player/payments/checkout', { kind: 'game', id }, f.player('b'))).status, 404);
  assert.equal((await f.request('/api/player/payments/checkout', { kind: 'game', id }, f.player('a'))).status, 410);
  const config = await (await f.request('/api/player/config')).json(); assert.equal(config.paymentProvider, 'manual'); assert.equal(config.stripeRetired, true);
  assert.equal(f.data.bookings[0].stripe, undefined);
  assert.equal((await f.request('/api/player/bookings/' + id + '/cancel', {}, f.player('a'))).status, 200);
  assert.equal((await f.request('/api/stripe/webhook', {}, {}, 'POST')).status, 400);
});

test('verified Stripe results are idempotent, charge fees before shares, require admission, and isolate test payments', async t => {
  const f = fixture(t); await f.signIn();
  f.data.bookings.push({ id: 'booking', sessionId: 'game', playerId: 'line:a', playerName: 'a', title: 'Test', amount: 19000, createdAt: new Date().toISOString(), admissionStatus: 'pending' });
  const makeSession = (docs: any, mode: 'live' | 'test', intent = 'pi_fixture') => {
    const p = prepareCheckout(docs, {sub:'a',name:'a'}, 'game', 'booking', mode).payment;
    const session = { id: 'cs_' + mode, url: 'https://checkout.stripe.com/c/pay/test', metadata: { app:'chick-pick',kind:'game',bookingId:'booking',attemptId:p.attemptId }, client_reference_id:'booking',currency:'thb',amount_total:19000,livemode:mode==='live',expires_at:Math.floor(Date.now()/1000)+1860,status:'complete',payment_status:'paid',payment_intent:{id:intent,status:'succeeded',currency:'thb',amount_received:19000,latest_charge:{id:'ch_test',created:Math.floor(Date.now()/1000),payment_method_details:{type:'promptpay'},balance_transaction:{currency:'thb',fee:250}}}} as unknown as Stripe.Checkout.Session;
    attachCheckout(docs,'game','booking',p.attemptId,session); return session;
  };
  const testDocs = await new TidbDocuments(f.env.TIDB_DATABASE_URL!).readFinance();
  const testSession = makeSession(testDocs,'test');
  assert.deepEqual(applyStripeSession(testDocs,testSession,'test','evt_test'),{testPaid:true});
  assert.equal(testDocs.marketplace.bookings[0].paidAt,undefined); assert.equal(testDocs.finance.length,0);
  const docs = await new TidbDocuments(f.env.TIDB_DATABASE_URL!).readFinance(), session = makeSession(docs,'live');
  assert.throws(()=>applyStripeSession(docs,{...session,amount_total:1},'live','evt_bad'));
  assert.throws(()=>applyStripeSession(docs,{...session,livemode:false},'live','evt_bad'));
  assert.deepEqual(applyStripeSession(docs,session,'live','evt_1'),{paid:true});
  assert.deepEqual(applyStripeSession(docs,session,'live','evt_1'),{repeated:true});
  assert.equal(docs.finance.length,1); assert.equal(docs.finance[0].amount,250); assert.equal(docs.finance[0].allocationKey,'game:game');
  assert.equal(docs.marketplace.bookings[0].admissionStatus,'pending');
  assert.throws(()=>cancel(docs.marketplace,{sub:'a',name:'a'},'booking'));
  const late = await new TidbDocuments(f.env.TIDB_DATABASE_URL!).readFinance(), lateSession = makeSession(late,'live','pi_late');
  late.marketplace.bookings[0].cancelledAt = new Date().toISOString();
  assert.deepEqual(applyStripeSession(late,lateSession,'live','evt_late'),{requiresReview:true});
  assert.equal(late.marketplace.bookings[0].paidAt,undefined); assert.equal(late.marketplace.bookings[0].stripe!.status,'requires_review');
});

test('signed Stripe webhook verifies the retrieved transaction, retries missing fees and rejects replay alterations', async t => {
  const f = fixture(t), owner = await f.signIn();
  Object.assign(f.env, { STRIPE_SECRET_KEY: 'sk_live_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture', PUBLIC_APP_URL: 'https://example.com' });
  f.data.bookings.push({ id: 'webhook-booking', sessionId: 'game', playerId: 'line:a', playerName: 'a', title: 'Test', amount: 19000, createdAt: new Date().toISOString(), admissionStatus: 'pending' });
  const db = new TidbDocuments(f.env.TIDB_DATABASE_URL!);
  const p = await db.updateFinance(docs => prepareCheckout(docs, { sub: 'a', name: 'a' }, 'game', 'webhook-booking', 'live').payment, stripeAudit);
  let session = { id: 'cs_webhook', url: 'https://checkout.stripe.com/c/pay/test', metadata: { app: 'chick-pick', kind: 'game', bookingId: 'webhook-booking', attemptId: p.attemptId }, client_reference_id: 'webhook-booking', currency: 'thb', amount_total: 19000, livemode: true, expires_at: Math.floor(Date.now()/1000)+1860, status: 'complete', payment_status: 'paid', payment_intent: { id: 'pi_webhook', status: 'succeeded', currency: 'thb', amount_received: 19000, latest_charge: { created: Math.floor(Date.now()/1000), payment_method_details: { type: 'promptpay' }, balance_transaction: null as any } } };
  await db.updateFinance(docs => attachCheckout(docs, 'game', 'webhook-booking', p.attemptId, session as any), stripeAudit);
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async (url: any, init: any) => {
    assert.equal(new URL(String(url)).host, 'api.stripe.com'); assert.equal(init.method, 'GET'); reads++;
    assert.match(String(url), /checkout\/sessions\/cs_webhook/);
    return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } });
  });
  const stripe = new Stripe('sk_test_fixture');
  const send = (livemode = true, changes = '') => {
    const raw = JSON.stringify({ id: 'evt_fixture', type: 'checkout.session.completed', livemode, data: { object: { id: session.id, metadata: session.metadata } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload: raw, secret: f.env.STRIPE_WEBHOOK_SECRET! });
    return pilotRequest(new Request('https://example.com/api/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': signature }, body: raw + changes }), f.env, f.verify);
  };
  assert.equal((await send(true, ' ')).status, 400); assert.equal(reads, 0);
  assert.equal((await send(false)).status, 400); assert.equal(reads, 0);
  assert.equal((await send()).status, 503); assert.equal(f.data.bookings[0].paidAt, undefined);
  session.payment_intent.latest_charge.balance_transaction = { currency: 'thb', fee: 250 };
  session.amount_total = 1;
  assert.equal((await send()).status, 409); assert.equal(f.data.bookings[0].paidAt, undefined);
  session.amount_total = 19000;
  const results = await Promise.all([send(), send()]); assert.deepEqual(results.map(r => r.status), [200, 200]);
  assert.equal(f.data.bookings[0].stripe!.status, 'paid'); assert.equal(f.data.bookings[0].admissionStatus, 'pending');
  const report = await db.readFinance(); assert.equal(report.finance.length, 1); assert.equal(report.finance[0].amount, 250);
  assert.equal((await f.request('/api/finance/entries/stripe_fee_pi_webhook', { action: 'void', reason: 'override provider fee' }, owner)).status, 409);
  const publicBooking = (await db.readFinance()).marketplace.bookings[0];
  assert.ok(publicBooking.paidAt);
});

test('coach Stripe booking derives amount from its slot and holds it until Stripe confirms expiry', async t => {
  const f = fixture(t), owner = await f.signIn();
  Object.assign(f.env, { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture', PUBLIC_APP_URL: 'https://example.com' });
  f.docs.set('worker-pilot', { bookingEnabled: true, paymentProvider: 'stripe' });
  f.docs.set('transfer-account', { bankName: 'Test', accountName: 'Test', accountNumber: '0000000000' });
  const coach = await (await f.request('/api/coaching/coaches', { name: 'Test', specialty: 'Test', bio: '', venue: 'Court', hourlyRate: 550, bookingFee: 100, active: true }, owner)).json();
  const start = new Date(Math.ceil((Date.now() + 86400000) / 1800000) * 1800000).toISOString();
  const slot = await (await f.request('/api/coaching/slots', { coachId: coach.id, start, hours: 2, status: 'open' }, owner)).json();
  const response = await f.request('/api/player/lessons', { slotId: slot.id, amount: 1 }, f.player('a'));
  assert.equal(response.status, 201); const lesson = await response.json();
  const own = await (await f.request('/api/player/lessons', undefined, f.player('a'))).json();
  assert.equal(own.lessons[0].amount, 110000);
  const db = new TidbDocuments(f.env.TIDB_DATABASE_URL!);
  const p = await db.updateFinance(docs => prepareCheckout(docs, { sub: 'player-a', name: 'a' }, 'coaching', lesson.id, 'test').payment, stripeAudit);
  assert.equal(p.amount, 110000);
  await db.updateFinance(docs => { docs.coaching[0].holdExpiresAt = new Date(Date.now() - 1000).toISOString(); }, stripeAudit);
  let docs = await db.readFinance(); assert.equal(lessonHoldExpired(docs.coaching[0]), false);
  const session = { id: 'cs_expired', metadata: { app: 'chick-pick', kind: 'coaching', bookingId: lesson.id, attemptId: p.attemptId }, client_reference_id: lesson.id, amount_total: 110000, currency: 'thb', livemode: false, status: 'expired', payment_status: 'unpaid' } as any;
  await db.updateFinance(docs => applyStripeSession(docs, session, 'test', 'evt_expired'), stripeAudit);
  docs = await db.readFinance(); assert.equal(lessonHoldExpired(docs.coaching[0]), true); assert.equal(docs.coaching[0].paidAt, undefined);
});
