import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { coachingRouter } from './coaching';

test('coaching: pricing, payment, scheduling, cancellation and persistence', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'chicken-coaching-'));
  const file = path.join(dir, 'state.json');
  const app = express(); app.use(express.json()); app.use('/api', coachingRouter(file));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  const call = async (route: string, body?: unknown) => {
    const res = await fetch(`http://127.0.0.1:${port}${route}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  try {
    const draft = { coachId: 'bank', student: 'ทดสอบ', phone: '0812345678', hours: 1.5, amount: 1 };
    assert.equal((await call('/api/enrollments', { ...draft, hours: -1 })).status, 400);
    assert.equal((await call('/api/enrollments', { ...draft, courseId: 'unknown' })).status, 400);
    const hourly = (await call('/api/enrollments', draft)).data;
    assert.equal(hourly.amount, 900);
    const course = (await call('/api/enrollments', { ...draft, courseId: 'foundation' })).data;
    assert.equal(course.amount, 3200); assert.equal(course.totalHours, 6);
    const start = new Date(Date.now() + 86400000).toISOString();
    const base = '/api/enrollments/' + course.id;
    assert.equal((await call(base + '/lessons', { start, hours: 1 })).status, 409);
    await call(base + '/payment', { method: 'cash' });
    const repeat = await call(base + '/payment', { method: 'transfer' });
    assert.equal(repeat.data.paymentMethod, 'cash');
    assert.equal((await call(base + '/lessons', { start, hours: 7 })).status, 400);
    const booked = await call(base + '/lessons', { start, hours: 4 });
    assert.equal(booked.status, 201);
    assert.equal((await call(base + '/lessons', { start, hours: 1 })).status, 409);
    await call('/api/enrollments/' + hourly.id + '/payment', { method: 'transfer' });
    assert.equal((await call('/api/enrollments/' + hourly.id + '/lessons', { start, hours: 1 })).status, 409);
    const later = new Date(Date.parse(start) + 86400000).toISOString();
    assert.equal((await call(base + '/lessons', { start: later, hours: 3 })).status, 409);
    const lesson = booked.data.lessons[0];
    assert.equal((await call(base + '/lessons/' + lesson.id, { status: 'completed' })).status, 409);
    await call(base + '/lessons/' + lesson.id, { status: 'cancelled' });
    assert.equal((await call(base + '/lessons', { start, hours: 4 })).status, 201);
    app.use('/reloaded', coachingRouter(file));
    assert.equal((await call('/reloaded')).data.enrollments.length, 2);
    app.use('/production', coachingRouter(file, false));
    assert.equal((await call('/production')).status, 503);
    assert.equal((await call('/production/enrollments', draft)).status, 503);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(dir, { recursive: true }); }
});
