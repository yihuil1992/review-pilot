import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// These are scanner contract fixtures, never installed or executed. The actual
// application lockfile is scanned separately and cannot inherit their result.
const directory = mkdtempSync(join(tmpdir(), 'review-pilot-osv-smoke-'));
const output = resolve(process.argv[2] || 'security-reports/current/controls');
const runner = fileURLToPath(new URL('./security-scan.mjs', import.meta.url));
const fixture = (name, version) => {
  const path = join(directory, name, 'package-lock.json');
  mkdirSync(join(directory, name));
  writeFileSync(path, JSON.stringify({ name: 'scanner-control', version: '1.0.0', lockfileVersion: 3,
    packages: { '': { name: 'scanner-control', version: '1.0.0' }, 'node_modules/next': {
      version, resolved: `https://registry.npmjs.org/next/-/next-${version}.tgz`
    } }
  }));
  return path;
};
const vulnerable = fixture('vulnerable', '15.5.19');
const patched = fixture('patched', '15.5.28');
const malformed = join(directory, 'malformed', 'pnpm-lock.yaml');
mkdirSync(join(directory, 'malformed'));
writeFileSync(malformed, 'lockfileVersion: [invalid yaml');
const cases = [
  { name: 'vulnerable', path: vulnerable, expected: 1 },
  { name: 'patched', path: patched, expected: 0 },
  { name: 'malformed', path: malformed, expected: 2 },
  { name: 'network-failure', path: patched, expected: 2, env: {
    HTTPS_PROXY: 'http://127.0.0.1:1', HTTP_PROXY: 'http://127.0.0.1:1',
    https_proxy: 'http://127.0.0.1:1', http_proxy: 'http://127.0.0.1:1', NO_PROXY: '', no_proxy: ''
  } }
];
for (const control of cases) {
  const result = spawnSync(process.execPath, [runner, control.path, join(output, control.name)], {
    env: { ...process.env, ...control.env }, encoding: 'utf8', timeout: 210_000
  });
  console.log(`${control.name}: expected ${control.expected}, actual ${result.status}`);
  if (result.error) throw result.error;
  assert.equal(result.status, control.expected, result.stdout + result.stderr);
}
