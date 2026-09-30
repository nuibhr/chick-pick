import { createHash } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';

type CredentialRow = RowDataPacket & { salt: string; password_hash: string };

export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function migrateAdminAuth(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS admin_credentials (
    credential_id TINYINT UNSIGNED PRIMARY KEY,
    salt CHAR(32) NOT NULL,
    password_hash CHAR(128) NOT NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash CHAR(64) PRIMARY KEY,
    expires_at TIMESTAMP(3) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX admin_session_expiry_idx (expires_at)
  )`);
}

export class TidbAdminAuthStore {
  private readonly initialized: Promise<void>;
  constructor(private readonly pool: Pool) { this.initialized = this.initialize(); }
  private async initialize() { await migrateAdminAuth(this.pool); }
  async ready() { await this.initialized; }
  async credential() {
    await this.ready();
    const [rows] = await this.pool.execute<CredentialRow[]>('SELECT salt, password_hash FROM admin_credentials WHERE credential_id = 1');
    return rows[0] ? { salt: rows[0].salt, hash: rows[0].password_hash } : null;
  }
  async createCredential(salt: string, hash: string) {
    await this.ready();
    const [result] = await this.pool.execute('INSERT IGNORE INTO admin_credentials (credential_id, salt, password_hash) VALUES (1, ?, ?)', [salt, hash]);
    return Number((result as { affectedRows?: number }).affectedRows || 0) === 1;
  }
  async createSession(rawToken: string, expiresAt: Date) {
    await this.ready();
    await this.pool.execute('DELETE FROM admin_sessions WHERE expires_at <= CURRENT_TIMESTAMP(3)');
    await this.pool.execute('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)', [hashSessionToken(rawToken), expiresAt]);
  }
  async validSession(rawToken: string) {
    await this.ready();
    const [rows] = await this.pool.execute<RowDataPacket[]>('SELECT 1 FROM admin_sessions WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP(3)', [hashSessionToken(rawToken)]);
    return Boolean(rows[0]);
  }
  async deleteSession(rawToken: string) {
    await this.ready();
    await this.pool.execute('DELETE FROM admin_sessions WHERE token_hash = ?', [hashSessionToken(rawToken)]);
  }
}
