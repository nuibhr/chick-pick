import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import mysql, { type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise';
import type { MarketplaceData, ReceiptSubmission, TransferAccount } from '../src/marketplaceTypes';
import { loadReceiptImage, removeReceiptImage, storeReceiptImage } from './receiptFiles';
import { readTransferAccount, saveTransferAccount } from './transferSettings';

export type AuditEvent = {
  actorType: 'admin' | 'line' | 'system';
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
};

export interface MarketplaceStore {
  readonly kind: 'local-json' | 'tidb';
  ready(): Promise<void>;
  read(): Promise<MarketplaceData>;
  update<T>(mutate: (data: MarketplaceData) => T | Promise<T>): Promise<T>;
  readDocument<T>(key: string, fallback: T): Promise<T>;
  updateDocument<T, R>(key: string, fallback: T, mutate: (value: T) => R | Promise<R>): Promise<R>;
  readTransferAccount(): Promise<TransferAccount | null>;
  saveTransferAccount(account: TransferAccount): Promise<void>;
  isSessionClosed(sessionId: string): Promise<boolean>;
  putReceiptImage(id: string, bytes: Buffer, mimeType: ReceiptSubmission['mimeType'], sha256: string): Promise<void>;
  getReceiptImage(receipt: ReceiptSubmission): Promise<Buffer | null>;
  removeReceiptImage(receipt: ReceiptSubmission): Promise<void>;
  audit(event: AuditEvent): Promise<void>;
}

export class JsonMarketplaceStore implements MarketplaceStore {
  readonly kind = 'local-json' as const;
  constructor(private readonly file: string, private readonly seed: () => MarketplaceData) {}
  async ready() {
    if (!existsSync(this.file)) this.write(this.seed());
  }
  private write(data: MarketplaceData) {
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file + '.tmp', JSON.stringify(data, null, 2));
    renameSync(this.file + '.tmp', this.file);
  }
  async read() {
    await this.ready();
    return JSON.parse(readFileSync(this.file, 'utf8')) as MarketplaceData;
  }
  async update<T>(mutate: (data: MarketplaceData) => T | Promise<T>) {
    const data = await this.read();
    const result = await mutate(data);
    this.write(data);
    return result;
  }
  private documentFile(key: string) { return path.join(path.dirname(this.file), `${key}.json`); }
  async readDocument<T>(key: string, fallback: T) {
    const file = this.documentFile(key);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as T : structuredClone(fallback);
  }
  async updateDocument<T, R>(key: string, fallback: T, mutate: (value: T) => R | Promise<R>) {
    const value = await this.readDocument(key, fallback); const result = await mutate(value);
    const file = this.documentFile(key); mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file + '.tmp', JSON.stringify(value, null, 2)); renameSync(file + '.tmp', file); return result;
  }
  async readTransferAccount() { return readTransferAccount(this.file); }
  async saveTransferAccount(account: TransferAccount) { saveTransferAccount(this.file, account); }
  async isSessionClosed(sessionId: string) {
    const file = path.join(path.dirname(this.file), 'revenue-settlements.json');
    if (!existsSync(file)) return false;
    const rows = JSON.parse(readFileSync(file, 'utf8')) as { key?: unknown }[];
    return rows.some(row => row.key === `game:${sessionId}`);
  }
  async putReceiptImage(id: string, bytes: Buffer, mimeType: ReceiptSubmission['mimeType']) {
    storeReceiptImage(this.file, bytes, mimeType, id);
  }
  async getReceiptImage(receipt: ReceiptSubmission) { return loadReceiptImage(this.file, receipt); }
  async removeReceiptImage(receipt: ReceiptSubmission) { removeReceiptImage(this.file, receipt); }
  async audit(_event: AuditEvent) { /* Local preview keeps its existing JSON history. */ }
}

type DocumentRow = RowDataPacket & { payload: string | object };
type BlobRow = RowDataPacket & { bytes: Buffer };
const parseDocument = <T>(payload: string | object): T => (typeof payload === 'string' ? JSON.parse(payload) : payload) as T;

export function tidbPool(connectionUrl = process.env.TIDB_DATABASE_URL || ''): Pool {
  if (!connectionUrl) throw new Error('TIDB_DATABASE_URL is required');
  const url = new URL(connectionUrl);
  if (url.protocol !== 'mysql:') throw new Error('TIDB_DATABASE_URL must use mysql://');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!url.hostname || !url.username || !database) throw new Error('TIDB_DATABASE_URL is incomplete');
  return mysql.createPool({
    host: url.hostname,
    port: Number(url.port || 4000),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionLimit: 10,
    waitForConnections: true,
    enableKeepAlive: true,
    decimalNumbers: true,
  });
}

export async function migrateTidb(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS app_documents (
    document_key VARCHAR(191) PRIMARY KEY,
    payload JSON NOT NULL,
    version BIGINT UNSIGNED NOT NULL DEFAULT 1,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS receipt_blobs (
    receipt_id CHAR(36) PRIMARY KEY,
    mime_type VARCHAR(32) NOT NULL,
    sha256 CHAR(64) NOT NULL,
    bytes LONGBLOB NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX receipt_sha256_idx (sha256)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_events (
    id CHAR(36) PRIMARY KEY,
    actor_type VARCHAR(16) NOT NULL,
    actor_id VARCHAR(191) NULL,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id VARCHAR(191) NOT NULL,
    details JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX audit_entity_idx (entity_type, entity_id, created_at),
    INDEX audit_actor_idx (actor_type, actor_id, created_at)
  )`);
}

export class TidbMarketplaceStore implements MarketplaceStore {
  readonly kind = 'tidb' as const;
  private readonly initialized: Promise<void>;
  constructor(private readonly pool: Pool, private readonly seed: () => MarketplaceData) {
    this.initialized = this.initialize();
  }
  private async initialize() {
    await migrateTidb(this.pool);
    await this.pool.execute('INSERT IGNORE INTO app_documents (document_key, payload) VALUES (?, ?)', ['marketplace', JSON.stringify(this.seed())]);
  }
  async ready() { await this.initialized; }
  private async lockedDocument(connection: PoolConnection) {
    const [rows] = await connection.execute<DocumentRow[]>('SELECT payload FROM app_documents WHERE document_key = ? FOR UPDATE', ['marketplace']);
    if (!rows[0]) throw new Error('Marketplace document is missing');
    return parseDocument<MarketplaceData>(rows[0].payload);
  }
  async read() {
    await this.ready();
    const [rows] = await this.pool.execute<DocumentRow[]>('SELECT payload FROM app_documents WHERE document_key = ?', ['marketplace']);
    if (!rows[0]) throw new Error('Marketplace document is missing');
    return structuredClone(parseDocument<MarketplaceData>(rows[0].payload));
  }
  async update<T>(mutate: (data: MarketplaceData) => T | Promise<T>) {
    await this.ready();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const data = await this.lockedDocument(connection);
      const result = await mutate(data);
      await connection.execute('UPDATE app_documents SET payload = ?, version = version + 1 WHERE document_key = ?', [JSON.stringify(data), 'marketplace']);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  async readDocument<T>(key: string, fallback: T) {
    await this.ready();
    const [rows] = await this.pool.execute<DocumentRow[]>('SELECT payload FROM app_documents WHERE document_key = ?', [key]);
    return rows[0] ? structuredClone(parseDocument<T>(rows[0].payload)) : structuredClone(fallback);
  }
  async updateDocument<T, R>(key: string, fallback: T, mutate: (value: T) => R | Promise<R>) {
    await this.ready(); const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<DocumentRow[]>('SELECT payload FROM app_documents WHERE document_key = ? FOR UPDATE', [key]);
      const value = rows[0] ? parseDocument<T>(rows[0].payload) : structuredClone(fallback);
      const result = await mutate(value);
      await connection.execute('INSERT INTO app_documents (document_key, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload), version = version + 1', [key, JSON.stringify(value)]);
      await connection.commit(); return result;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
  async readTransferAccount() {
    await this.ready();
    const [rows] = await this.pool.execute<DocumentRow[]>('SELECT payload FROM app_documents WHERE document_key = ?', ['transfer-account']);
    return rows[0] ? parseDocument<TransferAccount>(rows[0].payload) : null;
  }
  async saveTransferAccount(account: TransferAccount) {
    await this.ready();
    await this.pool.execute('INSERT INTO app_documents (document_key, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload), version = version + 1', ['transfer-account', JSON.stringify(account)]);
  }
  async isSessionClosed(sessionId: string) {
    await this.ready();
    const [rows] = await this.pool.execute<DocumentRow[]>('SELECT payload FROM app_documents WHERE document_key = ?', ['revenue-settlements']);
    return rows[0] ? parseDocument<{ key?: unknown }[]>(rows[0].payload).some(row => row.key === `game:${sessionId}`) : false;
  }
  async putReceiptImage(id: string, bytes: Buffer, mimeType: ReceiptSubmission['mimeType'], sha256: string) {
    await this.ready();
    await this.pool.execute('INSERT INTO receipt_blobs (receipt_id, mime_type, sha256, bytes) VALUES (?, ?, ?, ?)', [id, mimeType, sha256, bytes]);
  }
  async getReceiptImage(receipt: ReceiptSubmission) {
    await this.ready();
    const [rows] = await this.pool.execute<BlobRow[]>('SELECT bytes FROM receipt_blobs WHERE receipt_id = ? AND mime_type = ?', [receipt.id, receipt.mimeType]);
    return rows[0]?.bytes ? Buffer.from(rows[0].bytes) : null;
  }
  async removeReceiptImage(receipt: ReceiptSubmission) {
    await this.ready();
    await this.pool.execute('DELETE FROM receipt_blobs WHERE receipt_id = ?', [receipt.id]);
  }
  async audit(event: AuditEvent) {
    await this.ready();
    await this.pool.execute('INSERT INTO audit_events (id, actor_type, actor_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), event.actorType, event.actorId || null, event.action, event.entityType, event.entityId, event.details ? JSON.stringify(event.details) : null]);
  }
}

export function marketplaceStore(file: string, seed: () => MarketplaceData): MarketplaceStore {
  return process.env.TIDB_DATABASE_URL ? new TidbMarketplaceStore(tidbPool(), seed) : new JsonMarketplaceStore(file, seed);
}
