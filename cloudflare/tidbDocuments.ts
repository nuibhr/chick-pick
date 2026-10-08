import { connect } from '@tidbcloud/serverless';
import type { MarketplaceData, TransferAccount } from '../src/marketplaceTypes';
import type { PilotContext } from './pilotDomain';
import { financeKeys, type FinanceDocuments } from './financeDomain';
import { activeTransferAccount, type TransferSettings } from '../src/paymentChannels';

export type Audit = { actorId: string; action: string; entityId: string; actorType?: 'admin' | 'line'; entityType?: string };

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

  async readFinance(): Promise<FinanceDocuments> {
    const rows = (await this.db.execute(`SELECT document_key, payload FROM app_documents WHERE document_key IN (${financeKeys.map(() => '?').join(',')})`, [...financeKeys])).rows as Row[] | null;
    return this.financeDocuments(rows || []);
  }

  private financeDocuments(rows: Row[]): FinanceDocuments {
    const values = Object.fromEntries(rows.map(row => [String(row.document_key), typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload]));
    if (!Array.isArray(values.marketplace?.bookings) || !Array.isArray(values.marketplace?.sessions)) throw Error('Missing marketplace');
    for (const key of financeKeys.filter(k => k !== 'marketplace')) { values[key] ??= []; if (!Array.isArray(values[key])) throw Error('Invalid financial document'); }
    return structuredClone(values) as FinanceDocuments;
  }

  async updateFinance<T>(mutate: (docs: FinanceDocuments, context: PilotContext) => T | Promise<T>, audit: Audit): Promise<T> {
    const tx = await this.db.begin();
    try {
      // Same first lock as booking and receipt mutations, then sorted financial rows.
      const market = (await tx.execute('SELECT document_key, payload FROM app_documents WHERE document_key = ? FOR UPDATE', ['marketplace'])).rows as Row[] | null;
      if (!market?.length) throw Error('Missing marketplace');
      for (const key of financeKeys.filter(k => k !== 'marketplace')) await tx.execute('INSERT IGNORE INTO app_documents (document_key, payload) VALUES (?, ?)', [key, '[]']);
      const remaining = financeKeys.filter(k => k !== 'marketplace');
      const rows = (await tx.execute(`SELECT document_key, payload FROM app_documents WHERE document_key IN (${remaining.map(() => '?').join(',')}) ORDER BY document_key FOR UPDATE`, [...remaining])).rows as Row[] | null;
      const docs = this.financeDocuments([...market, ...(rows || [])]);
      const settingsRows = (await tx.execute('SELECT document_key, payload FROM app_documents WHERE document_key IN (?, ?) ORDER BY document_key FOR UPDATE', ['transfer-account', 'worker-pilot'])).rows as Row[] | null;
      const settings = new Map((settingsRows || []).map(row => [String(row.document_key), typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload]));
      const context: PilotContext = { enabled: settings.get('worker-pilot')?.bookingEnabled === true, venues: docs['court-venues'], paymentProvider: 'manual', account: activeTransferAccount(settings.get('transfer-account') || null), closed: docs['revenue-settlements'].map(s => s.key) };
      const before = new Map(financeKeys.map(key => [key, JSON.stringify(docs[key])]));
      const result = await mutate(docs, context);
      for (const key of financeKeys) if (JSON.stringify(docs[key]) !== before.get(key)) await tx.execute('UPDATE app_documents SET payload = ?, version = version + 1 WHERE document_key = ?', [JSON.stringify(docs[key]), key]);
      await tx.execute('INSERT INTO audit_events (id, actor_type, actor_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)', [crypto.randomUUID(), audit.actorType || 'admin', audit.actorId, audit.action, audit.entityType || 'finance', audit.entityId, null]);
      await tx.commit(); return result;
    } catch (e) { await tx.rollback(); throw e; }
  }

  async updateMarketplace<T>(mutate: (data: MarketplaceData, context: PilotContext) => T | Promise<T>, audit?: Audit, pilot = false): Promise<T> {
    const tx = await this.db.begin();
    try {
      const data = document<MarketplaceData>((await tx.execute('SELECT payload FROM app_documents WHERE document_key = ? FOR UPDATE', ['marketplace'])).rows as Row[] | null);
      let context: PilotContext = { account: null, enabled: false, closed: [] };
      if (pilot) {
        const rows = (await tx.execute('SELECT document_key, payload FROM app_documents WHERE document_key IN (?, ?, ?, ?) ORDER BY document_key FOR UPDATE', ['transfer-account', 'worker-pilot', 'revenue-settlements', 'court-venues'])).rows as Row[] | null;
        const values = new Map((rows || []).map(row => [String(row.document_key), typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload]));
        context = { venues: values.get('court-venues') || [], account: activeTransferAccount(values.get('transfer-account') || null), enabled: values.get('worker-pilot')?.bookingEnabled === true, paymentProvider: 'manual', closed: (values.get('revenue-settlements') || []).map((row: { key: string }) => row.key) };
      }
      const result = await mutate(data, context);
      await tx.execute('UPDATE app_documents SET payload = ?, version = version + 1 WHERE document_key = ?', [JSON.stringify(data), 'marketplace']);
      if (audit) await tx.execute('INSERT INTO audit_events (id, actor_type, actor_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), audit.actorType || 'line', audit.actorId, audit.action, audit.entityType || 'player', audit.entityId, null]);
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

  async updateDocument<T, R>(key: string, fallback: T, mutate: (value: T) => R | Promise<R>, audit?: Audit): Promise<R> {
    const tx = await this.db.begin();
    try {
      await tx.execute('INSERT IGNORE INTO app_documents (document_key, payload) VALUES (?, ?)', [key, JSON.stringify(fallback)]);
      const value = document<T>((await tx.execute('SELECT payload FROM app_documents WHERE document_key = ? FOR UPDATE', [key])).rows as Row[] | null);
      const result = await mutate(value);
      await tx.execute('UPDATE app_documents SET payload = ?, version = version + 1 WHERE document_key = ?', [JSON.stringify(value), key]);
      if (audit) await tx.execute('INSERT INTO audit_events (id, actor_type, actor_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)', [crypto.randomUUID(), audit.actorType || 'admin', audit.actorId, audit.action, audit.entityType || 'settings', audit.entityId, null]);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async readTransferAccount(): Promise<TransferAccount | null> {
    return activeTransferAccount(await this.readDocument<TransferSettings | null>('transfer-account', null));
  }

  async isSessionClosed(sessionId: string): Promise<boolean> {
    const settlements = await this.readDocument<{ key?: unknown }[]>('revenue-settlements', []);
    return settlements.some(row => row.key === `game:${sessionId}`);
  }
}
