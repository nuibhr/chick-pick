import { categories, type FinanceRow } from '../src/financeTypes';
import { financeRows, summarize, thaiDate, validDate } from '../src/financeModel';
import { buildRevenueUnits, defaultRevenueConfig } from '../src/revenueMath';
import type { Enrollment } from '../src/coachingTypes';
import type { MarketplaceData } from '../src/marketplaceTypes';
import type { PlatformAllocation, RevenueConfig, RevenueReport, RevenueUnit } from '../src/revenueTypes';
import { digest } from './pilotAuth';
import { fail } from './pilotDomain';

export type Snapshot = NonNullable<RevenueUnit['settlement']> & { key: string; rule: RevenueUnit['rule']; platformAllocation?: PlatformAllocation };
export type FinanceDocuments = { marketplace: MarketplaceData; finance: FinanceRow[]; coaching: Enrollment[]; 'revenue-config': RevenueConfig[]; 'revenue-settlements': Snapshot[] };
export const financeKeys = ['marketplace', 'coaching', 'finance', 'revenue-config', 'revenue-settlements'] as const;
export const allRows = (docs: FinanceDocuments) => financeRows(docs.finance, docs.coaching, docs.marketplace);
import { platformDistribution, type PlatformDistribution } from '../src/revenueMath';
export { platformDistribution } from '../src/revenueMath';
export async function revenueReport(docs: FinanceDocuments): Promise<RevenueReport & { platformDistribution: PlatformDistribution; pilot: true }> {
  const history = docs['revenue-config'], config = history.at(-1) || defaultRevenueConfig, rows = allRows(docs);
  const units = await Promise.all(buildRevenueUnits(rows, config, s => s).map(async u => {
    const unit = { ...u, fingerprint: await digest(u.fingerprint) }, saved = docs['revenue-settlements'].find(s => s.key === u.key);
    if (!saved) return unit;
    return { ...unit, rule: saved.rule, settlement: saved, changed: saved.fingerprint !== unit.fingerprint, gross: saved.gross, refunds: saved.refunds, directCosts: saved.directCosts, processing: saved.processing, distributable: saved.distributable, platform: saved.platform, partner: saved.partner, remainingPartner: Math.max(0, saved.partner - unit.paidPartner - unit.pendingPartner), overpaid: Math.max(0, unit.paidPartner + unit.pendingPartner - saved.partner) };
  }));
  const totals = { gross: 0, platform: 0, partner: 0, directCosts: 0, refunds: 0, processing: 0, remainingPartner: 0, deficit: 0, overpaid: 0 };
  const distribution: PlatformDistribution = { developer: 0, marketing: 0, retained: 0, unconfigured: 0 };
  for (const unit of units) {
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += unit[key];
    const allocation = unit.settlement ? (unit.settlement as Snapshot).platformAllocation : config.platformAllocation;
    const split = platformDistribution(unit.platform, allocation);
    for (const key of Object.keys(distribution) as (keyof PlatformDistribution)[]) distribution[key] += split[key];
  }
  return { config, history, units, totals, unallocatedExpenses: rows.filter(r => r.type === 'expense' && r.status !== 'void' && !r.allocationKey).reduce((n,r)=>n+r.amount,0), platformDistribution: distribution, pilot: true };
}
export function report(docs: FinanceDocuments, query: URLSearchParams) {
  const from=query.get('from'), to=query.get('to'), q=(query.get('q') || '').trim().toLowerCase();
  if (from && !validDate(from) || to && !validDate(to) || from && to && from > to) fail(400,'ช่วงวันที่ไม่ถูกต้อง');
  const rows=allRows(docs).filter(r=>{const date=r.settledOn || r.date; return (!from || date>=from)&&(!to || date<=to)&&['type','status','category'].every(k=>!query.get(k) || r[k]===query.get(k))&&(!q || `${r.description} ${r.counterparty} ${r.reference} ${r.id}`.toLowerCase().includes(q));}).sort((a,b)=>(b.settledOn||b.date).localeCompare(a.settledOn||a.date)||b.createdAt.localeCompare(a.createdAt));
  return { ...summarize(rows), pilot: true };
}
export function csv(rows: FinanceRow[]) {
  const cell=(v:unknown)=>{let s=String(v??'');if(/^\s*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const lines=[['เลขรายการ','วันที่','ประเภท','หมวดหมู่','รายละเอียด','ผู้รับ/ผู้จ่าย','จำนวนบาท','สถานะ','ช่องทาง','ที่มา','อ้างอิง'],...rows.map(r=>[r.id,r.settledOn||r.date,r.type==='income'?'รายรับ':'รายจ่าย',categories[r.category],r.description,r.counterparty,(r.amount/100).toFixed(2),r.status,r.method,r.source,r.reference])];
  return '\uFEFF'+lines.map(r=>r.map(cell).join(',')).join('\r\n');
}
export function configure(docs: FinanceDocuments, v: Record<string, unknown>) {
  const valid=(r:any)=>r && ['gross','margin'].includes(r.basis)&&['platformBps','processingBps'].every(k=>Number.isInteger(r[k])&&r[k]>=0&&r[k]<=10000);
  if(!valid(v.game)||!valid(v.coaching))fail(400,'ตั้งสูตรและอัตรา 0–100% ให้ครบ');
  const previous=docs['revenue-config'].at(-1)||defaultRevenueConfig;
  if(v.expectedVersion!==previous.version)fail(409,'สูตรเปลี่ยนจากหน้าต่างอื่น กรุณารีเฟรช');
  const a=v.platformAllocation as PlatformAllocation|undefined;
  if(a && (typeof a.confirmed!=='boolean'||![a.developerBps,a.marketingBps].every(n=>Number.isInteger(n)&&n>=0&&n<=10000)||a.developerBps+a.marketingBps>10000))fail(400,'ส่วนผู้พัฒนาและการตลาดรวมกันต้องไม่เกิน 100% ของส่วนแพลตฟอร์ม');
  const config:RevenueConfig={version:previous.version+1,confirmed:true,game:structuredClone(v.game) as RevenueConfig['game'],coaching:structuredClone(v.coaching) as RevenueConfig['coaching'],updatedAt:new Date().toISOString(),platformAllocation:a?structuredClone(a):previous.platformAllocation};
  docs['revenue-config'].push(config); return config;
}
export async function settle(docs: FinanceDocuments, v:Record<string,unknown>) {
  const state=await revenueReport(docs),unit=state.units.find(u=>u.key===v.key);
  if(!state.config.confirmed||!unit)fail(400,'บันทึกสูตรส่วนแบ่งและเลือกรายการก่อน');
  if(unit.settlement)fail(409,'ปิดยอดนี้แล้ว ไม่สร้างใบซ้ำ');
  if(unit.deficit||unit.overpaid)fail(409,'มีต้นทุนหรือยอดจ่ายเกินส่วนแบ่ง ต้องตรวจยอด');
  if(v.fingerprint!==unit.fingerprint||v.configVersion!==state.config.version)fail(409,'ยอดหรือสูตรเปลี่ยน กรุณารีเฟรช');
  if(unit.kind==='game'&&docs.marketplace.bookings.some(b=>`game:${b.sessionId}`===unit.key&&!b.cancelledAt&&(!b.paidAt||b.receipts?.at(-1)?.status==='pending')))fail(409,'ยังมีการจองหรือสลิปรอตรวจ จัดการให้ครบก่อนปิดยอด');
  const snapshot:Snapshot={id:crypto.randomUUID(),key:unit.key,createdAt:new Date().toISOString(),configVersion:state.config.version,fingerprint:unit.fingerprint,rule:structuredClone(unit.rule),platform:unit.platform,partner:unit.partner,gross:unit.gross,refunds:unit.refunds,directCosts:unit.directCosts,processing:unit.processing,distributable:unit.distributable,platformAllocation:structuredClone(state.config.platformAllocation)};
  docs['revenue-settlements'].push(snapshot); return snapshot;
}
export async function createEntry(docs: FinanceDocuments,v: Record<string,unknown>) {
  const {type,category,description,counterparty,amount,date,method,status,reference,requestId,allocationKey}=v;
  const incomes=['coaching','game','other_income'];
  if(!['income','expense'].includes(String(type))||typeof category!=='string'||!Object.hasOwn(categories,category)||incomes.includes(String(category))!==(type==='income')||!Number.isSafeInteger(amount)||Number(amount)<=0||Number(amount)>10000000000||!validDate(date)||!['cash','transfer','card'].includes(String(method))||!['pending','settled'].includes(String(status))||typeof description!=='string'||!String(description).trim()||description.length>200||typeof counterparty!=='string'||!String(counterparty).trim()||counterparty.length>100||typeof reference!=='string'||reference.length>100||typeof requestId!=='string'||! /^[a-zA-Z0-9-]{16,80}$/.test(requestId)||allocationKey!==undefined&&(typeof allocationKey!=='string'||allocationKey.length>200))fail(400,'ตรวจข้อมูลบัญชี จำนวนเงิน หมวดหมู่ และวันที่');
  if(status==='settled'&&date>thaiDate())fail(400,'รายการรับ/จ่ายแล้วต้องไม่เป็นวันที่ในอนาคต');
  const id='manual_'+requestId,existing=docs.finance.find(r=>r.id===id);
  if(existing){if(existing.amount!==amount||existing.category!==category||existing.description!==String(description).trim()||existing.counterparty!==String(counterparty).trim()||existing.allocationKey!==allocationKey)fail(409,'เลขคำขอนี้ใช้กับรายการอื่นแล้ว');return {row:existing,repeated:true};}
  const payout=['coach_payout','organizer'].includes(String(category));
  if(payout&&!allocationKey)fail(400,'ผูกก๊วนหรือคอร์สสำหรับจ่ายส่วนแบ่ง');
  if(allocationKey){const unit=(await revenueReport(docs)).units.find(u=>u.key===allocationKey);if(type!=='expense'||!unit)fail(400,'เลือกรายการต้นทางที่ถูกต้อง');
    if(payout){if((category==='organizer')!==(unit.kind==='game'))fail(400,'หมวดผู้จัดสำหรับก๊วน หรือโค้ชสำหรับคอร์ส');if(!unit.settlement||unit.changed||unit.overpaid)fail(409,'ปิดยอดและตรวจต้นทางก่อนตั้งจ่ายส่วนแบ่ง');if(Number(amount)>unit.remainingPartner)fail(409,'ยอดเกินส่วนแบ่งคงเหลือ รวมรายการรอจ่ายแล้ว');}
    else if(unit.settlement)fail(409,'ปิดยอดแล้ว ไม่เพิ่มต้นทุนย้อนหลัง');}
  const now=new Date().toISOString();
  const row:FinanceRow={id,type:type as FinanceRow['type'],category:category as FinanceRow['category'],description:String(description).trim(),counterparty:String(counterparty).trim(),amount:Number(amount),date:String(date),method:method as FinanceRow['method'],status:status as FinanceRow['status'],reference:String(reference).trim(),source:'manual',createdAt:now,settledOn:status==='settled'?String(date):undefined,history:[{at:now,action:'ผู้จัดเพิ่มรายการ'}],...(allocationKey?{allocationKey:String(allocationKey)}:{})};
  docs.finance.unshift(row);return {row,repeated:false};
}
export async function updateEntry(docs:FinanceDocuments,id:string,v:Record<string,unknown>){
  if(v.action!=='settle'&&v.action!=='void')fail(400,'คำสั่งไม่ถูกต้อง');
  const row=docs.finance.find(r=>r.id===id);if(!row||row.source!=='manual')fail(409,'รายการอัตโนมัติต้องจัดการจากระบบต้นทาง');
  if(v.action==='settle'&&row.status==='settled'||v.action==='void'&&row.status==='void')return row;
  const unit=row.allocationKey?(await revenueReport(docs)).units.find(u=>u.key===row.allocationKey):undefined;
  const payout=['coach_payout','organizer'].includes(row.category);
  if(v.action==='void'&&unit?.settlement&&!payout)fail(409,'ต้นทุนในใบปิดยอดแล้ว แก้ย้อนหลังไม่ได้');
  if(v.action==='settle') {if(row.status!=='pending'||!validDate(v.settledOn)||v.settledOn>thaiDate())fail(400,'ระบุวันที่รับ/จ่ายจริงของรายการรอดำเนินการ');if(payout&&(!unit?.settlement||unit.changed||unit.overpaid))fail(409,'ยอดต้นทางเปลี่ยนหรือเกินส่วนแบ่ง ตรวจสอบก่อนจ่าย');row.status='settled';row.settledOn=String(v.settledOn);}
  else{if(typeof v.reason!=='string'||v.reason.trim().length<3||v.reason.length>200)fail(400,'ระบุเหตุผล 3–200 ตัวอักษร');row.status='void';}
  row.history.push({at:new Date().toISOString(),action:v.action==='settle'?'ยืนยันรับ/จ่ายแล้ว':'ยกเลิกรายการ',...(v.action==='void'?{reason:String(v.reason).trim()}:{})});return row;
}
