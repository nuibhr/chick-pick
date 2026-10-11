import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const generator = fileURLToPath(new URL('./prepareUatDeployment.mjs', import.meta.url));
const template = JSON.parse(readFileSync(new URL('../wrangler.tidb.jsonc', import.meta.url), 'utf8'));
const baseEnv = {
  ...process.env,
  UAT_KV_NAMESPACE_ID: '0123456789abcdef0123456789abcdef',
  UAT_TIDB_DATABASE_URL: 'mysql://uat_user:uat_password@example.tidbcloud.com:4000/chick_pick_uat',
  UAT_LINE_CHANNEL_ID: '2012333444',
  UAT_LIFF_ID: '2012333444-TestOnly',
  UAT_PUBLIC_APP_URL: 'https://chick-pick-uat-isolated.example.workers.dev',
  UAT_ADMIN_SESSION_SECRET: 'fixture-secret-abcdefghijklmnopqrstuvwxyz-012345',
  UAT_ADMIN_PAIRING_TOKEN: 'FIXTURE-PAIR-ONLY',
  UAT_SLIPOK_BRANCH_ID: '',
  UAT_SLIPOK_API_KEY: '',
};
test('UAT manifest cannot reuse production resources and never embeds credentials in Worker config', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'chick-pick-uat-'));
  try {
    writeFileSync(path.join(root, 'wrangler.tidb.jsonc'), JSON.stringify(template));
    const run = (overrides = {}) => spawnSync(process.execPath, [generator], {
      cwd: root, env: { ...baseEnv, ...overrides }, encoding: 'utf8',
    });
    const ok = run();
    assert.equal(ok.status, 0, ok.stderr);
    const config = JSON.parse(readFileSync(path.join(root, '.wrangler-uat.jsonc'), 'utf8'));
    const secrets = JSON.parse(readFileSync(path.join(root, '.wrangler-uat.secrets.json'), 'utf8'));
    assert.equal(config.name, 'chick-pick-uat-isolated');
    assert.notEqual(config.name, template.name);
    assert.notEqual(config.kv_namespaces[0].id, template.kv_namespaces[0].id);
    assert.equal(config.vars.VITE_LIFF_ID, baseEnv.UAT_LIFF_ID);
    assert.ok(!('TIDB_DATABASE_URL' in config.vars));
    assert.ok(!('ADMIN_SESSION_SECRET' in config.vars));
    assert.equal(secrets.TIDB_DATABASE_URL, baseEnv.UAT_TIDB_DATABASE_URL);
    assert.equal(secrets.ADMIN_SESSION_SECRET, baseEnv.UAT_ADMIN_SESSION_SECRET);
    assert.notEqual(run({ UAT_KV_NAMESPACE_ID: template.kv_namespaces[0].id }).status, 0);
    assert.notEqual(run({ UAT_TIDB_DATABASE_URL: 'mysql://user:pass@example.tidbcloud.com/prod' }).status, 0);
    assert.notEqual(run({ UAT_LINE_CHANNEL_ID: template.vars.LINE_CHANNEL_ID }).status, 0);
    assert.notEqual(run({ UAT_LIFF_ID: template.vars.VITE_LIFF_ID }).status, 0);
    assert.notEqual(run({ UAT_PUBLIC_APP_URL: template.vars.PUBLIC_APP_URL }).status, 0);
    assert.notEqual(run({ UAT_SLIPOK_BRANCH_ID: '12345' }).status, 0);
    assert.notEqual(run({ UAT_TIDB_DATABASE_URL: '' }).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
