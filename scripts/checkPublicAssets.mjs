import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const tracked = new Set(execFileSync('git', ['ls-files', '-z', '--', 'public/'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean));
async function inspect(relative) {
  const unexpected = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) unexpected.push(name);
    else if (entry.isDirectory()) unexpected.push(...await inspect(name));
    else if (!tracked.has(name)) unexpected.push(name);
  }
  return unexpected;
}
const unexpected = await inspect('public');
if (unexpected.length) {
  console.error('Build stopped: public/ contains files outside the reviewed Git asset list. Move private files outside public/; stage only intended app assets.');
  console.error(unexpected.join('\n'));
  process.exitCode = 1;
} else console.log(`Public asset check passed (${tracked.size} reviewed files).`);
