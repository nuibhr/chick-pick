import { rejectedNonPaymentImage } from '../src/receiptHoldPolicy';

// The legacy route response has a fixed pending label. Verification now rejects
// non-payment images inside its transaction, so expose that same committed state.
export async function receiptUploadResponse(response: Response): Promise<Response> {
  if (response.status !== 201) return response;
  let body;
  try { body = await response.clone().json() as { receipt?: { status: string; verification?: { provider?: string; status?: string; code?: number } }; message?: string }; }
  catch { return response; }
  if (!body.receipt || !rejectedNonPaymentImage(body.receipt)) return response;
  body.receipt.status = 'rejected';
  body.message = 'ภาพสลิปไม่ผ่านการตรวจ กรุณาส่งภาพสลิปที่ถูกต้องตามเวลาที่กำหนด หากหมดเวลาหรือส่งไม่ได้ให้ติดต่อผู้จัด หลักฐานเดิมยังเก็บอยู่ อย่าโอนซ้ำ';
  const headers = new Headers(response.headers); headers.delete('Content-Length');
  return new Response(JSON.stringify(body), { status: response.status, headers });
}
