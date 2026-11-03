import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
const rules = [
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['Stripe secret', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/],
  ['Hugging Face token', /\bhf_[A-Za-z0-9]{30,}\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
];
const textFile = p => /\.(?:[cm]?jsx?|tsx?|json|ya?ml|md|txt|toml|ini|conf|sql|py)$|(?:^|\/)\.env(?:\.|$)/i.test(p);
const forbidden = p => /(?:^|\/)(?:\.env(?:\..*)?|data|artifacts|private-config)(?:\/|$)/i.test(p) && !/(?:^|\/)\.env\.example$/.test(p);
let findings = 0, inspected = 0;
function inspect(name, content) {
  inspected++;
  for (const [label, pattern] of rules) if (pattern.test(content)) { console.error(`${name}: possible ${label}; value suppressed`); findings++; }
}
for (const name of git(['ls-files', '-z']).split('\0').filter(Boolean)) {
  if (forbidden(name)) { console.error(`${name}: private data must not be tracked`); findings++; }
  if (textFile(name)) inspect(name, readFileSync(name, 'utf8'));
}
if (process.argv.includes('--history')) {
  const objects = git(['rev-list', '--objects', '--all']).split('\n').flatMap(line => {
    const split = line.indexOf(' '); if (split < 0) return [];
    const oid = line.slice(0, split), name = line.slice(split + 1);
    return textFile(name) ? [{ oid, name }] : [];
  });
  const data = execFileSync('git', ['cat-file', '--batch'], { input: objects.map(o => o.oid).join('\n') + '\n', maxBuffer: 128 * 1024 * 1024 });
  let offset = 0;
  for (const object of objects) {
    const newline = data.indexOf(10, offset), header = data.subarray(offset, newline).toString('utf8').split(' '), size = Number(header[2]);
    if (header[1] !== 'blob' || !Number.isSafeInteger(size)) throw Error('Cannot inspect history object');
    const content = data.subarray(newline + 1, newline + 1 + size);
    if (size <= 2 * 1024 * 1024) inspect(`history:${object.name}@${object.oid.slice(0, 8)}`, content.toString('utf8'));
    if (forbidden(object.name)) { console.error(`history:${object.name}: tracked private data; inspect privately`); findings++; }
    offset = newline + 1 + size + 1;
  }
}
console.log(`Credential pattern check: ${inspected} text versions inspected, ${findings} findings. Values are never printed. This is a basic check, not a replacement for a full secret-scanning service.`);
process.exitCode = findings ? 1 : 0;
