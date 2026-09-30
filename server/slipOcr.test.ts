import assert from 'node:assert/strict';
import test from 'node:test';
import { readSlipOcr } from './slipOcr';

test('calls a private Gradio Space and normalizes its completed result', async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const responses = [
    new Response(JSON.stringify(['/tmp/gradio/slip.png']), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({ event_id: 'receipt_123' }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response('event: complete\ndata: [{"result":{"amount":190,"reference":"ABC123","confidence":0.9}}]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
  ];
  const transport: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({ url: String(input), authorization: headers.get('authorization') });
    const response = responses.shift();
    if (!response) throw new Error('Unexpected request');
    return response;
  };

  const result = await readSlipOcr(Buffer.from('image'), 'image/png', 'https://private-space.hf.space', 'hf_test', transport);

  assert.equal(result.status, 'complete');
  assert.equal(result.amount, 190);
  assert.equal(result.reference, 'ABC123');
  assert.deepEqual(requests.map(request => new URL(request.url).pathname), [
    '/gradio_api/upload',
    '/gradio_api/call/ocr',
    '/gradio_api/call/ocr/receipt_123',
  ]);
  assert.ok(requests.every(request => request.authorization === 'Bearer hf_test'));
});

test('keeps raw HTTPS OCR endpoints compatible', async () => {
  const transport: typeof fetch = async () => new Response(JSON.stringify({ result: { amount: 250 } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  const result = await readSlipOcr(Buffer.from('image'), 'image/jpeg', 'https://ocr.example/ocr', 'token', transport);
  assert.equal(result.status, 'complete');
  assert.equal(result.amount, 250);
});
