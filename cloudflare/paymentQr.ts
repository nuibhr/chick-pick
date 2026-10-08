import core from 'qrcode/lib/core/qrcode.js';
import type { TransferAccount } from '../src/marketplaceTypes';
import { promptPayPayload } from '../src/promptPay';
import { staticBankQr } from '../src/bankQr';
import { paymentQrPhone } from '../src/paymentChannels';

export function paymentQrPayload(account: TransferAccount, amount: number) {
  const phone = paymentQrPhone(account);
  if (phone) return promptPayPayload(phone, amount);
  const qr = staticBankQr(account.bankQrPayload); if (!qr) throw Error('ยังไม่มี QR รับเงินของธนาคาร'); return qr;
}
const enc = new TextEncoder();
export type QrClaims = { kind: 'game' | 'coaching'; id: string; channel: string; exp: number };
async function qrKey(secret: string) { return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode('chick-pick.payment-qr.v1:' + secret)), 'AES-GCM', false, ['encrypt', 'decrypt']); }
export async function createQrTicket(secret: string, claims: Omit<QrClaims, 'exp'>, now = Date.now(), holdExpiresAt?: string) {
  const deadline = holdExpiresAt ? Date.parse(holdExpiresAt) : Infinity;
  const exp = Math.min(now + 5 * 60000, Number.isFinite(deadline) ? deadline : Infinity);
  const iv = crypto.getRandomValues(new Uint8Array(12)), encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await qrKey(secret), enc.encode(JSON.stringify({ ...claims, exp }))));
  return btoa(String.fromCharCode(...iv, ...encrypted)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export async function readQrTicket(secret: string, ticket: string, now = Date.now()): Promise<QrClaims | null> {
  try {
    if (!/^[A-Za-z0-9_-]{30,1024}$/.test(ticket)) return null;
    const bytes = Uint8Array.from(atob(ticket.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0,12) }, await qrKey(secret), bytes.slice(12))));
    if (!['game', 'coaching'].includes(claims.kind) || typeof claims.id !== 'string' || claims.id.length > 120 || !['bank', 'promptpay'].includes(claims.channel) || !Number.isSafeInteger(claims.exp) || claims.exp <= now || claims.exp > now + 5 * 60000) return null;
    return claims;
  } catch { return null; }
}
const concat = (...arrays: Uint8Array[]) => { const value = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0)); let offset = 0; for (const a of arrays) { value.set(a, offset); offset += a.length; } return value; };
const uint = (v: number) => new Uint8Array([v >>> 24, v >>> 16 & 255, v >>> 8 & 255, v & 255]);
function chunk(type: string, data: Uint8Array) {
  const body = concat(enc.encode(type), data); let crc = 0xffffffff;
  for (const v of body) { crc ^= v; for (let i = 0; i < 8; i++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); }
  return concat(uint(data.length), body, uint((crc ^ 0xffffffff) >>> 0));
}
// 1-bit grayscale PNG uses Web Streams only; no canvas, Node or remote image service.
export async function paymentQrPng(payload: string) {
  const qr = core.create(payload, { errorCorrectionLevel: 'M' }), size = (qr.modules.size + 8) * 5, stride = Math.ceil(size / 8);
  const pixels = new Uint8Array((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (stride + 1); pixels.fill(255, row + 1, row + stride + 1);
    for (let x = 0; x < size; x++) { const qx = Math.floor(x / 5) - 4, qy = Math.floor(y / 5) - 4; if (qx >= 0 && qy >= 0 && qx < qr.modules.size && qy < qr.modules.size && qr.modules.get(qy, qx)) pixels[row + 1 + (x >>> 3)] &= ~(128 >>> (x & 7)); }
  }
  const compressed = new Uint8Array(await new Response(new Blob([pixels]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  return concat(new Uint8Array([137,80,78,71,13,10,26,10]), chunk('IHDR', concat(uint(size), uint(size), new Uint8Array([1,0,0,0,0]))), chunk('IDAT', compressed), chunk('IEND', new Uint8Array()));
}
export function paymentQrPage(ticket: string, recipient: string, amount: number, isStatic: boolean, holdExpiresAt?: string) {
  const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
  const deadline = holdExpiresAt ? '<p>ต้องส่งสลิปให้ถึงระบบก่อน ' + escape(new Date(holdExpiresAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })) + ' · การเปิด QR ไม่ต่อเวลาจอง หากโอนแล้วอย่าโอนซ้ำ</p>' : '';
  const image = '/api/player/payments/qr/image?ticket=' + encodeURIComponent(ticket);
  return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Chick&Pick · บันทึก QR รับเงิน</title><style>body{font:16px system-ui;background:#f4f7ee;color:#17352a;margin:0;padding:24px;text-align:center}main{max-width:440px;margin:auto;background:white;padding:24px;border-radius:24px}img{width:100%;max-width:330px;height:auto}a{display:block;padding:16px;background:#285b3e;color:white;border-radius:12px;text-decoration:none}small{display:block;line-height:1.7;margin:16px 0}</style><main><h1>Chick&Pick</h1>${deadline}<p>${escape(recipient)}</p><h2>ยอดจอง ฿${(amount / 100).toFixed(2)}</h2><img src="${image}" alt="QR รับเงิน"><a href="${image}&download=1" download="chick-pick-payment-qr.png">ดาวน์โหลดภาพ QR</a><small>บน iPhone: แตะภาพค้าง → บันทึกไปยังรูปภาพ หรือใช้ปุ่มดาวน์โหลด${isStatic ? ' · QR ธนาคารไม่ระบุยอด กรอกยอดจองที่แสดงด้านบนเอง' : ' · QR พร้อมเพย์ระบุยอดจองแล้ว'}<br>ตรวจชื่อผู้รับ ธนาคาร และยอดในแอปธนาคารก่อนโอน จากนั้นกลับเข้า LINE เพื่อแนบสลิป</small><p>ลิงก์นี้ใช้ได้ 5 นาที และใช้รับเงินเฉพาะการจองนี้</p></main></html>`;
}
