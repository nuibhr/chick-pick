import { Router, raw, type Request, type RequestHandler } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { activeBooking, type Booking, type MarketplaceData, type ReceiptSubmission, type Session } from '../src/marketplaceTypes';
import { thaiDate } from './finance';
import { maxReceiptBytes, storeReceiptImage, validReceiptImage } from './receiptFiles';
import { readSlipOcr } from './slipOcr';
import { linePicture, ownProfile, participantPreview, updateProfile, type LineIdentity } from './playerProfiles';
import { sameOriginWrites } from './requestSecurity';
import { readTransferAccount } from './transferSettings';

type Verify=(rawToken:string,channelId:string)=>Promise<LineIdentity>;
export async function verifyLineIdToken(rawToken:string,channelId:string):Promise<LineIdentity>{
 const body=new URLSearchParams({id_token:rawToken,client_id:channelId});
 const response=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(8000)});
 if(!response.ok) throw new Error('LINE identity verification failed');
 const data=await response.json() as {sub?:unknown;name?:unknown;aud?:unknown;exp?:unknown;iss?:unknown;picture?:unknown};
 if(data.iss!=='https://access.line.me'||data.aud!==channelId||typeof data.sub!=='string'||!data.sub||typeof data.exp!=='number'||data.exp*1000<=Date.now())throw new Error('Invalid LINE identity');
 return {sub:data.sub,name:typeof data.name==='string'&&data.name.trim()?data.name.trim().slice(0,80):'ผู้เล่น LINE',picture:linePicture(data.picture)};
}
export function publicSession(s:Session,bookings:Booking[],profiles:MarketplaceData['profiles']=[]){
  const joined=bookings.filter(b=>b.sessionId===s.id&&activeBooking(b)).length;
 const status=s.status==='completed'||!Number.isFinite(Date.parse(s.startsAt))||Date.parse(s.startsAt)<=Date.now()?'completed':joined>=s.capacity?'full':'open';
 const date=Number.isFinite(Date.parse(s.startsAt))?thaiDate(new Date(s.startsAt)):'';
 return {id:s.id,title:s.title,venue:s.venue,area:s.area,date:!date?'วันยังไม่ระบุ':date===thaiDate()?'วันนี้':date===thaiDate(new Date(Date.now()+86400000))?'พรุ่งนี้':new Date(s.startsAt).toLocaleDateString('th-TH',{day:'numeric',month:'short',timeZone:'Asia/Bangkok'}),time:s.time,price:s.price,joined,capacity:s.capacity,dupr:s.dupr,vibe:s.vibe,host:s.host,courtCount:s.courtCount,tags:s.tags,startsAt:s.startsAt,status,...participantPreview({sessions:[s],bookings,profiles},s.id,status!=='completed')};
}
export function playerRouter(file=path.resolve('data/marketplace.json'), channelId=process.env.LINE_CHANNEL_ID||'', verify:Verify=verifyLineIdToken, enabled=process.env.NODE_ENV!=='production'){
 const router=Router();const read=():MarketplaceData=>existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{sessions:[],bookings:[]};
 const save=(data:MarketplaceData)=>{mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file+'.tmp',JSON.stringify(data,null,2));renameSync(file+'.tmp',file);};
 const identity:RequestHandler=async(req,res,next)=>{const raw=req.get('Authorization')?.match(/^Bearer (\S{20,4096})$/)?.[1];if(!channelId)return res.status(503).json({message:'ยังไม่เชื่อม LINE Mini App'});if(!raw)return res.status(401).json({message:'กรุณาเข้าสู่ระบบผ่าน LINE'});try{res.locals.line=await verify(raw,channelId);}catch{return res.status(401).json({message:'ยืนยันตัวตน LINE ไม่สำเร็จ กรุณาเปิดแอปใหม่'});}next();};
 const closed=(sessionId:string)=>{const closedFile=path.join(path.dirname(file),'revenue-settlements.json');return existsSync(closedFile)&&JSON.parse(readFileSync(closedFile,'utf8')).some((unit:{key:string})=>unit.key===`game:${sessionId}`);};
 router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 router.use(sameOriginWrites);
 router.use((req,res,next)=>{if(!enabled&&!['GET','HEAD','OPTIONS'].includes(req.method))return res.status(503).json({message:'ยังไม่เปิดรับรายการจริง โปรดติดต่อผู้จัด'});next();});
 router.get('/config',(_req,res)=>res.json({liffId:process.env.VITE_LIFF_ID||null,connected:Boolean(channelId&&process.env.VITE_LIFF_ID),bookingEnabled:Boolean(enabled&&channelId&&process.env.VITE_LIFF_ID)}));
 router.get('/sessions',(_req,res)=>{const data=read();res.json({sessions:data.sessions.map(s=>publicSession(s,data.bookings,data.profiles))});});
 router.get('/me',identity,(_req,res)=>{const person=res.locals.line as LineIdentity;res.json({name:person.name,profile:ownProfile(read(),person)});});
 router.post('/me/profile',identity,(req,res)=>{
  const {discoverable,skill,bio}=req.body||{};
  if(typeof discoverable!=='boolean'||(skill!==null&&(!Number.isFinite(skill)||skill<2||skill>5||Math.abs(skill*10-Math.round(skill*10))>1e-7))||typeof bio!=='string'||bio.length>160)return res.status(400).json({message:'เลือกการแสดงโปรไฟล์ ระดับ 2.0–5.0 หรือยังไม่ระบุ และแนะนำตัวไม่เกิน 160 ตัวอักษร'});
  const data=read();const profile=updateProfile(data,res.locals.line as LineIdentity,{discoverable,skill,bio:bio.trim()});save(data);res.json({profile});
 });
 router.get('/bookings',identity,(_req,res)=>{const id=(res.locals.line as LineIdentity).sub;const data=read();res.json({bookings:data.bookings.filter(b=>b.playerId===`line:${id}`).map(b=>({id:b.id,sessionId:b.sessionId,amount:b.amount,title:b.title,transferAccount:b.transferAccount||null,createdAt:b.createdAt,paidAt:b.paidAt||null,cancelledAt:b.cancelledAt||null,receipt:b.receipts?.at(-1)?{id:b.receipts.at(-1)!.id,status:b.receipts.at(-1)!.status,ocr:b.receipts.at(-1)!.ocr,rejectReason:b.receipts.at(-1)!.rejectReason||null}:null}))});});
 router.post('/bookings',identity,(req:Request,res)=>{
  if(!enabled)return res.status(503).json({message:'ยังไม่เปิดรับจองจริง โปรดติดต่อผู้จัด'});
  const id=req.body?.sessionId;if(typeof id!=='string'||id.length>120)return res.status(400).json({message:'รหัสก๊วนไม่ถูกต้อง'});
  const data=read();const session=data.sessions.find(s=>s.id===id);if(!session)return res.status(404).json({message:'ไม่พบก๊วนนี้'});
   const person=res.locals.line as LineIdentity;const playerId=`line:${person.sub}`;const existing=data.bookings.find(b=>b.sessionId===id&&b.playerId===playerId&&activeBooking(b));if(existing)return res.json({booking:{id:existing.id,sessionId:id},repeated:true});
  if(closed(id))return res.status(409).json({message:'ก๊วนนี้ปิดยอดแบ่งรายได้แล้ว'});
   if(session.status==='completed'||!Number.isFinite(Date.parse(session.startsAt))||Date.parse(session.startsAt)<=Date.now()||data.bookings.filter(b=>b.sessionId===id&&activeBooking(b)).length>=session.capacity)return res.status(409).json({message:'ก๊วนนี้ปิดรับหรือเต็มแล้ว'});
  const booking:Booking={id:randomUUID(),sessionId:id,playerId,playerName:person.name,amount:Math.round(session.price*100),title:session.title,createdAt:new Date().toISOString(),transferAccount:readTransferAccount(file)||undefined};data.bookings.push(booking);save(data);res.status(201).json({booking:{id:booking.id,sessionId:id},repeated:false,message:'จองทดลองสำเร็จ · ยังไม่มีการชำระเงินจริง'});
  });
  router.post('/bookings/:id/receipt',identity,raw({type:['image/jpeg','image/png','image/webp'],limit:maxReceiptBytes}),async(req,res,next)=>{
   try {
   if(!enabled)return res.status(503).json({message:'ยังไม่เปิดรับสลิปจริง'});
   const contentType=(req.get('Content-Type')||'').split(';')[0].toLowerCase();
   if(!Buffer.isBuffer(req.body)||!validReceiptImage(req.body,contentType))return res.status(415).json({message:'รับเฉพาะภาพ JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB'});
   const data=read();const booking=data.bookings.find(b=>b.id===req.params.id&&b.playerId===`line:${(res.locals.line as LineIdentity).sub}`);
   if(!booking)return res.status(404).json({message:'ไม่พบการจองของคุณ'});
   if(closed(booking.sessionId))return res.status(409).json({message:'ก๊วนนี้ปิดยอดแล้ว กรุณาติดต่อผู้จัดก่อนส่งสลิป'});
   if(booking.cancelledAt||booking.paidAt)return res.status(409).json({message:'รายการนี้ปิดรับสลิปแล้ว'});
   if(booking.receipts?.at(-1)?.status==='pending')return res.status(409).json({message:'ส่งสลิปแล้ว กรุณารอแอดมินตรวจสอบ'});
   const image=req.body as Buffer;
   const sha256=createHash('sha256').update(image).digest('hex');
   if(data.bookings.some(b=>b.id!==booking.id&&b.receipts?.some(r=>r.sha256===sha256&&r.status!=='rejected')))return res.status(409).json({message:'ภาพสลิปนี้ถูกส่งกับการจองอื่นแล้ว กรุณาตรวจสอบรายการ'});
   const stored=storeReceiptImage(file,image,contentType);
   const receipt:ReceiptSubmission={...stored,mimeType:contentType,size:image.length,sha256,submittedAt:new Date().toISOString(),status:'pending',ocr:{status:'unavailable',amount:null,transferredAt:null,reference:null,sender:null,receiver:null,rawText:null,confidence:null}};
   booking.receipts=[...(booking.receipts||[]),receipt];save(data);
   const ocr=await readSlipOcr(image,contentType);
   const latest=read();const saved=latest.bookings.find(b=>b.id===booking.id)?.receipts?.find(r=>r.id===receipt.id);
   if(saved){saved.ocr=ocr;save(latest);}
   res.status(201).json({receipt:{id:receipt.id,status:saved?.status||'pending',ocr},message:'ส่งสลิปแล้ว กรุณาดูสถานะการตรวจในรายการจอง'});
   } catch(error) { next(error); }
  });
  router.post('/bookings/:id/cancel',identity,(req,res)=>{
   if(!enabled)return res.status(503).json({message:'ยังไม่เปิดจัดการการจองจริง'});
   const data=read();const booking=data.bookings.find(b=>b.id===req.params.id&&b.playerId===`line:${(res.locals.line as LineIdentity).sub}`);
   if(!booking)return res.status(404).json({message:'ไม่พบการจองของคุณ'});
   if(booking.cancelledAt)return res.json({cancelled:true,repeated:true});
   if(booking.receipts?.at(-1)?.status==='pending')return res.status(409).json({message:'สลิปกำลังรอตรวจ กรุณาติดต่อผู้จัดก่อนยกเลิก'});
   const session=data.sessions.find(s=>s.id===booking.sessionId);
   if(!session||session.status==='completed'||!Number.isFinite(Date.parse(session.startsAt))||Date.parse(session.startsAt)<=Date.now())return res.status(409).json({message:'ก๊วนเริ่มแล้ว กรุณาติดต่อผู้จัด'});
   if(booking.paidAt)return res.status(409).json({message:'รายการนี้ยืนยันรับเงินแล้ว กรุณาติดต่อผู้จัดเพื่อดำเนินการคืนเงิน'});
   booking.cancelledAt=new Date().toISOString();booking.cancelledBy='player';save(data);res.json({cancelled:true,repeated:false});
  });
  router.use((err:Error & {type?:string},_req:Request,res:import('express').Response,_next:import('express').NextFunction)=>{
   if(err.type==='entity.too.large')return res.status(413).json({message:'ภาพสลิปต้องมีขนาดไม่เกิน 5 MB'});
   if(err.type==='entity.parse.failed')return res.status(400).json({message:'รูปแบบคำขอไม่ถูกต้อง'});
   return res.status(500).json({message:'บันทึกข้อมูลไม่สำเร็จ กรุณาตรวจสถานะรายการก่อนลองใหม่'});
  });
 return router;
}
