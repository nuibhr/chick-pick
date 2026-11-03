import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

export class BackupError extends Error {}
export const MAX_BACKUP_BYTES = 256 * 1024 * 1024;
const aad = Buffer.from('Chick&Pick encrypted backup v1 / gzip / aes-256-gcm');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const schemas = {
  app_documents: {
    columns: ['document_key', 'payload', 'version', 'updated_at'], key: 'document_key', json: ['payload'],
    select: 'SELECT document_key,CAST(payload AS CHAR) AS payload,CAST(version AS CHAR) AS version,CAST(updated_at AS CHAR) AS updated_at FROM app_documents',
    create: 'CREATE TABLE app_documents (document_key VARCHAR(191) PRIMARY KEY,payload JSON NOT NULL,version BIGINT UNSIGNED NOT NULL DEFAULT 1,updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3))',
  },
  audit_events: {
    columns: ['id', 'actor_type', 'actor_id', 'action', 'entity_type', 'entity_id', 'details', 'created_at'], key: 'id', json: ['details'],
    select: 'SELECT id,actor_type,actor_id,action,entity_type,entity_id,CAST(details AS CHAR) AS details,CAST(created_at AS CHAR) AS created_at FROM audit_events',
    create: 'CREATE TABLE audit_events (id CHAR(36) PRIMARY KEY,actor_type VARCHAR(16) NOT NULL,actor_id VARCHAR(191) NULL,action VARCHAR(80) NOT NULL,entity_type VARCHAR(80) NOT NULL,entity_id VARCHAR(191) NOT NULL,details JSON NULL,created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX audit_entity_idx(entity_type,entity_id,created_at),INDEX audit_actor_idx(actor_type,actor_id,created_at))',
  },
  receipt_blobs: {
    columns: ['receipt_id', 'mime_type', 'sha256', 'bytes_base64', 'created_at'], dbColumns: ['receipt_id', 'mime_type', 'sha256', 'bytes', 'created_at'], key: 'receipt_id', json: [],
    select: 'SELECT receipt_id,mime_type,sha256,TO_BASE64(bytes) AS bytes_base64,CAST(created_at AS CHAR) AS created_at FROM receipt_blobs',
    create: 'CREATE TABLE receipt_blobs (receipt_id CHAR(36) PRIMARY KEY,mime_type VARCHAR(32) NOT NULL,sha256 CHAR(64) NOT NULL,bytes LONGBLOB NOT NULL,created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX receipt_sha256_idx(sha256))',
  },
  admin_credentials: {
    columns: ['credential_id', 'salt', 'password_hash', 'updated_at'], key: 'credential_id', json: [],
    select: 'SELECT CAST(credential_id AS CHAR) AS credential_id,salt,password_hash,CAST(updated_at AS CHAR) AS updated_at FROM admin_credentials',
    create: 'CREATE TABLE admin_credentials (credential_id TINYINT UNSIGNED PRIMARY KEY,salt CHAR(32) NOT NULL,password_hash CHAR(128) NOT NULL,updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3))',
  },
  admin_sessions: {
    columns: ['token_hash', 'expires_at', 'created_at'], key: 'token_hash', json: [],
    select: 'SELECT token_hash,CAST(expires_at AS CHAR) AS expires_at,CAST(created_at AS CHAR) AS created_at FROM admin_sessions',
    create: 'CREATE TABLE admin_sessions (token_hash CHAR(64) PRIMARY KEY,expires_at TIMESTAMP(3) NOT NULL,created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX admin_session_expiry_idx(expires_at))',
  },
};
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
export function normalizedRows(table, rows) {
  const schema = schemas[table];
  if (!schema || !Array.isArray(rows)) throw new BackupError('Unsupported backup table');
  return rows.map(row => {
    if (Object.keys(row).sort().join() !== [...schema.columns].sort().join()) throw new BackupError('Backup table columns do not match the supported schema');
    const result = { ...row };
    for (const col of schema.json) if (result[col] !== null) result[col] = stable(typeof result[col] === 'string' ? JSON.parse(result[col]) : result[col]);
    if (table === 'receipt_blobs') result.bytes_base64 = decodeBase64(result.bytes_base64).toString('base64');
    return stable(result);
  }).sort((a, b) => String(a[schema.key]) < String(b[schema.key]) ? -1 : String(a[schema.key]) > String(b[schema.key]) ? 1 : 0);
}
export const tableHash = (table, rows) => hash(JSON.stringify(normalizedRows(table, rows)));
export function insertBatches(name, rows) {
  const schema = schemas[name]; if (!schema) throw new BackupError('Unsupported restore table');
  if (name === 'admin_sessions') return [];
  const expressions = schema.columns.map(col => col === 'bytes_base64' ? 'FROM_BASE64(?)' : '?').join(',');
  const batches = []; let groups = [], parameters = [], size = 0;
  const flush = () => { if (groups.length) batches.push({ sql: `INSERT INTO ${name} (${(schema.dbColumns || schema.columns).join(',')}) VALUES ${groups.join(',')}`, parameters }); groups = []; parameters = []; size = 0; };
  for (const row of rows) {
    const values = schema.columns.map(col => schema.json.includes(col) && row[col] !== null ? JSON.stringify(typeof row[col] === 'string' ? JSON.parse(row[col]) : row[col]) : row[col]);
    const length = Buffer.byteLength(JSON.stringify(values));
    if (length > 8 * 1024 * 1024) throw new BackupError('Restore row exceeds the serverless request limit');
    if (groups.length >= 100 || size + length > 8 * 1024 * 1024) flush();
    groups.push('(' + expressions + ')'); parameters.push(...values); size += length;
  }
  flush(); return batches;
}
function keyBytes(key) { if (typeof key !== 'string' || !/^[a-f0-9]{64}$/i.test(key)) throw new BackupError('BACKUP_ENCRYPTION_KEY must contain 64 hexadecimal characters'); return Buffer.from(key, 'hex'); }
export function decodeBase64(value) {
  if (typeof value !== 'string') throw new BackupError('Invalid binary backup data');
  const clean = value.replace(/\s/g, '');
  if (clean.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new BackupError('Invalid binary backup encoding');
  const bytes = Buffer.from(clean, 'base64');
  if (bytes.toString('base64') !== clean) throw new BackupError('Noncanonical binary backup encoding');
  return bytes;
}
export function sealBackup(payload, key) {
  const data = Buffer.from(JSON.stringify(payload));
  if (data.length > MAX_BACKUP_BYTES) throw new BackupError('Backup exceeds the pilot bundle limit; use a streaming database backup');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', keyBytes(key), iv); cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(gzipSync(data)), cipher.final()]);
  return JSON.stringify({ format: 'chick-pick-backup', version: 1, algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
}
export function openBackup(text, key) {
  try {
    if (Buffer.byteLength(text) > MAX_BACKUP_BYTES * 2) throw new BackupError();
    const value = JSON.parse(text);
    if (value.format !== 'chick-pick-backup' || value.version !== 1 || value.algorithm !== 'aes-256-gcm') throw new BackupError();
    const iv = decodeBase64(value.iv), tag = decodeBase64(value.tag);
    if (iv.length !== 12 || tag.length !== 16) throw new BackupError();
    const decipher = createDecipheriv('aes-256-gcm', keyBytes(key), iv); decipher.setAAD(aad); decipher.setAuthTag(tag);
    const data = Buffer.concat([decipher.update(decodeBase64(value.data)), decipher.final()]);
    return validateBackup(JSON.parse(gunzipSync(data, { maxOutputLength: MAX_BACKUP_BYTES }).toString('utf8')));
  } catch { throw new BackupError('Backup authentication or integrity check failed; wrong key, damaged file or unsupported format'); }
}
export function receiptReferences(documents) {
  const refs = new Map();
  for (const doc of documents) {
    if (!['marketplace', 'coaching'].includes(doc.document_key)) continue;
    const payload = typeof doc.payload === 'string' ? JSON.parse(doc.payload) : doc.payload;
    const rows = doc.document_key === 'marketplace' ? payload.bookings : payload;
    if (!Array.isArray(rows)) throw new BackupError('Booking document is invalid');
    for (const row of rows) for (const receipt of row.receipts || []) {
      if (typeof receipt.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(receipt.id)) throw new BackupError('Invalid receipt reference');
      if (receipt.sha256 && !/^[a-f0-9]{64}$/i.test(receipt.sha256)) throw new BackupError('Invalid stored receipt digest');
      const previous = refs.get('receipt:' + receipt.id);
      if (previous?.sha256 && receipt.sha256 && previous.sha256 !== receipt.sha256) throw new BackupError('Conflicting receipt references');
      refs.set('receipt:' + receipt.id, { id: receipt.id, sha256: receipt.sha256 || previous?.sha256, mimeType: receipt.mimeType });
    }
  }
  return refs;
}
export function validateBackup(value) {
  if (value?.format !== 'chick-pick-snapshot' || value.version !== 1 || !value.source?.database?.schema || !value.source.database.hostHash || !/^[a-f0-9]{32}$/i.test(value.source?.cloudflare?.namespaceId || '') || !Array.isArray(value.kv) || !value.tables || !value.digests) throw new BackupError('Invalid backup manifest');
  if (Object.keys(value.tables).sort().join() !== Object.keys(schemas).sort().join()) throw new BackupError('Backup tables are incomplete');
  for (const [name, rows] of Object.entries(value.tables)) {
    const normalized = normalizedRows(name, rows), key = schemas[name].key;
    if (new Set(normalized.map(r => r[key])).size !== rows.length || tableHash(name, rows) !== value.digests[name]) throw new BackupError('Backup table integrity mismatch');
    if (name === 'receipt_blobs') for (const row of rows) if (hash(decodeBase64(row.bytes_base64)) !== row.sha256) throw new BackupError('Database receipt image hash mismatch');
  }
  const keys = new Set(), refs = receiptReferences(value.tables.app_documents);
  for (const row of value.kv) {
    if (!/^receipt:[a-zA-Z0-9-]{1,100}$/.test(row.key) || keys.has(row.key) || row.expiration !== undefined) throw new BackupError('Invalid, duplicate or expiring KV receipt');
    keys.add(row.key); const bytes = decodeBase64(row.data);
    if (!bytes.length || bytes.length > 5 * 1024 * 1024 || hash(bytes) !== row.sha256 || refs.get(row.key)?.sha256 && refs.get(row.key).sha256 !== row.sha256) throw new BackupError('KV receipt image integrity mismatch');
  }
  for (const key of refs.keys()) if (!keys.has(key)) throw new BackupError('Referenced KV receipt is missing');
  return value;
}
export function databaseIdentity(connectionUrl) {
  try {
    const url = new URL(connectionUrl), schema = decodeURIComponent(url.pathname.slice(1));
    if (url.protocol !== 'mysql:' || !url.username || !url.password || !/^[a-zA-Z0-9_]{1,64}$/.test(schema)) throw new BackupError();
    return { schema, hostHash: hash(url.hostname.toLowerCase() + ':' + (url.port || '4000')) };
  } catch { throw new BackupError('Database connection configuration is incomplete'); }
}
export function assertRestoreTarget(backup, connectionUrl, namespaceId, liveUrl, liveNamespaceId) {
  const target = databaseIdentity(connectionUrl), live = databaseIdentity(liveUrl);
  if (!/^chick_pick_restore_drill_[a-z0-9_]{1,36}$/i.test(target.schema) || target.schema.toLowerCase() === backup.source.database.schema.toLowerCase() || target.schema.toLowerCase() === live.schema.toLowerCase()) throw new BackupError('Restore only supports a separate chick_pick_restore_drill_* schema; production is never writable');
  if (!/^[a-f0-9]{32}$/i.test(namespaceId || '') || [backup.source.cloudflare.namespaceId, liveNamespaceId].some(id => id?.toLowerCase() === namespaceId.toLowerCase())) throw new BackupError('Restore KV must be different from both the backup source and live receipts');
  return target;
}
export const summary = backup => ({ capturedAt: backup.createdAt, documents: backup.tables.app_documents.length, auditEvents: backup.tables.audit_events.length, databaseImages: backup.tables.receipt_blobs.length, kvImages: backup.kv.length, referencedImages: receiptReferences(backup.tables.app_documents).size });
