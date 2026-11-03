import { readFileSync, writeFileSync } from 'node:fs';

// Never deploy the live payment handler with production database or KV bindings.
// Output files are ignored by Git and deleted by the workflow after deployment.
const workerName = 'chick-pick-uat-isolated';
const requireValue = (key) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error('UAT setup incomplete: missing ' + key);
  return value;
};
const optionalValue = (key) => process.env[key]?.trim() || '';
const prod = JSON.parse(readFileSync('wrangler.tidb.jsonc', 'utf8'));
const kvId = requireValue('UAT_KV_NAMESPACE_ID');
if (!/^[a-f0-9]{32}$/i.test(kvId)) throw new Error('UAT KV namespace ID must be 32 hexadecimal characters');
if (prod.kv_namespaces?.some((ns) => ns.id?.toLowerCase() === kvId.toLowerCase())) {
  throw new Error('Refusing to bind the production RECEIPTS KV namespace');
}
if (prod.name === workerName) throw new Error('UAT Worker name collides with the existing Worker');

const dbUrl = requireValue('UAT_TIDB_DATABASE_URL');
let database;
try { database = new URL(dbUrl); } catch { throw new Error('UAT TiDB URL is invalid'); }
if (database.protocol !== 'mysql:' || !database.hostname || !database.username || !database.password) {
  throw new Error('UAT TiDB needs a complete mysql:// user:password@host/schema connection string');
}
const schema = decodeURIComponent(database.pathname.replace(/^\//, ''));
if (!/^[a-zA-Z0-9_-]{3,64}$/.test(schema) || !/(^|[-_])uat([-_]|$)/i.test(schema)) {
  throw new Error('UAT database/schema must have a dedicated name containing the segment uat (example chick_pick_uat)');
}
const channelId = requireValue('UAT_LINE_CHANNEL_ID');
const liffId = requireValue('UAT_LIFF_ID');
if (channelId === prod.vars?.LINE_CHANNEL_ID || liffId === prod.vars?.VITE_LIFF_ID) {
  throw new Error('UAT must use a distinct LINE channel and LIFF app, not the deployed channel');
}
if (!/^[0-9]{8,20}$/.test(channelId) || !liffId.startsWith(channelId + '-')) {
  throw new Error('UAT LINE channel and LIFF app identifiers are inconsistent');
}
const publicAppUrl = requireValue('UAT_PUBLIC_APP_URL');
let publicUrl;
try { publicUrl = new URL(publicAppUrl); } catch { throw new Error('UAT public URL is invalid'); }
if (publicUrl.protocol !== 'https:' || publicUrl.hostname !== publicUrl.hostname.toLowerCase() ||
  !publicUrl.hostname.startsWith(workerName + '.') || !publicUrl.hostname.endsWith('.workers.dev') ||
  publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash ||
  publicUrl.username || publicUrl.password) {
  throw new Error('UAT_PUBLIC_APP_URL must be the new Worker workers.dev HTTPS root, not production');
}
const sessionSecret = requireValue('UAT_ADMIN_SESSION_SECRET');
if (sessionSecret.length < 32) throw new Error('UAT admin session secret must be at least 32 characters');
const pairingToken = requireValue('UAT_ADMIN_PAIRING_TOKEN');
if (pairingToken.length < 12 || pairingToken.length > 128) throw new Error('UAT pairing token must have 12-128 characters');

const slipokKey = optionalValue('UAT_SLIPOK_API_KEY');
const slipokBranchId = optionalValue('UAT_SLIPOK_BRANCH_ID');
if (Boolean(slipokKey) !== Boolean(slipokBranchId)) {
  throw new Error('UAT SlipOK key and UAT SlipOK branch ID must both be set or both be omitted');
}

const config = {
  $schema: './node_modules/wrangler/config-schema.json',
  name: workerName,
  workers_dev: true,
  preview_urls: false,
  main: 'cloudflare/tidbPreview.ts',
  compatibility_date: '2026-10-01',
  vars: {
    LINE_CHANNEL_ID: channelId,
    VITE_LIFF_ID: liffId,
    PUBLIC_APP_URL: publicAppUrl.replace(/\/$/, ''),
    ...(slipokBranchId ? { SLIPOK_BRANCH_ID: slipokBranchId } : {}),
  },
  kv_namespaces: [{ binding: 'RECEIPTS', id: kvId }],
  assets: {
    directory: './dist-client',
    binding: 'ASSETS',
    not_found_handling: 'single-page-application',
    run_worker_first: [
      '/api/*', '/brand/messageImage_1790922360771.jpg', '/.*',
      '/data/*', '/artifacts/*', '/server/*', '/cloudflare/*',
      '/scripts/*', '/src/*', '/node_modules/*', '/package*',
      '/tsconfig*', '/wrangler*'
    ],
  },
};
const secrets = {
  TIDB_DATABASE_URL: dbUrl,
  ADMIN_SESSION_SECRET: sessionSecret,
  ADMIN_PAIRING_TOKEN: pairingToken,
  ...(slipokKey ? { SLIPOK_API_KEY: slipokKey } : {}),
};
writeFileSync('.wrangler-uat.jsonc', JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
writeFileSync('.wrangler-uat.secrets.json', JSON.stringify(secrets) + '\n', { mode: 0o600 });
console.log('Verified isolated UAT configuration. No production Worker, KV, LINE IDs or non-UAT schema used.');
