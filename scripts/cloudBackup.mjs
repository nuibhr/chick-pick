import 'dotenv/config';
import { parse as parseEnv } from 'dotenv';
import { connect } from '@tidbcloud/serverless';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { schemas, hash, tableHash, sealBackup, openBackup, receiptReferences, validateBackup, databaseIdentity, assertRestoreTarget, summary, decodeBase64, BackupError, MAX_BACKUP_BYTES, insertBatches } from './backupCore.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(path.join(root, 'wrangler.tidb.jsonc'), 'utf8'));
const liveKv = config.kv_namespaces.find(n => n.binding === 'RECEIPTS')?.id;
const [command, ...args] = process.argv.slice(2);
let values;
try { ({ values } = parseArgs({ args, options: { file: { type: 'string' }, apply: { type: 'boolean', default: false } }, strict: true })); }
catch { console.error('Unsupported backup command option. Put credentials only in environment variables, never command arguments.'); process.exit(1); }
let stage = 'configuration';
const need = name => { const value = process.env[name]?.trim(); if (!value) throw new BackupError('Missing ' + name); return value; };
const dbClient = url => connect({ url, fullResult: true });
const fail = message => { throw new BackupError(message); };
async function privateDirectory(relative) {
  const base = await realpath(root); let target = base;
  for (const part of relative.split('/')) {
    target = path.join(target, part); await mkdir(target, { recursive: true, mode: 0o700 });
    if ((await lstat(target)).isSymbolicLink() || !(await realpath(target)).startsWith(base + path.sep)) fail('Private backup directory must remain inside this workspace and cannot be a symbolic link');
  }
  return target;
}
async function cfClient(accountHint) {
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    const cli = process.env.WRANGLER_CLI_PATH;
    const runner = cli ? [cli] : [need('npm_execpath'), 'exec', '--yes', '--package=wrangler@4.148.0', '--', 'wrangler'];
    try {
      const raw = execFileSync(process.execPath, [...runner, 'auth', 'token', '--json', '--config', path.join(root, 'wrangler.tidb.jsonc')], { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
      const credentials = JSON.parse(raw); token = credentials.token;
    } catch { fail('Cloudflare login unavailable; run wrangler login, then retry through npm run backup:create'); }
  }
  if (!token) fail('Cloudflare token unavailable');
  async function request(route, init = {}, binary = false) {
    for (let attempt = 0; attempt < 4; attempt++) {
      let response;
      try { response = await fetch('https://api.cloudflare.com/client/v4' + route, { ...init, headers: { Authorization: 'Bearer ' + token, ...init.headers }, signal: AbortSignal.timeout(45000) }); }
      catch { if (attempt === 3) fail('Cloudflare network request failed'); await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 3) { await response.body?.cancel(); await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
      if (!response.ok) fail('Cloudflare request failed (HTTP ' + response.status + ')');
      if (binary) return Buffer.from(await response.arrayBuffer());
      const value = await response.json(); if (value.success !== true) fail('Cloudflare did not confirm the operation'); return value;
    }
  }
  const accounts = process.env.CLOUDFLARE_ACCOUNT_ID ? [{ id: process.env.CLOUDFLARE_ACCOUNT_ID }] : (await request('/accounts')).result;
  const matches = [];
  for (const account of accounts) {
    if (accountHint) { if (account.id === accountHint) matches.push(account.id); continue; }
    try { const ns = await request(`/accounts/${account.id}/storage/kv/namespaces/${liveKv}`); if (ns.result.id === liveKv) matches.push(account.id); }
    catch (e) { if (!(e instanceof BackupError) || !/HTTP (403|404)/.test(e.message)) throw e; }
  }
  if (matches.length !== 1) fail('Cannot uniquely identify the Cloudflare account containing live receipts');
  const accountId = matches[0], base = `/accounts/${accountId}/storage/kv/namespaces`;
  const route = (id, suffix = '') => `${base}/${id}${suffix}`;
  return {
    accountId,
    async info(id) { return (await request(route(id))).result; },
    async list(id) {
      const keys = []; let cursor = '';
      do { const r = await request(route(id, '/keys?limit=1000' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''))); keys.push(...r.result); const next = r.result_info?.cursor || ''; if (next && next === cursor) fail('KV listing cursor did not advance'); cursor = next; } while (cursor);
      return keys;
    },
    async read(id, key) { return request(route(id, '/values/' + encodeURIComponent(key)), {}, true); },
    async write(id, record) {
      const form = new FormData(); form.set('value', new Blob([decodeBase64(record.data)]));
      if (record.metadata !== undefined) form.set('metadata', JSON.stringify(record.metadata));
      await request(route(id, '/values/' + encodeURIComponent(record.key)), { method: 'PUT', body: form });
    },
    async create(title) {
      if (!/^chick-pick-restore-drill-[a-z0-9-]+$/.test(title)) fail('Invalid restore namespace title');
      return (await request(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })).result;
    },
  };
}
async function tableNames(db) { return (await db.execute('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME')).rows.map(r => r.name); }
async function readTables(db) {
  const actual = await tableNames(db);
  if (actual.sort().join() !== Object.keys(schemas).sort().join()) fail('Database tables differ from the supported schema; refusing an incomplete backup');
  for (const [name, schema] of Object.entries(schemas)) {
    const columns = (await db.execute(`SHOW COLUMNS FROM ${name}`)).rows.map(r => r.Field);
    if (columns.sort().join() !== [...(schema.dbColumns || schema.columns)].sort().join()) fail('Database columns have changed; update the backup schema before continuing');
  }
  const tables = {};
  for (const [name, schema] of Object.entries(schemas)) tables[name] = (await db.execute(schema.select)).rows;
  return tables;
}
async function snapshot() {
  stage = 'read-only TiDB snapshot'; const sourceUrl = need('TIDB_DATABASE_URL'), db = dbClient(sourceUrl), tx = await db.begin();
  let tables, snapshot;
  try { await tx.execute("SET time_zone = '+00:00'"); snapshot = String((await tx.execute('SELECT @@tidb_current_ts AS snapshot')).rows[0].snapshot); tables = await readTables(tx); }
  finally { await tx.rollback(); }
  stage = 'read-only Cloudflare receipts'; const cf = await cfClient(), listed = await cf.list(liveKv), refs = receiptReferences(tables.app_documents);
  if (listed.some(k => !/^receipt:[a-zA-Z0-9-]{1,100}$/.test(k.name) || k.expiration !== undefined)) fail('KV contains unsupported or expiring keys; cannot claim a complete backup');
  const keys = new Map(listed.map(k => [k.name, k])); for (const name of refs.keys()) if (!keys.has(name)) keys.set(name, { name });
  const kv = []; let total = Buffer.byteLength(JSON.stringify(tables));
  for (const [name, entry] of keys) {
    const bytes = await cf.read(liveKv, name);
    total += Math.ceil(bytes.length / 3) * 4 + 1000;
    if (total > MAX_BACKUP_BYTES) fail('Backup exceeds the pilot bundle limit; use a streaming database backup');
    if (refs.get(name)?.sha256 && refs.get(name).sha256 !== hash(bytes)) fail('Live receipt bytes do not match their database digest');
    kv.push({ key: name, data: bytes.toString('base64'), sha256: hash(bytes), ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}) });
  }
  return validateBackup({ format: 'chick-pick-snapshot', version: 1, createdAt: new Date().toISOString(), snapshot, source: { database: databaseIdentity(sourceUrl), cloudflare: { accountId: cf.accountId, namespaceId: liveKv }, workerName: config.name }, tables, digests: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, tableHash(name, rows)])), kv });
}
async function load() {
  if (!values.file) fail('Pass --file with the encrypted .cpbackup path');
  stage = 'offline backup authentication'; return openBackup(await readFile(path.resolve(values.file), 'utf8'), need('BACKUP_ENCRYPTION_KEY'));
}
async function restore(backup, dbUrl, targetKv, cf, apply) {
  stage = 'restore isolation preflight'; const identity = assertRestoreTarget(backup, dbUrl, targetKv, need('TIDB_DATABASE_URL'), liveKv), info = await cf.info(targetKv);
  if (!/^chick-pick-restore-drill-[a-z0-9-]+$/.test(info.title || '')) fail('Target KV namespace is not explicitly designated for a restore drill');
  const db = dbClient(dbUrl);
  if ((await tableNames(db)).length || (await cf.list(targetKv)).length) fail('Restore requires a completely empty database and KV namespace; existing data is never overwritten');
  if (!apply) return { dryRun: true, isolationVerified: true, ...summary(backup) };
  stage = 'restore isolated KV';
  // On failure, leave the private drill resources for inspection; never delete source or target.
  for (const record of backup.kv) await cf.write(targetKv, record);
  stage = 'restore isolated database schema'; for (const schema of Object.values(schemas)) await db.execute(schema.create);
  stage = 'restore isolated database records'; const tx = await db.begin();
  try {
    await tx.execute("SET time_zone = '+00:00'");
    // Batch audit history to keep the transaction short. No session resurrection or upserts.
    for (const name of Object.keys(schemas)) for (const batch of insertBatches(name, backup.tables[name])) await tx.execute(batch.sql, batch.parameters);
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
  stage = 'verify restored database and every image'; const check = await db.begin(); let tables;
  try { await check.execute("SET time_zone = '+00:00'"); tables = await readTables(check); } finally { await check.rollback(); }
  for (const [name, rows] of Object.entries(tables)) if (name !== 'admin_sessions' && tableHash(name, rows) !== backup.digests[name]) fail('Restored database verification failed');
  if (tables.admin_sessions.length) fail('Restored sessions must be empty');
  for (const record of backup.kv) if (hash(await cf.read(targetKv, record.key)) !== record.sha256) fail('Restored image verification failed');
  return { restoredAndVerified: true, tablesVerified: Object.keys(schemas).length, discardedLegacySessions: backup.tables.admin_sessions.length, ...summary(backup), targetSchema: identity.schema, targetKv };
}
try {
  if (command === 'init') {
    const envFile = path.join(root, '.env'); let content = ''; try { content = await readFile(envFile, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const existing = process.env.BACKUP_ENCRYPTION_KEY || parseEnv(content).BACKUP_ENCRYPTION_KEY;
    if (existing) { if (!/^[a-f0-9]{64}$/i.test(existing)) fail('Existing backup key is invalid; it was not changed'); console.log('Existing encryption key preserved.'); }
    else {
      const setting = 'BACKUP_ENCRYPTION_KEY=' + randomBytes(32).toString('hex');
      content = /^BACKUP_ENCRYPTION_KEY\s*=.*$/m.test(content) ? content.replace(/^BACKUP_ENCRYPTION_KEY\s*=.*$/m, setting) : content + (content.endsWith('\n') ? '' : '\n') + '\n# Private backup encryption key: keep a separate secure copy\n' + setting + '\n';
      await writeFile(envFile, content, { mode: 0o600 }); console.log('Backup encryption key saved in ignored .env. Existing settings preserved; key value is never displayed.');
    }
  } else if (command === 'create') {
    need('BACKUP_ENCRYPTION_KEY'); const backup = await snapshot(); stage = 'encrypted backup file'; const directory = await privateDirectory('artifacts/backups');
    const name = 'chick-pick-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomBytes(3).toString('hex') + '.cpbackup';
    const file = path.join(directory, name); await writeFile(file, sealBackup(backup, need('BACKUP_ENCRYPTION_KEY')), { flag: 'wx', mode: 0o600 });
    openBackup(await readFile(file, 'utf8'), need('BACKUP_ENCRYPTION_KEY')); console.log(JSON.stringify({ backupCreatedAndAuthenticated: true, file, ...summary(backup) }));
  } else if (command === 'verify') {
    console.log(JSON.stringify({ backupAuthenticated: true, ...summary(await load()) }));
  } else if (command === 'restore' || command === 'drill') {
    const backup = await load(), cf = await cfClient(backup.source.cloudflare.accountId); let dbUrl, namespace;
    if (command === 'drill') {
      stage = 'create new private restore-drill resources'; const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '_' + randomBytes(3).toString('hex');
      const schema = 'chick_pick_restore_drill_' + suffix;
      const target = new URL(need('TIDB_DATABASE_URL')); target.pathname = '/' + schema;
      // Validate the computed name before any DDL. Never use IF NOT EXISTS or a reusable name.
      if (!/^chick_pick_restore_drill_[a-z0-9_]{1,36}$/.test(schema) || databaseIdentity(need('TIDB_DATABASE_URL')).schema.toLowerCase() === schema.toLowerCase()) fail('Invalid drill schema name');
      await dbClient(need('TIDB_DATABASE_URL')).execute('CREATE DATABASE `' + schema + '`');
      namespace = await cf.create('chick-pick-restore-drill-' + suffix.replaceAll('_', '-')); dbUrl = target.toString();
    } else { dbUrl = need('RESTORE_TIDB_DATABASE_URL'); namespace = { id: need('RESTORE_KV_NAMESPACE_ID') }; }
    const result = await restore(backup, dbUrl, namespace.id, cf, command === 'drill' || values.apply);
    if (command === 'drill') { const directory = await privateDirectory('artifacts/backups'); await writeFile(path.join(directory, 'restore-drill-' + Date.now() + '.json'), JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 }); }
    console.log(JSON.stringify(result));
  } else fail('Use backup:init, backup:create, backup:verify, backup:restore or backup:drill');
} catch (error) {
  console.error('Backup operation stopped during ' + stage + ': ' + (error instanceof BackupError ? error.message : 'Service or filesystem request failed; private details suppressed'));
  process.exitCode = 1;
}
