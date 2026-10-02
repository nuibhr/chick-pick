import { connect } from '@tidbcloud/serverless';
import type { MarketplaceData, TransferAccount } from '../src/marketplaceTypes';

type Row = Record<string, unknown>;

function document<T>(rows: Row[] | null, fallback?: T): T {
  if (!rows?.[0]) {
    if (fallback !== undefined) return structuredClone(fallback);
    throw new Error('Required TiDB document is missing');
  }
  const payload = rows[0].payload;
  return structuredClone((typeof payload === 'string' ? JSON.parse(payload) : payload) as T);
}

export class TidbDocuments {
  private readonly db;

  constructor(connectionUrl: string) {
    if (!connectionUrl) throw new Error('TIDB_DATABASE_URL is required');
    this.db = connect({ url: connectionUrl, fullResult: true });
  }

  async readMarketplace(): Promise<MarketplaceData> {
    const result = await this.db.execute('SELECT payload FROM app_documents WHERE document_key = ?', ['marketplace']);
    const data = document<MarketplaceData>(result.rows as Row[] | null);
    if (!Array.isArray(data.sessions) || !Array.isArray(data.bookings)) throw new Error('Marketplace document is invalid');
    return data;
  }

  async updateMarketplace<T>(mutate: (data: MarketplaceData) => T | Promise<T>): Promise<T> {
    const tx = await this.db.begin();
    try {
      const data = document<MarketplaceData>((await tx.execute('SELECT payload FROM app_documents WHERE document_key = ? FOR UPDATE', ['marketplace'])).rows as Row[] | null);
      const result = await mutate(data);
      await tx.execute('UPDATE app_documents SET payload = ?, version = version + 1 WHERE document_key = ?', [JSON.stringify(data), 'marketplace']);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async readDocument<T>(key: string, fallback: T): Promise<T> {
    const result = await this.db.execute('SELECT payload FROM app_documents WHERE document_key = ?', [key]);
    return document<T>(result.rows as Row[] | null, fallback);
  }

  async updateDocument<T, R>(key: string, fallback: T, mutate: (value: T) => R | Promise<R>): Promise<R> {
    const tx = await this.db.begin();
    try {
      await tx.execute('INSERT IGNORE INTO app_documents (document_key, payload) VALUES (?, ?)', [key, JSON.stringify(fallback)]);
      const value = document<T>((await tx.execute('SELECT payload FROM app_documents WHERE document_key = ? FOR UPDATE', [key])).rows as Row[] | null);
      const result = await mutate(value);
      await tx.execute('UPDATE app_documents SET payload = ?, version = version + 1 WHERE document_key = ?', [JSON.stringify(value), key]);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async readTransferAccount(): Promise<TransferAccount | null> {
    return this.readDocument<TransferAccount | null>('transfer-account', null);
  }

  async isSessionClosed(sessionId: string): Promise<boolean> {
    const settlements = await this.readDocument<{ key?: unknown }[]>('revenue-settlements', []);
    return settlements.some(row => row.key === `game:${sessionId}`);
  }
}
