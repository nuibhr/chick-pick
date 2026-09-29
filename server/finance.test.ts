import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createFinance, thaiDate } from './finance';

test('finance authentication, exact totals, status transitions, source integration and export', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cb-finance-'));
  const app = express(); app.use(express.json()); const finance = createFinance(dir, true); app.use('/api/finance', finance.router);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r)); const root = `http://127.0.0.1:${(server.address() as any).port}/api/finance`;
  let cookie = '';
  const call = async (url: string, body?: unknown, headers: Record<string, string> = {}) => { const r = await fetch(root + url, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: r.status, headers: r.headers, text: await r.text() }; };
  const json = (r: { text: string }) => JSON.parse(r.text);
  try {
    assert.equal((await call('/report')).status, 401);
    assert.equal((await call('/export')).status, 401);
    assert.equal((await call('/auth', { password: 'test-only-password', setup: true }, { Origin: 'https://other.example' })).status, 403);
    const auth = await call('/auth', { password: 'test-only-password', setup: true }); assert.equal(auth.status, 200); cookie = auth.headers.get('set-cookie')!.split(';')[0]; assert.match(auth.headers.get('set-cookie')!, /HttpOnly/);
    assert.ok(!readFileSync(path.join(dir, 'admin.json'), 'utf8').includes('test-only-password'));
    assert.equal((await call('/auth', { password: 'replace-password', setup: true })).status, 409);
    const draft = { type: 'expense', category: 'venue', amount: 12345, description: '=FORMULA()', counterparty: 'สนามทดสอบ', date: thaiDate(), method: 'transfer', status: 'pending', reference: 'TEST', requestId: randomUUID() };
    assert.equal((await call('/entries', { ...draft, amount: 1.1 })).status, 400);
    assert.equal((await call('/entries', { ...draft, category: 'coaching' })).status, 400);
    assert.equal((await call('/entries', { ...draft, date: '2026-02-30' })).status, 400);
    const row = json(await call('/entries', draft)); await call('/entries', draft);
    let report = json(await call('/report')); assert.equal(report.rows.length, 1); assert.equal(report.summary.expense, 0); assert.equal(report.summary.pendingExpense, 12345);
    await call('/entries/' + row.id, { action: 'settle', settledOn: thaiDate() }); await call('/entries/' + row.id, { action: 'settle', settledOn: thaiDate() });
    assert.equal(json(await call('/report')).summary.expense, 12345);
    writeFileSync(path.join(dir, 'coaching.json'), JSON.stringify([{ id: 'lesson1', title: 'คอร์ส', student: 'ผู้เรียน', amount: 600, createdAt: new Date().toISOString(), paidAt: new Date().toISOString(), payment: 'paid', paymentMethod: 'cash' }, { id: 'lesson2', title: 'คอร์สรอ', student: 'ผู้เรียน 2', amount: 800, createdAt: new Date().toISOString(), payment: 'pending' }]));
    const gameId = finance.recordGame('game1', 'player1', 'ผู้เล่น', 'ก๊วน', 190); assert.equal(finance.recordGame('game1', 'player1', 'ผู้เล่น', 'ก๊วน', 190), gameId);
    report = json(await call('/report')); assert.equal(report.summary.income, 79000); assert.equal(report.summary.pendingIncome, 80000); assert.equal(report.summary.net, 66655);
    assert.equal(json(await call('/report?category=coaching')).rows.length, 2);
    assert.equal((await call('/entries/coach_lesson1', { action: 'void', reason: 'ทดสอบ' })).status, 409);
    const csv = await call('/export'); assert.match(csv.text, /'=FORMULA/); assert.match(csv.headers.get('content-type')!, /text\/csv/);
    assert.equal((await call('/report?from=2026-10-01&to=2026-01-01')).status, 400);
    assert.equal((await call('/entries/' + row.id, { action: 'void', reason: '' })).status, 400);
    await call('/entries/' + row.id, { action: 'void', reason: 'บันทึกซ้ำ' }); report = json(await call('/report')); assert.equal(report.summary.expense, 0); assert.equal(report.rows.find((r: any) => r.id === row.id).history.length, 3);
    await call('/logout', {}); assert.equal((await call('/report')).status, 401);
    assert.equal((await call('/auth', { password: 'wrong-password' })).status, 401);
    assert.equal((await call('/auth', { password: 'test-only-password' })).status, 200);
    const reloaded = createFinance(dir, true); assert.equal(reloaded.recordGame('game1', 'player1', 'ผู้เล่น', 'ก๊วน', 190), gameId);
    app.use('/production', createFinance(dir, false).router); assert.equal((await fetch(root.replace('/api/finance', '/production/auth'))).status, 503);
    assert.equal(thaiDate(new Date('2026-09-17T18:00:00Z')), '2026-09-18');
  } finally { await new Promise<void>(r => server.close(() => r())); rmSync(dir, { recursive: true }); }
});
