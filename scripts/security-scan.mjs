import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function assessReport(report, scannerExit, lockfile) {
  if (scannerExit !== 0 && scannerExit !== 1) {
    throw new Error(`OSV tool/network/parse failure (exit ${scannerExit})`);
  }
  if (!Array.isArray(report?.results) || report.results.length !== 1) {
    throw new Error('OSV report must contain exactly the requested lockfile');
  }
  const result = report.results[0];
  if (result.source?.type !== 'lockfile' || resolve(result.source.path ?? '') !== resolve(lockfile)) {
    throw new Error('OSV report source does not match the requested lockfile');
  }
  if (!Array.isArray(result.packages) || result.packages.length === 0) {
    throw new Error('OSV report contains no packages');
  }
  const ids = new Set();
  let affectedPackages = 0;
  for (const entry of result.packages) {
    if (entry.package?.ecosystem !== 'npm' || !entry.package.name || !entry.package.version) {
      throw new Error('Malformed npm package in OSV report');
    }
    if (entry.vulnerabilities !== undefined && !Array.isArray(entry.vulnerabilities)) {
      throw new Error('Malformed vulnerabilities in OSV report');
    }
    if (entry.vulnerabilities?.length) affectedPackages++;
    for (const vulnerability of entry.vulnerabilities ?? []) {
      if (typeof vulnerability.id !== 'string' || !vulnerability.id) {
        throw new Error('Malformed vulnerability ID in OSV report');
      }
      ids.add(vulnerability.id);
    }
  }
  // Neither a false success from the tool nor an unexplained exit 1 can pass.
  return {
    packages: result.packages.length,
    affectedPackages,
    advisoryIds: [...ids].sort(),
    verdict: scannerExit === 0 && ids.size === 0 ? 'pass' : 'fail'
  };
}

export function scan(lockfile = 'pnpm-lock.yaml', outputDirectory = 'security-reports/current') {
  const output = resolve(outputDirectory);
  const source = resolve(lockfile);
  mkdirSync(output, { recursive: true });
  const reportPath = resolve(output, 'osv.json');
  // Never allow a prior successful report to substitute for a failed invocation.
  rmSync(reportPath, { force: true });
  const metadata = { timestamp: new Date().toISOString(), lockfile: source, verdict: 'error' };
  try {
    metadata.lockfileSha256 = createHash('sha256').update(readFileSync(source)).digest('hex');
    const command = process.env.OSV_SCANNER || 'osv-scanner';
    const args = ['scan', 'source', '--lockfile', source, '--all-packages', '--all-vulns',
      '--config', fileURLToPath(new URL('./osv-scanner.toml', import.meta.url)),
      '--format', 'json', '--output-file', reportPath];
    const result = spawnSync(command, args, {
      encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024
    });
    writeFileSync(resolve(output, 'osv.stdout.log'), result.stdout ?? '');
    writeFileSync(resolve(output, 'osv.stderr.log'), result.stderr ?? '');
    metadata.scannerExit = result.status;
    metadata.signal = result.signal;
    if (result.error) throw result.error;
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`OSV tool/network/parse failure (exit ${result.status})`);
    }
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    Object.assign(metadata, assessReport(report, result.status, source));
    console.log(`OSV: ${metadata.packages} packages, ${metadata.advisoryIds.length} unique advisory IDs, ${metadata.affectedPackages} affected package versions; ${metadata.verdict}`);
  } catch (error) {
    metadata.error = error.message;
    console.error(`OSV scan failed: ${error.message}`);
  } finally {
    writeFileSync(resolve(output, 'status.json'), JSON.stringify(metadata, null, 2) + '\n');
  }
  return metadata.verdict === 'pass' ? 0 : metadata.verdict === 'fail' ? 1 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = scan(process.argv[2], process.argv[3]);
}
