import 'dotenv/config';
import { migrateTidb, tidbPool } from './marketplaceStore';
import { migrateAdminAuth } from './adminAuthStore';

const pool = tidbPool();
try {
  await migrateTidb(pool);
  await migrateAdminAuth(pool);
  const [rows] = await pool.query('SELECT VERSION() AS version');
  console.log('TiDB migration complete', rows);
} finally {
  await pool.end();
}
