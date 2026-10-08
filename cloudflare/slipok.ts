import type { ReceiptSubmission, TransferAccount } from '../src/marketplaceTypes';
import { transferOptions, channelLabel } from '../src/paymentChannels';

export type SlipOkEnv = { SLIPOK_API_KEY?: string; SLIPOK_BRANCH_ID?: string };
export type SlipVerification = {
  provider: 'slipok'; status: 'checking' | 'verified' | 'rejected' | 'retry' | 'unavailable';
  checkedAt: string; message: string; code?: number; reference?: string; amountSatang?: number;
  transferredAt?: string; receiver?: string; attemptId?: string; retryAt?: string; paymentChannel?: 'bank' | 'promptpay'; paymentChannelLabel?: string;
};
export const slipokConfigured = (env: SlipOkEnv) => Boolean(env.SLIPOK_API_KEY && !/[\s\x00-\x1f]/.test(env.SLIPOK_API_KEY) && /^\d{1,10}$/.test(env.SLIPOK_BRANCH_ID || ''));
export type SlipOkConnection = { configured: boolean; connected: boolean; quota: number | null; overQuota?: number | null; message: string; checkedAt: string; diagnostic?: string; upstreamStatus?: number | null };
class SlipOkTransportError extends Error {
  constructor(readonly reason: 'upstream_redirect' | 'response_format' | 'response_size' | 'quota_response', readonly status: number) { super(reason); }
}
// workerd rejects redirect:'error'. Manual mode preserves the no-credential-forwarding rule.
async function slipokRequest(env: SlipOkEnv, suffix: '' | '/quota', init: RequestInit, timeout: number, transport: typeof fetch) {
  const response = await transport('https://api.slipok.com/api/line/apikey/' + env.SLIPOK_BRANCH_ID + suffix, { ...init, headers: { 'x-authorization': env.SLIPOK_API_KEY! }, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new SlipOkTransportError('upstream_redirect', response.status); }
  return response;
}
async function slipokJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get('Content-Length')) > 32768) { await response.body?.cancel(); throw new SlipOkTransportError('response_size', response.status); }
  const reader = response.body?.getReader(), decoder = new TextDecoder(); let raw = '', size = 0;
  if (reader) while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 32768) { await reader.cancel(); throw new SlipOkTransportError('response_size', response.status); } raw += decoder.decode(next.value, { stream: true }); }
  raw += decoder.decode();
  try { return JSON.parse(raw); } catch { throw new SlipOkTransportError('response_format', response.status); }
}
function connectionFailure(cause: unknown) {
  const diagnostic = cause instanceof SlipOkTransportError ? cause.reason : cause instanceof Error && ['TimeoutError', 'AbortError'].includes(cause.name) ? 'timeout' : 'network';
  const upstreamStatus = cause instanceof SlipOkTransportError ? cause.status : null;
  const message = diagnostic === 'timeout' ? 'SlipOK ตอบช้าเกินเวลา กรุณาตรวจใหม่' : diagnostic === 'upstream_redirect' ? 'SlipOK ส่งต่อคำขอ ระบบหยุดไว้เพื่อรักษาคีย์ กรุณาติดต่อผู้จัด' : upstreamStatus !== null ? `SlipOK ตอบ HTTP ${upstreamStatus} แต่ข้อมูลยังตรวจยืนยันไม่ได้ กรุณาติดต่อผู้จัด` : 'ติดต่อ SlipOK ไม่สำเร็จ ภาพยังเก็บอยู่ กรุณาตรวจใหม่';
  return { diagnostic, upstreamStatus, message };
}
export async function checkSlipOkConnection(env: SlipOkEnv, transport: typeof fetch = fetch): Promise<SlipOkConnection> {
  const checkedAt = new Date().toISOString();
  if (!slipokConfigured(env)) return { configured: false, connected: false, quota: null, checkedAt, message: 'ยังไม่ตั้งคีย์ SlipOK ฝั่งเซิร์ฟเวอร์' };
  try {
    const r = await slipokRequest(env, '/quota', {}, 8000, transport), v = object(await slipokJson(r)), data = object(v.data);
    if (!r.ok || v.success !== true || typeof data.quota !== 'number' || !Number.isFinite(data.quota) || data.quota < 0) throw new SlipOkTransportError('quota_response', r.status);
    return { configured: true, connected: true, quota: data.quota, overQuota: typeof data.overQuota === 'number' && Number.isFinite(data.overQuota) ? data.overQuota : null, checkedAt, message: 'เชื่อม SlipOK ได้แล้ว · การตรวจผ่านยังรอแอดมินอนุมัติเงิน' };
  } catch (cause) { return { configured: true, connected: false, quota: null, checkedAt, ...connectionFailure(cause) }; }
}
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
export function matchesSlipMobile(masked: unknown, number: string) {
  let value = short(masked).replace(/[\s-]/g, '').toLowerCase();
  if (/^\+66[0-9x*]{9}$/.test(value)) value = '0' + value.slice(3);
  else if (/^0066[0-9x*]{9}$/.test(value)) value = '0' + value.slice(4);
  else if (/^66[0-9x*]{9}$/.test(value)) value = '0' + value.slice(2);
  return matchesSlipAccount(value, number);
}
function receiverChannel(receiver: Record<string, unknown>, receivingBank: string, account: TransferAccount) {
  const bankMatches = (name: string) => banks[receivingBank]?.some(alias => bankName(alias) === bankName(name));
  const bankAccount = object(receiver.account), proxy = object(receiver.proxy);
  return transferOptions(account).find(channel => {
    if (channel.kind === 'promptpay') return Boolean(banks[receivingBank]) && (
      proxy.type === 'MSISDN' && matchesSlipMobile(proxy.value, channel.accountNumber)
      || channel.linkedBank && bankMatches(channel.linkedBank.bankName) && bankAccount.type === 'BANKAC' && matchesSlipAccount(bankAccount.value, channel.linkedBank.accountNumber));
    return bankMatches(channel.bankName) && matchesSlipAccount(bankAccount.value, channel.accountNumber);
  });
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
  const matched = receiverChannel(receiver, short(d.receivingBank), account);
  if (!matched) return reject('ข้อมูลผู้รับบนสลิปไม่ตรงกับช่องทางรับเงินของการจองนี้ หรือข้อมูลที่ธนาคารเปิดเผยยังยืนยันไม่ได้', 1014);
  const date = short(d.transDate), time = short(d.transTime);
  const transferredAt = /^\d{8}$/.test(date) && /^\d{2}:\d{2}:\d{2}$/.test(time) ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${time}+07:00` : '';
  const timestamp = Date.parse(transferredAt), bookingTime = Date.parse(bookedAt);
  if (!Number.isFinite(timestamp) || !Number.isFinite(bookingTime) || timestamp < bookingTime - 5 * 60000 || timestamp > now + 5 * 60000 || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp)).replaceAll('-', '') !== date) return reject('เวลารายการโอนไม่อยู่ในช่วงของการจองนี้ กรุณาติดต่อผู้จัด');
  return { provider: 'slipok', status: 'verified', checkedAt, message: 'SlipOK ยืนยันรายการ ยอด และบัญชีผู้รับตรงแล้ว รอแอดมินอนุมัติ', reference, amountSatang: expectedSatang, transferredAt: new Date(timestamp).toISOString(), receiver: short(receiver.displayName) || short(receiver.name), paymentChannel: matched.kind || 'bank', paymentChannelLabel: channelLabel(matched) };
}

export async function verifySlipOk(env: SlipOkEnv, image: ArrayBuffer, mimeType: ReceiptSubmission['mimeType'], amount: number, account: TransferAccount, bookedAt: string, transport: typeof fetch = fetch): Promise<SlipVerification> {
  const checkedAt = new Date().toISOString();
  if (!slipokConfigured(env)) return { provider: 'slipok', status: 'unavailable', checkedAt, message: 'ยังไม่ตั้งคีย์ SlipOK ฝั่งเซิร์ฟเวอร์' };
  try {
    const form = new FormData();
    form.append('files', new Blob([image], { type: mimeType }), 'slip.' + (mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'));
    form.append('log', 'true'); form.append('amount', (amount / 100).toFixed(2));
    const r = await slipokRequest(env, '', { method: 'POST', body: form }, 18000, transport);
    return slipokResult(await slipokJson(r), r.ok, amount, account, bookedAt);
  } catch (cause) { return { provider: 'slipok', status: 'retry', checkedAt, retryAt: new Date(Date.now() + 60000).toISOString(), message: connectionFailure(cause).message }; }
}
