import assert from 'node:assert/strict';
import { test } from 'node:test';
import { receiptUploadResponse } from './receiptResponse';

for (const code of [1005, 1006, 1007, 1008]) test('upload response exposes rejected image code ' + code + ' without promising a seat', async () => {
  const response = Response.json({ receipt: { id: 'fixture', status: 'pending', submittedAfterHold: true, verification: { provider: 'slipok', status: 'rejected', code } }, message: 'old pending message' }, { status: 201, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  const result = await receiptUploadResponse(response), body = await result.json();
  assert.equal(result.status, 201); assert.equal(body.receipt.status, 'rejected');
  assert.equal(body.receipt.submittedAfterHold, true); assert.equal(body.receipt.id, 'fixture');
  assert.match(body.message, /อย่าโอนซ้ำ/); assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
});

test('ambiguous bank results and database errors keep their original response contract', async () => {
  for (const code of [1009, 1010, 1011, 1012, 1013, 1014]) {
    const response = Response.json({ receipt: { status: 'pending', verification: { provider: 'slipok', status: 'rejected', code } } }, { status: 201 });
    assert.equal(await receiptUploadResponse(response), response);
    assert.equal((await response.json()).receipt.status, 'pending');
  }
  const unavailable = Response.json({ message: 'Please check the saved booking status' }, { status: 503 });
  assert.equal(await receiptUploadResponse(unavailable), unavailable);
});
