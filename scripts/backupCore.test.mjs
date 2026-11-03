import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemas, hash, tableHash, sealBackup, openBackup, validateBackup, receiptReferences, assertRestoreTarget, databaseIdentity, insertBatches } from './backupCore.mjs';

const key = '12'.repeat(32), sourceUrl = 'mysql://fixture:fixture@db.example:4000/live', targetUrl = 'mysql://fixture:fixture@db.example:4000/chick_pick_restore_drill_fixture';
const sourceKv = 'a'.repeat(32), targetKv = 'b'.repeat(32), bytes = Buffer.from([137,80,78,71,13,10,26,10]);
function fixture() {
  const receipt = { id: 'fixture-receipt', sha256: hash(bytes), mimeType: 'image/png' };
  const tables = Object.fromEntries(Object.keys(schemas).map(name => [name, []]));
  tables.app_documents = [{ document_key: 'marketplace', payload: JSON.stringify({ bookings: [{ playerId: 'private-player', receipts: [receipt], refund: { status: 'pending', receivedAmount: 19000 } }] }), version: '123', updated_at: '2026-11-03 00:00:00.000' }];
  return { format: 'chick-pick-snapshot', version: 1, createdAt: '2026-11-03T00:00:00Z', source: { database: databaseIdentity(sourceUrl), cloudflare: { accountId: 'c'.repeat(32), namespaceId: sourceKv } }, tables, digests: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, tableHash(name, rows)])), kv: [{ key: 'receipt:fixture-receipt', data: bytes.toString('base64'), sha256: hash(bytes) }] };
}
test('encrypted snapshot round trip retains financial records and exact image bytes without plaintext identities', () => {
  const backup = fixture(), text = sealBackup(backup, key), reopened = openBackup(text, key);
  assert.deepEqual(reopened, backup); assert.doesNotMatch(text, /private-player|fixture-receipt|receivedAmount/);
  assert.equal(Buffer.from(reopened.kv[0].data, 'base64').equals(bytes), true);
  assert.notEqual(sealBackup(backup, key), text, 'each backup has an independent nonce');
});
test('wrong key, modified tag, truncated ciphertext and unsupported format all fail authentication', () => {
  const encrypted = sealBackup(fixture(), key);
  assert.throws(() => openBackup(encrypted, '34'.repeat(32)), /authentication/);
  for (const changed of [{ tag: Buffer.alloc(16).toString('base64') }, { data: 'AA==' }, { version: 2 }, { iv: 'AA==' }]) assert.throws(() => openBackup(JSON.stringify({ ...JSON.parse(encrypted), ...changed }), key), /authentication/);
  assert.throws(() => openBackup(encrypted.slice(0, -1), key));
  assert.throws(() => sealBackup(fixture(), 'too-short'), /64 hexadecimal/);
});
test('missing, duplicate, modified and expiring receipt images cannot be reported as a complete backup', () => {
  for (const type of ['missing', 'duplicate', 'modified', 'expired']) {
    const b = fixture();
    if (type === 'missing') b.kv = [];
    if (type === 'duplicate') b.kv.push(b.kv[0]);
    if (type === 'modified') b.kv[0].data = Buffer.from('different').toString('base64');
    if (type === 'expired') b.kv[0].expiration = 1234;
    assert.throws(() => validateBackup(b), type);
  }
});
test('database integrity, unsupported schema, added columns and duplicate document keys fail closed', () => {
  for (const type of ['version', 'table', 'column', 'duplicate']) {
    const b = fixture();
    if (type === 'version') b.tables.app_documents[0].version = '999';
    if (type === 'table') b.tables.unknown = [];
    if (type === 'column') b.tables.app_documents[0].unexpected = 'field';
    if (type === 'duplicate') { b.tables.app_documents.push(b.tables.app_documents[0]); b.digests.app_documents = tableHash('app_documents', b.tables.app_documents); }
    assert.throws(() => validateBackup(b), type);
  }
});
test('canonical table digests survive JSON formatting, key order and row ordering changes', () => {
  const rows = fixture().tables.app_documents, alternate = [{ ...rows[0], payload: { bookings: [{ refund: { receivedAmount: 19000, status: 'pending' }, receipts: [{ mimeType: 'image/png', sha256: hash(bytes), id: 'fixture-receipt' }], playerId: 'private-player' }] } }];
  assert.equal(tableHash('app_documents', rows), tableHash('app_documents', alternate));
});
test('restore refuses production, source-equivalent schema, source KV, live KV and hostile database names', () => {
  const backup = fixture();
  assert.equal(assertRestoreTarget(backup, targetUrl, targetKv, sourceUrl, sourceKv).schema, 'chick_pick_restore_drill_fixture');
  for (const schema of ['live', 'other', 'chick_pick_restore_drill_x;DROP', 'chick_pick_restore_drill_x/y']) assert.throws(() => assertRestoreTarget(backup, 'mysql://fixture:fixture@db.example:4000/' + schema, targetKv, sourceUrl, sourceKv));
  for (const id of [sourceKv, 'not-a-namespace', 'd'.repeat(32)]) assert.throws(() => assertRestoreTarget(backup, targetUrl, id, sourceUrl, 'd'.repeat(32)));
  backup.source.database.schema = 'CHICK_PICK_RESTORE_DRILL_FIXTURE'; assert.throws(() => assertRestoreTarget(backup, targetUrl, targetKv, sourceUrl, sourceKv));
});
test('both game and coach receipts are checked including legacy images without a stored hash', () => {
  const b = fixture(); b.tables.app_documents.push({ document_key: 'coaching', payload: JSON.stringify([{ receipts: [{ id: 'legacy', mimeType: 'image/png' }] }]), version: '1', updated_at: '2026-11-03 00:00:00.000' });
  assert.equal(receiptReferences(b.tables.app_documents).size, 2);
  b.digests.app_documents = tableHash('app_documents', b.tables.app_documents);
  assert.throws(() => validateBackup(b), /missing/);
  b.kv.push({ key: 'receipt:legacy', data: bytes.toString('base64'), sha256: hash(bytes) }); assert.doesNotThrow(() => validateBackup(b));
});
test('database receipt blobs are validated separately from Cloudflare KV images', () => {
  const b = fixture(); b.tables.receipt_blobs.push({ receipt_id: 'blob', mime_type: 'image/png', sha256: hash(bytes), bytes_base64: bytes.toString('base64'), created_at: '2026-11-03 00:00:00.000' });
  b.digests.receipt_blobs = tableHash('receipt_blobs', b.tables.receipt_blobs); assert.doesNotThrow(() => validateBackup(b));
  b.tables.receipt_blobs[0].sha256 = 'f'.repeat(64); b.digests.receipt_blobs = tableHash('receipt_blobs', b.tables.receipt_blobs); assert.throws(() => validateBackup(b), /image hash/);
});
test('offline verification failure never prints secrets, database URL or decrypted private records', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'chick-pick-backup-'));
  try {
    const file = path.join(temp, 'snapshot.cpbackup'); writeFileSync(file, sealBackup(fixture(), key));
    const cli = fileURLToPath(new URL('./cloudBackup.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [cli, 'verify', '--file', file], { encoding: 'utf8', env: { ...process.env, BACKUP_ENCRYPTION_KEY: '34'.repeat(32), TIDB_DATABASE_URL: sourceUrl } });
    assert.equal(result.status, 1); assert.match(result.stderr, /authentication/);
    assert.doesNotMatch(result.stdout + result.stderr, /mysql:\/\/|private-player|fixture-receipt/);
    assert.equal((result.stdout + result.stderr).includes(key), false);
  } finally { assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep + 'chick-pick-backup-')); rmSync(temp, { recursive: true, force: true }); }
});

test('restore uses bounded parameterized batches and never resurrects old login sessions', () => {
  const row = fixture().tables.app_documents[0], rows = Array.from({ length: 205 }, (_, i) => ({ ...row, document_key: 'doc-' + i }));
  const batches = insertBatches('app_documents', rows);
  assert.equal(batches.length, 3); assert.equal(batches[0].parameters.length, 400); assert.equal(batches[2].parameters.length, 20);
  assert.doesNotMatch(batches[0].sql, /private-player/); assert.match(batches[0].sql, /INSERT INTO app_documents/);
  assert.deepEqual(insertBatches('admin_sessions', [{ token_hash: 'old', expires_at: 'future', created_at: 'past' }]), []);
  assert.throws(() => insertBatches('app_documents;DROP', []), /Unsupported/);
});
