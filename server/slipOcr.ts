import type { SlipOcr } from '../src/marketplaceTypes';

const empty = (status: SlipOcr['status']): SlipOcr => ({ status, amount: null, transferredAt: null, reference: null, sender: null, receiver: null, rawText: null, confidence: null });
const short = (value: unknown, limit = 160) => typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null;

export function normalizeSlipOcr(payload: unknown): SlipOcr {
  const response = Array.isArray(payload) ? payload[0] : payload;
  if (!response || typeof response !== 'object') return empty('failed');
  const source = response as Record<string, unknown>;
  const generated = short(source.generated_text, 4000);
  let fields = source.result && typeof source.result === 'object' ? source.result as Record<string, unknown> : source;
  if (generated) {
    try {
      const parsed = JSON.parse(generated.replace(/^```(?:json)?\s*|\s*```$/g, ''));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) fields = parsed;
    } catch { /* Plain OCR text is useful even when it is not JSON. */ }
  }
  const rawAmount = fields.amount ?? fields.total_amount;
  const amount = typeof rawAmount === 'number' ? rawAmount : typeof rawAmount === 'string' ? Number(rawAmount.replace(/[,฿\s]/g, '')) : NaN;
  const rawConfidence = fields.confidence;
  const confidence = typeof rawConfidence === 'number' && rawConfidence >= 0 && rawConfidence <= 1 ? rawConfidence : null;
  const parsed: SlipOcr = {
    status: 'complete',
    amount: Number.isFinite(amount) && amount >= 0 && amount <= 10_000_000 ? amount : null,
    transferredAt: short(fields.transferredAt ?? fields.transferred_at ?? fields.date, 80),
    reference: short(fields.reference ?? fields.transaction_id ?? fields.ref, 120),
    sender: short(fields.sender, 120),
    receiver: short(fields.receiver ?? fields.recipient, 120),
    rawText: short(fields.rawText ?? fields.raw_text ?? generated, 4000),
    confidence,
  };
  return parsed.amount !== null || parsed.transferredAt || parsed.reference || parsed.sender || parsed.receiver || parsed.rawText ? parsed : empty('failed');
}

export async function readSlipOcr(image: Buffer, mimeType: string, endpoint = process.env.HF_OCR_ENDPOINT_URL, token = process.env.HF_OCR_TOKEN, transport: typeof fetch = fetch): Promise<SlipOcr> {
  if (!endpoint || !token) return empty('unavailable');
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') return empty('failed');
    const response = await transport(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType, Accept: 'application/json' },
      body: new Uint8Array(image),
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return empty('failed');
    return normalizeSlipOcr(await response.json());
  } catch { return empty('failed'); }
}
