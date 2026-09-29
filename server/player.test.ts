import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { marketplaceRouter } from './marketplace';
import { playerRouter } from './player';
import { createFinance } from './finance';

test('LINE player surface exposes only public sessions and own bookings', async () => {
 const dir=mkdtempSync(path.join(tmpdir(),'cb-player-'));
 const file=path.join(dir,'marketplace.json');
 const app=express();app.use(express.json());
 marketplaceRouter(file,true);
 const alice='alice-valid-id-token-0123456789';
 const bob='bob-valid-id-token-012345678901';
 app.use('/player',playerRouter(file,'test-channel',async token=>{
  if(token===alice)return {sub:'alice',name:'Alice',picture:'https://profile.line-scdn.net/test-alice'};
  if(token===bob)return {sub:'bob',name:'Bob'};
  throw Error('invalid');
 },true));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const call=async(route:string,token?:string,body?:unknown)=>{
  const response=await fetch(base+route,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  return {status:response.status,data:await response.json()};
 };
 try{
  const catalog=await call('/player/sessions');assert.equal(catalog.status,200);
  assert.equal(catalog.data.sessions.length,3);
  assert.equal('venueCost' in catalog.data.sessions[0],false);
  assert.equal('transferAccount' in catalog.data.sessions[0],false);
  writeFileSync(path.join(dir,'transfer-settings.json'),JSON.stringify({bankName:'Test Bank',accountName:'Chick Pick',accountNumber:'1234567890'}));
  assert.equal((await call('/player/bookings')).status,401);
  assert.equal((await call('/player/bookings','invalid-token-long-enough-123')).status,401);
  const created=await call('/player/bookings',alice,{sessionId:'night-chicken'});
  assert.equal(created.status,201);
  assert.equal((await call('/player/bookings',alice)).data.bookings[0].transferAccount.accountNumber,'1234567890');
  assert.equal((await call('/player/bookings',bob)).data.bookings.length,0);
  writeFileSync(path.join(dir,'transfer-settings.json'),JSON.stringify({bankName:'New Bank',accountName:'Chick Pick',accountNumber:'0987654321'}));
  assert.equal((await call('/player/bookings',alice)).data.bookings[0].transferAccount.accountNumber,'1234567890');
  assert.equal((await call('/player/bookings',alice,{sessionId:'night-chicken'})).data.repeated,true);
  assert.equal((await call('/player/bookings',bob)).data.bookings.length,0);
  assert.equal((await call('/player/bookings',alice)).data.bookings.length,1);
  const hidden=(await call('/player/sessions')).data.sessions.find((s:{id:string})=>s.id==='night-chicken');
  assert.equal(hidden.joined,1);assert.equal(hidden.privateParticipantCount,1);assert.deepEqual(hidden.participants,[]);
  const saved=await call('/player/me/profile',alice,{discoverable:true,skill:3.5,bio:'ตีสนุกทุกวัน'});
  assert.equal(saved.status,200);
  const shown=(await call('/player/sessions')).data.sessions.find((s:{id:string})=>s.id==='night-chicken');
  assert.equal(shown.participants.length,1);assert.equal(shown.privateParticipantCount,0);
  assert.equal(shown.participants[0].name,'Alice');assert.equal(shown.participants[0].picture,'https://profile.line-scdn.net/test-alice');
  assert.equal(JSON.stringify(shown).includes('line:alice'),false);assert.equal(JSON.stringify(shown).includes(alice),false);
  assert.equal((await call('/player/me',bob)).data.profile.discoverable,false);
  assert.equal((await call('/player/me/profile',alice,{discoverable:false,skill:null,bio:''})).status,200);
  assert.deepEqual((await call('/player/sessions')).data.sessions.find((s:{id:string})=>s.id==='night-chicken').participants,[]);
  assert.equal((await call('/player/me/profile',alice,{discoverable:true,skill:5.2,bio:''})).status,400);
  assert.equal((await call('/player/me/profile',alice,{discoverable:true,skill:null,bio:''})).status,200);
  assert.equal((await call('/player/bookings/'+created.data.booking.id+'/cancel',bob,{})).status,404);
  assert.equal((await call('/player/bookings/'+created.data.booking.id+'/cancel',alice,{})).status,200);
  assert.equal((await call('/player/sessions')).data.sessions.find((s:{id:string})=>s.id==='night-chicken').joined,0);
  assert.deepEqual((await call('/player/sessions')).data.sessions.find((s:{id:string})=>s.id==='night-chicken').participants,[]);
  assert.ok((await call('/player/bookings',alice)).data.bookings[0].cancelledAt);
  assert.equal((await call('/player/bookings',alice,{sessionId:'night-chicken'})).status,201);
  assert.equal((await call('/player/bookings',alice)).data.bookings.at(-1).transferAccount.accountNumber,'0987654321');
  writeFileSync(path.join(dir,'revenue-settlements.json'),JSON.stringify([{key:'game:beginner'}]));
  assert.equal((await call('/player/bookings',bob,{sessionId:'beginner'})).status,409);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true});}
});

test('organizer marketplace requires admin session shared with finance', async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cb-gate-'));
 const app=express();app.use(express.json());
 const finance=createFinance(dir,true);
 app.use('/api/finance',finance.router);
 app.use('/api/marketplace',finance.requireAdmin,marketplaceRouter(path.join(dir,'marketplace.json'),true));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 try{
  assert.equal((await fetch(base+'/api/marketplace')).status,401);
  const login=await fetch(base+'/api/finance/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'test-organizer-password',setup:true})});
  assert.equal(login.status,200);
  assert.match(login.headers.get('set-cookie')||'',/Path=\/api/);
  const cookie=login.headers.get('set-cookie')!.split(';')[0];
  const authorized=await fetch(base+'/api/marketplace',{headers:{Cookie:cookie}});
  assert.equal(authorized.status,200);
  const account=await fetch(base+'/api/marketplace/setup/transfer-account',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({bankName:'Example Bank',accountName:'Chick Pick',accountNumber:'1234567890'})});
  assert.equal(account.status,200);
  assert.equal((await fetch(base+'/api/finance/revenue',{headers:{Cookie:cookie}})).status,200);
  const booked=await fetch(base+'/api/marketplace/bookings',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({sessionId:'night-chicken'})});
  const bookingId=(await booked.json()).booking.id;
  assert.equal((await (await fetch(base+'/api/marketplace',{headers:{Cookie:cookie}})).json()).bookings.find((b:{id:string})=>b.id===bookingId).transferAccount.accountNumber,'1234567890');
  const cancelled=await fetch(base+'/api/marketplace/bookings/'+bookingId+'/cancel',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'});
  assert.equal(cancelled.status,200);
  const state=await (await fetch(base+'/api/marketplace',{headers:{Cookie:cookie}})).json();
  assert.equal(state.sessions.find((s:{id:string})=>s.id==='night-chicken').joined,0);
  assert.equal((await fetch(base+'/api/marketplace/bookings/'+bookingId+'/payment',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({method:'cash'})})).status,409);
  const report=await (await fetch(base+'/api/finance/report',{headers:{Cookie:cookie}})).json();
  assert.equal(report.summary.pendingIncome,0);
  const logout=await fetch(base+'/api/finance/logout',{method:'POST',headers:{Cookie:cookie}});
  assert.equal(logout.status,200);
  assert.equal((await fetch(base+'/api/marketplace',{headers:{Cookie:cookie}})).status,401);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true});}
});
