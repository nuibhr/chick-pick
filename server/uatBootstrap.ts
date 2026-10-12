import type { Pool, RowDataPacket } from 'mysql2/promise';
import { migrateTidb } from './marketplaceStore';

// Validate the actual selected database, not merely a label in a URL. This is a
// configuration guard, not a substitute for a user restricted to this schema.
export async function assertSelectedUatDatabase(pool: Pool): Promise<void> {
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT DATABASE() AS databaseName');
  const name = rows[0]?.databaseName;
  if (typeof name !== 'string' || !/^[A-Za-z0-9_-]{3,64}$/.test(name) || !/(^|[-_])uat([-_]|$)/i.test(name)) {
    throw new Error('Refusing UAT initialization outside a dedicated UAT schema');
  }
}

export async function initializeUat(pool: Pool): Promise<void> {
  // No CREATE or INSERT occurs until the selected database has been checked.
  await assertSelectedUatDatabase(pool);
  await migrateTidb(pool);
  const initialDocuments = [
    ['marketplace', { sessions: [], bookings: [], profiles: [] }],
    ['worker-pilot', { bookingEnabled: false, paymentProvider: 'manual' }],
  ] as const;
  for (const [key, value] of initialDocuments) {
    // Retrying after an interruption is safe. In particular, never replace an
    // existing marketplace or silently re-enable/disable an existing pilot.
    await pool.execute('INSERT IGNORE INTO app_documents (document_key, payload) VALUES (?, ?)', [key, JSON.stringify(value)]);
  }
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT payload FROM app_documents WHERE document_key = ?', ['marketplace'],
  );
  const payload: unknown = rows[0]?.payload;
  const value = typeof payload === 'string' ? JSON.parse(payload) : payload;
  if (!value || typeof value !== 'object' || !('sessions' in value) || !('bookings' in value)
    || !Array.isArray(value.sessions) || !Array.isArray(value.bookings)) {
    throw new Error('UAT marketplace is missing or malformed; inspect it without replacing existing data');
  }
}
