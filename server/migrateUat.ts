import 'dotenv/config';
import { tidbPool } from './marketplaceStore';
import { initializeUat } from './uatBootstrap';

const pool = tidbPool();
try {
  await initializeUat(pool);
  console.log('UAT tables and required documents are ready. New installations remain closed for bookings.');
} finally {
  await pool.end();
}
