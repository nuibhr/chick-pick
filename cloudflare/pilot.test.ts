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
