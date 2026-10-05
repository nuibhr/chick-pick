import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { pilotRequest, type PilotEnv } from './pilot';
import { TidbDocuments } from './tidbDocuments';
import { organizerKey } from './pilotAuth';
import type { MarketplaceData } from '../src/marketplaceTypes';
import type { PilotContext } from './pilotDomain';

function fixture(t: TestContext) {
  const data: MarketplaceData = { sessions: [{ id:'game',title:'ก๊วนทดสอบ',venue:'สนาม',area:'ขอนแก่น',date:'',time:'18–20',price:190,joined:0,capacity:4,dupr:'<3.5',vibe:'เบา–กลาง',host:'ผู้จัด',hostRating:0,courtCount:1,venueCost:0,tags:[],startsAt:new Date(Date.now()+86400000).toISOString(),status:'open' }], bookings:[] };
  const docs = new Map<string,unknown>(), images = new Map<string,ArrayBuffer>(); let tail = Promise.resolve();
  const lock = async <T>(fn:()=>T|Promise<T>) => { const previous=tail; let release:()=>void; tail=new Promise<void>(r=>release=r); await previous; try { return await fn(); } finally { release!(); } };
  t.mock.method(TidbDocuments.prototype,'readMarketplace',async()=>structuredClone(data));
  t.mock.method(TidbDocuments.prototype,'readDocument',async(key:string,fallback:unknown)=>structuredClone(docs.get(key)??fallback));
  t.mock.method(TidbDocuments.prototype,'readTransferAccount',async()=>structuredClone(docs.get('transfer-account')||null));
  t.mock.method(TidbDocuments.prototype,'updateDocument',async(key:string,fallback:unknown,mutate:(v:any)=>unknown)=>lock(async()=>{ const v=structuredClone(docs.get(key)??fallback); const result=await mutate(v); docs.set(key,v); return result; }));
  t.mock.method(TidbDocuments.prototype,'updateMarketplace',async(mutate:(v:MarketplaceData,ctx:PilotContext)=>unknown)=>lock(async()=>{ const copy=structuredClone(data); const r=await mutate(copy,{account:docs.get('transfer-account') as any,enabled:(docs.get('worker-pilot') as any)?.bookingEnabled===true,closed:(docs.get('revenue-settlements') as any[]||[]).map(r=>r.key)}); Object.assign(data,copy); return r; }));
  const financialSnapshot=()=>({marketplace:structuredClone(data),finance:structuredClone(docs.get('finance')||[]),coaching:structuredClone(docs.get('coaching')||[]),'revenue-config':structuredClone(docs.get('revenue-config')||[]),'revenue-settlements':structuredClone(docs.get('revenue-settlements')||[])});
  t.mock.method(TidbDocuments.prototype,'readFinance',async()=>financialSnapshot());
  t.mock.method(TidbDocuments.prototype,'updateFinance',async(mutate:(v:any)=>unknown)=>lock(async()=>{const v=financialSnapshot();const result=await mutate(v);Object.assign(data,v.marketplace);for(const key of ['finance','coaching','revenue-config','revenue-settlements'])docs.set(key,v[key]);return result;}));
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
  t.mock.method(TidbDocuments.prototype,'updateMarketplace',async()=>{throw Error('unknown commit outcome');});
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
  assert.equal((await f.request(`/api/marketplace/bookings/${id}/receipts/${next}/review`,{action:'approve',fundsChecked:true},admin)).status,200);
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
