import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assessReport, scan } from './security-scan.mjs';

const lockfile = resolve('pnpm-lock.yaml');
const report = (vulnerabilities) => ({ results: [{
  source: { type: 'lockfile', path: lockfile },
  packages: [{ package: { name: 'fixture', version: '1.0.0', ecosystem: 'npm' }, vulnerabilities }]
}] });

test('only a complete clean scan with successful exit passes', () => {
  assert.equal(assessReport(report(), 0, lockfile).verdict, 'pass');
  assert.equal(assessReport(report(), 1, lockfile).verdict, 'fail');
});

test('findings block even if a scanner unexpectedly returns success', () => {
  for (const exit of [0, 1]) {
    const result = assessReport(report([{ id: 'GHSA-fixture' }]), exit, lockfile);
    assert.equal(result.verdict, 'fail');
    assert.equal(result.advisoryIds.length, 1);
  }
});

test('tool/network/no-package failures cannot pass', () => {
  for (const exit of [null, 127, 128, 2]) assert.throws(() => assessReport(report(), exit, lockfile));
  for (const bad of [{}, { results: [] }, { results: [{ source: { type: 'lockfile', path: lockfile }, packages: [] }] }]) {
    assert.throws(() => assessReport(bad, 0, lockfile));
  }
  assert.throws(() => assessReport(report(), 0, resolve('different-lockfile.yaml')));
  assert.throws(() => assessReport(report({}), 0, lockfile));
  assert.throws(() => assessReport(report([{}]), 0, lockfile));
});

test('missing executable removes stale success and preserves a failure artifact', () => {
  const output = mkdtempSync(join(tmpdir(), 'review-pilot-osv-test-'));
  writeFileSync(join(output, 'osv.json'), JSON.stringify(report()));
  const original = process.env.OSV_SCANNER;
  try {
    process.env.OSV_SCANNER = join(output, 'does-not-exist');
    assert.equal(scan(lockfile, output), 2);
    assert.equal(JSON.parse(readFileSync(join(output, 'status.json'))).verdict, 'error');
    assert.throws(() => readFileSync(join(output, 'osv.json')));
  } finally {
    if (original === undefined) delete process.env.OSV_SCANNER;
    else process.env.OSV_SCANNER = original;
  }
});
