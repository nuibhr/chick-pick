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

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
const endpointUrl = (base: URL, path: string) => new URL(path.replace(/^\//, ''), base.href.endsWith('/') ? base : new URL(base.href + '/'));

function gradioResult(body: string): unknown {
  for (const block of body.split(/\r?\n\r?\n/)) {
    const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
    const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
    if (event === 'error') throw new Error('Hugging Face OCR job failed');
    if (event === 'complete' && data) return JSON.parse(data);
  }
  throw new Error('Hugging Face OCR returned no completed result');
}

async function readGradioSlip(image: Buffer, mimeType: string, base: URL, token: string, transport: typeof fetch) {
  const headers = authHeaders(token);
  const form = new FormData();
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  form.append('files', new Blob([new Uint8Array(image)], { type: mimeType }), `slip.${extension}`);
  const uploaded = await transport(endpointUrl(base, '/gradio_api/upload'), {
    method: 'POST', headers, body: form, redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  if (!uploaded.ok) throw new Error('Hugging Face upload failed');
  const uploadBody = await uploaded.json() as unknown;
  const path = Array.isArray(uploadBody) && typeof uploadBody[0] === 'string' ? uploadBody[0] : null;
  if (!path) throw new Error('Hugging Face upload returned no file path');

  const started = await transport(endpointUrl(base, '/gradio_api/call/ocr'), {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ data: [{ path, orig_name: `slip.${extension}`, meta: { _type: 'gradio.FileData' } }] }),
    redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  if (!started.ok) throw new Error('Hugging Face OCR job could not start');
  const eventId = short((await started.json() as Record<string, unknown>).event_id, 200);
  if (!eventId || !/^[A-Za-z0-9_-]+$/.test(eventId)) throw new Error('Hugging Face OCR returned an invalid event id');

  const result = await transport(endpointUrl(base, `/gradio_api/call/ocr/${eventId}`), {
    headers: { ...headers, Accept: 'text/event-stream' }, redirect: 'error', signal: AbortSignal.timeout(90_000),
  });
  if (!result.ok) throw new Error('Hugging Face OCR result failed');
  return gradioResult(await result.text());
}

export async function readSlipOcr(image: Buffer, mimeType: string, endpoint = process.env.HF_OCR_ENDPOINT_URL, token = process.env.HF_OCR_TOKEN, transport: typeof fetch = fetch): Promise<SlipOcr> {
  if (!endpoint || !token) return empty('unavailable');
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') return empty('failed');
    if (!url.pathname.endsWith('/ocr')) return normalizeSlipOcr(await readGradioSlip(image, mimeType, url, token, transport));
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
