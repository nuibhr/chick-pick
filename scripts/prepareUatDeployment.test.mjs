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
  UAT_ADMIN_PAIRING_TOKEN: 'test12codeab',
  UAT_SLIPOK_BRANCH_ID: '',
  UAT_SLIPOK_API_KEY: '',
};
function fixture(runTest) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'chick-pick-uat-'));
  try {
    writeFileSync(path.join(root, 'wrangler.tidb.jsonc'), JSON.stringify(template));
    const run = (overrides = {}) => spawnSync(process.execPath, [generator], {
      cwd: root, env: { ...baseEnv, ...overrides }, encoding: 'utf8',
    });
    runTest(root, run);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('UAT manifest guards keep production identifiers and credentials out of configuration', () => fixture((root, run) => {
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
  assert.equal(secrets.ADMIN_PAIRING_TOKEN, 'TEST12CODEAB');
  assert.notEqual(run({ UAT_KV_NAMESPACE_ID: template.kv_namespaces[0].id }).status, 0);
  assert.notEqual(run({ UAT_TIDB_DATABASE_URL: 'mysql://user:pass@example.tidbcloud.com/prod' }).status, 0);
  assert.notEqual(run({ UAT_LINE_CHANNEL_ID: template.vars.LINE_CHANNEL_ID }).status, 0);
  assert.notEqual(run({ UAT_LIFF_ID: template.vars.VITE_LIFF_ID }).status, 0);
  assert.notEqual(run({ UAT_PUBLIC_APP_URL: template.vars.PUBLIC_APP_URL }).status, 0);
  assert.notEqual(run({ UAT_SLIPOK_BRANCH_ID: '12345' }).status, 0);
  assert.notEqual(run({ UAT_TIDB_DATABASE_URL: '' }).status, 0);
}));

test('UAT accepts only pairing codes usable by the real owner authentication API', () => fixture((root, run) => {
  for (const code of ['SHORT', 'FIXTURE-PAIR-ONLY', 'A'.repeat(13), 'A'.repeat(128), 'TEST12CODEA!']) {
    assert.notEqual(run({ UAT_ADMIN_PAIRING_TOKEN: code }).status, 0, code);
  }
  assert.equal(run({ UAT_ADMIN_PAIRING_TOKEN: ' test12codeab ' }).status, 0);
  const saved = JSON.parse(readFileSync(path.join(root, '.wrangler-uat.secrets.json'), 'utf8'));
  assert.match(saved.ADMIN_PAIRING_TOKEN, /^[A-Z0-9]{12}$/);
  assert.equal(saved.ADMIN_PAIRING_TOKEN, 'TEST12CODEAB');
}));

test('UAT rejects database query overrides, unexpected hosts, ports and invalid SlipOK pairs', () => fixture((_root, run) => {
  for (const suffix of ['?database=production', '#production', '?ssl=false']) {
    assert.notEqual(run({ UAT_TIDB_DATABASE_URL: baseEnv.UAT_TIDB_DATABASE_URL + suffix }).status, 0);
  }
  for (const url of ['https://chick-pick-uat-isolated.extra.example.workers.dev', 'https://chick-pick-uat-isolated.example.workers.dev:8443']) {
    assert.notEqual(run({ UAT_PUBLIC_APP_URL: url }).status, 0);
  }
  assert.notEqual(run({ UAT_LIFF_ID: baseEnv.UAT_LINE_CHANNEL_ID + '-bad/suffix' }).status, 0);
  assert.notEqual(run({ UAT_SLIPOK_API_KEY: 'test key', UAT_SLIPOK_BRANCH_ID: '123' }).status, 0);
  assert.notEqual(run({ UAT_SLIPOK_API_KEY: 'test-key', UAT_SLIPOK_BRANCH_ID: 'abc' }).status, 0);
  assert.equal(run({ UAT_SLIPOK_API_KEY: 'test-key', UAT_SLIPOK_BRANCH_ID: '123' }).status, 0);
}));
