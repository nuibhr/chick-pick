import type { ReceiptSubmission, TransferAccount } from '../src/marketplaceTypes';

export type SlipOkEnv = { SLIPOK_API_KEY?: string; SLIPOK_BRANCH_ID?: string };
export type SlipVerification = {
  provider: 'slipok'; status: 'checking' | 'verified' | 'rejected' | 'retry' | 'unavailable';
  checkedAt: string; message: string; code?: number; reference?: string; amountSatang?: number;
  transferredAt?: string; receiver?: string; attemptId?: string; retryAt?: string;
};
export const slipokConfigured = (env: SlipOkEnv) => Boolean(env.SLIPOK_API_KEY && !/[\s\x00-\x1f]/.test(env.SLIPOK_API_KEY) && /^\d{1,10}$/.test(env.SLIPOK_BRANCH_ID || ''));
const short = (v: unknown, max = 120) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const banks: Record<string, string[]> = {
  '002': ['BBL', 'กรุงเทพ'], '004': ['KBANK', 'KASIKORN', 'กสิกรไทย', 'กสิกร'], '006': ['KTB', 'กรุงไทย'],
  '011': ['TTB', 'TMB', 'ทหารไทยธนชาต', 'ทหารไทย', 'ธนชาต'], '014': ['SCB', 'ไทยพาณิชย์'], '025': ['BAY', 'กรุงศรีอยุธยา', 'กรุงศรี'],
  '069': ['KKP', 'เกียรตินาคินภัทร', 'เกียรตินาคิน'], '022': ['CIMBT', 'CIMB', 'ซีไอเอ็มบีไทย'], '067': ['TISCO', 'ทิสโก้'],
  '024': ['UOBT', 'UOB', 'ยูโอบี'], '071': ['TCD', 'ไทยเครดิตเพื่อรายย่อย', 'ไทยเครดิต'], '073': ['LHFG', 'LH', 'แลนด์แอนด์เฮ้าส์'],
  '070': ['ICBCT', 'ICBC', 'ไอซีบีซี(ไทย)'], '098': ['SME', 'พัฒนาวิสาหกิจขนาดกลางและขนาดย่อมแห่งประเทศไทย'],
  '034': ['BAAC', 'ธ.ก.ส.', 'เพื่อการเกษตรและสหกรณ์การเกษตร'], '035': ['EXIM', 'เพื่อการส่งออกและนำเข้าแห่งประเทศไทย'],
  '030': ['GSB', 'ออมสิน'], '033': ['GHB', 'อาคารสงเคราะห์'],
};
const bankName = (name: string) => name.toUpperCase().replace(/^ธนาคาร/, '').replace(/[\s.]/g, '');

// A matching suffix alone is not proof of an account: check all visible positions.
export function matchesSlipAccount(masked: unknown, number: string) {
  const mask = short(masked).replace(/[\s-]/g, '').toLowerCase(), expected = number.replace(/[\s-]/g, '');
  return /^[0-9x*]+$/.test(mask) && mask.length === expected.length && (mask.match(/\d/g) || []).length >= 4 && [...mask].every((c, i) => c === 'x' || c === '*' || c === expected[i]);
}

const messages: Record<number, string> = {
  1001: 'ไม่พบสาขา SlipOK กรุณาให้เจ้าของตรวจค่าตั้ง', 1002: 'คีย์ SlipOK ไม่ถูกต้อง กรุณาให้เจ้าของตรวจค่าตั้ง',
  1003: 'แพ็กเกจ SlipOK หมดอายุ', 1004: 'โควต้า SlipOK ไม่พร้อม กรุณาติดต่อผู้จัด',
  1005: 'SlipOK ไม่รองรับไฟล์นี้', 1006: 'ภาพสลิปไม่ถูกต้อง', 1007: 'ไม่พบ QR บนสลิป', 1008: 'QR นี้ไม่ใช่ QR ตรวจรายการโอน',
  1009: 'ธนาคารยังตรวจรายการไม่ได้ กรุณาตรวจใหม่ภายหลัง', 1010: 'ธนาคารกำลังรอยืนยันรายการ กรุณาตรวจใหม่ภายหลัง',
  1011: 'ไม่พบรายการโอนหรือ QR หมดอายุ', 1012: 'SlipOK พบสลิปซ้ำ กรุณาติดต่อผู้จัดก่อนส่งอีกครั้ง',
  1013: 'ยอดบนสลิปไม่ตรงกับยอดจอง', 1014: 'บัญชีผู้รับไม่ตรงกับบัญชีที่ผูกใน SlipOK',
};
export function slipokResult(payload: unknown, httpOk: boolean, expectedSatang: number, account: TransferAccount, bookedAt: string, now = Date.now()): SlipVerification {
  const p = object(payload), d = object(p.data), checkedAt = new Date(now).toISOString();
  const reject = (message: string, code?: number): SlipVerification => ({ provider: 'slipok', status: 'rejected', checkedAt, message, ...(code ? { code } : {}) });
  if (!httpOk || p.success !== true || d.success !== true) {
    const code = typeof p.code === 'number' ? p.code : undefined;
    const status = code === 1009 || code === 1010 ? 'retry' : code && [1005,1006,1007,1008,1011,1012,1013,1014].includes(code) ? 'rejected' : 'unavailable';
    const delay = code === 1010 && typeof d.delay === 'number' ? Math.min(60, Math.max(1, d.delay)) : code === 1009 ? 15 : 1;
    return { provider: 'slipok', status, checkedAt, message: code && messages[code] || 'SlipOK ยังยืนยันรายการไม่ได้ กรุณาตรวจใหม่', ...(code ? { code } : {}), ...(status !== 'rejected' ? { retryAt: new Date(now + delay * 60000).toISOString() } : {}) };
  }
  const amount = d.amount, reference = short(d.transRef).replace(/[\s-]/g, '').toUpperCase();
  if (typeof amount !== 'number' || !Number.isFinite(amount) || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7 || Math.round(amount * 100) !== expectedSatang) return reject('ยอดที่ SlipOK ยืนยันไม่ตรงกับยอดจอง', 1013);
  if (!/^[A-Z0-9]{6,80}$/.test(reference)) return reject('SlipOK ไม่ส่งเลขรายการโอนที่ใช้งานได้');
  if (d.countryCode !== 'TH' || d.paidLocalCurrency !== undefined && !['764', 'THB'].includes(String(d.paidLocalCurrency))) return reject('สลิปนี้ไม่ใช่รายการเงินบาทในประเทศไทย');
  const receiver = object(d.receiver);
  const bankMatches = banks[short(d.receivingBank)]?.some(alias => bankName(alias) === bankName(account.bankName));
  if (!bankMatches) return reject('ธนาคารผู้รับไม่ตรง หรือชื่อธนาคารในแอปยังยืนยันไม่ได้ กรุณาติดต่อผู้จัด', 1014);
  if (!matchesSlipAccount(object(receiver.account).value, account.accountNumber) && !matchesSlipAccount(object(receiver.proxy).value, account.accountNumber)) return reject('ข้อมูลผู้รับบนสลิปยังยืนยันกับบัญชีของการจองนี้ไม่ได้', 1014);
  const date = short(d.transDate), time = short(d.transTime);
  const transferredAt = /^\d{8}$/.test(date) && /^\d{2}:\d{2}:\d{2}$/.test(time) ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${time}+07:00` : '';
  const timestamp = Date.parse(transferredAt), bookingTime = Date.parse(bookedAt);
  if (!Number.isFinite(timestamp) || !Number.isFinite(bookingTime) || timestamp < bookingTime - 5 * 60000 || timestamp > now + 5 * 60000 || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp)).replaceAll('-', '') !== date) return reject('เวลารายการโอนไม่อยู่ในช่วงของการจองนี้ กรุณาติดต่อผู้จัด');
  return { provider: 'slipok', status: 'verified', checkedAt, message: 'SlipOK ยืนยันรายการ ยอด และบัญชีผู้รับตรงแล้ว รอแอดมินอนุมัติ', reference, amountSatang: expectedSatang, transferredAt: new Date(timestamp).toISOString(), receiver: short(receiver.displayName) || short(receiver.name) };
}

export async function verifySlipOk(env: SlipOkEnv, image: ArrayBuffer, mimeType: ReceiptSubmission['mimeType'], amount: number, account: TransferAccount, bookedAt: string, transport: typeof fetch = fetch): Promise<SlipVerification> {
  const checkedAt = new Date().toISOString();
  if (!slipokConfigured(env)) return { provider: 'slipok', status: 'unavailable', checkedAt, message: 'ยังไม่ตั้งคีย์ SlipOK ฝั่งเซิร์ฟเวอร์' };
  try {
    const form = new FormData();
    form.append('files', new Blob([image], { type: mimeType }), 'slip.' + (mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'));
    form.append('log', 'true'); form.append('amount', (amount / 100).toFixed(2));
    const r = await transport('https://api.slipok.com/api/line/apikey/' + env.SLIPOK_BRANCH_ID, { method: 'POST', headers: { 'x-authorization': env.SLIPOK_API_KEY! }, body: form, redirect: 'error', signal: AbortSignal.timeout(18000) });
    if (Number(r.headers.get('Content-Length')) > 32768) throw Error('large response');
    const reader = r.body?.getReader(); const decoder = new TextDecoder(); let raw = '', size = 0;
    if (reader) while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 32768) { await reader.cancel(); throw Error('large response'); } raw += decoder.decode(next.value, { stream: true }); }
    raw += decoder.decode(); return slipokResult(JSON.parse(raw), r.ok, amount, account, bookedAt);
  } catch { return { provider: 'slipok', status: 'retry', checkedAt, retryAt: new Date(Date.now() + 60000).toISOString(), message: 'ติดต่อ SlipOK ไม่สำเร็จ ภาพยังเก็บอยู่ กรุณาตรวจใหม่' }; }
}
