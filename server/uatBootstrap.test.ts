import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'mysql2/promise';
import { initializeUat } from './uatBootstrap';

function fixture(databaseName: unknown = 'chick_pick_uat') {
  const documents = new Map<string, string>();
  const writes: string[] = [];
  let failOnce = false;
  const pool = {
    query: async (sql: string) => {
      assert.match(sql, /^CREATE TABLE IF NOT EXISTS /);
      writes.push(sql); return [[], []];
    },
    execute: async (sql: string, values: unknown[] = []) => {
      if (sql === 'SELECT DATABASE() AS databaseName') return [[{ databaseName }], []];
      if (sql.startsWith('INSERT IGNORE INTO app_documents')) {
        if (failOnce && values[0] === 'worker-pilot') { failOnce = false; throw Error('simulated interrupted initialization'); }
        writes.push(sql);
        if (!documents.has(String(values[0]))) documents.set(String(values[0]), String(values[1]));
        return [{ affectedRows: 1 }, []];
      }
      assert.equal(sql, 'SELECT payload FROM app_documents WHERE document_key = ?');
      const value = documents.get(String(values[0]));
      return [value === undefined ? [] : [{ payload: value }], []];
    },
  } as unknown as Pool;
  return { pool, documents, writes, interruptOnce: () => { failOnce = true; } };
}

test('fresh UAT contains the required marketplace and stays closed for bookings', async () => {
  const f = fixture(); await initializeUat(f.pool);
  assert.deepEqual(JSON.parse(f.documents.get('marketplace')!), { sessions: [], bookings: [], profiles: [] });
  assert.deepEqual(JSON.parse(f.documents.get('worker-pilot')!), { bookingEnabled: false, paymentProvider: 'manual' });
  assert.equal(f.documents.has('worker-organizer'), false);
  assert.equal(f.documents.has('transfer-account'), false);
});

test('UAT initialization is idempotent and never replaces real existing fixture data', async () => {
  const f = fixture();
  const original = JSON.stringify({ sessions: [{ id: 'preserve-session' }], bookings: [{ id: 'preserve-booking' }], profiles: [] });
  f.documents.set('marketplace', original);
  f.documents.set('worker-pilot', JSON.stringify({ bookingEnabled: true, paymentProvider: 'manual' }));
  await initializeUat(f.pool); await initializeUat(f.pool);
  assert.equal(f.documents.get('marketplace'), original);
  assert.equal(JSON.parse(f.documents.get('worker-pilot')!).bookingEnabled, true);
});

test('non-UAT, missing and misleading selected database names cause no writes', async () => {
  for (const name of ['production', 'production_uatish', 'uat;DROP TABLE', '', null, undefined]) {
    const f = fixture(name === undefined ? null : name);
    await assert.rejects(initializeUat(f.pool), /dedicated UAT schema/);
    assert.equal(f.writes.length, 0); assert.equal(f.documents.size, 0);
  }
});

test('interrupted UAT startup can resume without replacing the first inserted document', async () => {
  const f = fixture(); f.interruptOnce();
  await assert.rejects(initializeUat(f.pool), /interrupted initialization/);
  const original = f.documents.get('marketplace');
  assert.ok(original); assert.equal(f.documents.has('worker-pilot'), false);
  await initializeUat(f.pool);
  assert.equal(f.documents.get('marketplace'), original);
  assert.equal(JSON.parse(f.documents.get('worker-pilot')!).bookingEnabled, false);
});

test('corrupt existing UAT data is reported and not silently overwritten', async () => {
  const f = fixture(); const corrupt = JSON.stringify({ bookings: [] });
  f.documents.set('marketplace', corrupt);
  await assert.rejects(initializeUat(f.pool), /malformed/);
  assert.equal(f.documents.get('marketplace'), corrupt);
});
