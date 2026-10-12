import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Read-only historical evidence. No hosted service, customer data, payment,
// credentials, archive upload, branch update or production deployment is used.
const base = 'e67a006077c619a8724681d19f939237cb14d1a0';
const main = '08d60990bb9a39d2fe05db5535dad2dac0886dbf';
const common = '3a845a4ed24f4e52d960f16906d9e209946b6923';
const root = process.cwd();
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  return result;
}
function git(args) {
  const result = run('git', args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
const workflowLines = value => value.split('\n').map(line => line.trimEnd()).filter(line => line.trim()).join('\n');

// The historical workflow copies differ only in blank lines. Preserve leading
// indentation and every substantive line; do not silently accept other changes.
const mainPaths = git(['diff', '--name-only', common, main]).trim().split('\n').filter(Boolean);
for (const file of mainPaths) {
  const left = git(['show', main + ':' + file]).trim();
  const carried = git(['show', base + ':' + file]).trim();
  if (left === carried) continue;
  if (file.endsWith('.yml') && workflowLines(left) === workflowLines(carried)) continue;
  assert.equal(file, 'README.md', 'Unreviewed main difference: ' + file);
  const added = git(['diff', '--unified=0', common, main, '--', file]).split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).filter(line => line.trim());
  for (const line of added) assert.ok(carried.includes(line), 'Missing main README contribution: ' + line);
}
console.log('MAIN_CONTRIBUTIONS_PRESERVED: ' + mainPaths.length + ' paths at pinned historical commits.');

const temporary = mkdtempSync(path.join(os.tmpdir(), 'chick-pick-preflight-'));
const checkout = path.join(temporary, 'baseline');
let registered = false;
try {
  git(['worktree', 'add', '--detach', checkout, base]); registered = true;
  symlinkSync(path.join(root, 'node_modules'), path.join(checkout, 'node_modules'), 'dir');
  const files = ['cloudflare/adminSessionRevocation.test.ts', 'cloudflare/receiptFailureSafety.test.ts'];
  for (const file of files) copyFileSync(path.join(root, file), path.join(checkout, file));
  const checks = [
    { file: files[0], name: 'GET and cross-site logout cannot revoke a valid session', fixed: false },
    { file: files[1], name: 'bank result 1010 does not discard evidence or infer missing funds', fixed: false },
    { file: files[0], name: 'logout through the public pilot route revokes a copied cookie immediately', fixed: true },
    { file: files[1], name: 'invalid image code 1007 releases only at the original deadline and preserves evidence', fixed: true },
    { file: files[1], name: 'automatic invalid-image rejection cannot later renew an expired coaching slot through staff rejection', fixed: true },
    { file: files[1], name: 'normal verification detects changed stored bytes before contacting SlipOK', fixed: true },
  ];
  for (const check of checks) {
    const exact = '^' + check.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
    const args = ['--import', 'tsx', '--test', '--test-reporter=tap', '--test-name-pattern=' + exact, check.file];
    const original = run(process.execPath, args, checkout);
    const patched = run(process.execPath, args, root);
    assert.equal(patched.status, 0, patched.stdout + patched.stderr);
    assert.match(patched.stdout, /# pass 1\b/);
    if (check.fixed) {
      assert.notEqual(original.status, 0, 'Baseline unexpectedly passed: ' + check.name);
      assert.match(original.stdout, /code: 'ERR_ASSERTION'/, original.stdout + original.stderr);
      assert.match(original.stdout, /# fail 1\b/);
      assert.ok(original.stdout.includes(check.name));
      assert.doesNotMatch(original.stdout + original.stderr, /ERR_MODULE_NOT_FOUND|SyntaxError|TransformError/);
      console.log('BASELINE_ASSERTION_FAIL_PATCH_PASS: ' + check.name);
    } else {
      assert.equal(original.status, 0, original.stdout + original.stderr);
      assert.match(original.stdout, /# pass 1\b/);
      console.log('BENIGN_CONTROL_PASS_BOTH: ' + check.name);
    }
  }
  console.log('REGRESSION_PROOF_PASS: four original safety failures corrected; two benign controls preserved. This is targeted evidence, not a full security certification.');
} finally {
  if (registered) {
    const result = run('git', ['worktree', 'remove', '--force', checkout]);
    if (result.status !== 0) throw new Error('Could not remove temporary validation worktree: ' + result.stderr);
  }
  rmSync(temporary, { recursive: true, force: true });
}
