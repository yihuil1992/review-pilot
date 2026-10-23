import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Only a disposable loopback database with the exact test identity is accepted.
// Deliberately do not read .env or accept the application's DATABASE_URL.
const connectionString = process.env.DB_TEST_DATABASE_URL;
assert.ok(connectionString, 'Set DB_TEST_DATABASE_URL to the disposable test database');
const url = new URL(connectionString);
assert.ok(['postgresql:', 'postgres:'].includes(url.protocol));
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
assert.equal(url.username, 'security_test');
assert.equal(url.pathname, '/review_pilot_security_test');
assert.equal(url.search, '', 'Test URL must not redirect connections through query options');
process.env.DATABASE_URL = connectionString;

const prismaCommand = (...args) => {
  assert.ok(process.env.npm_execpath, 'Run through pnpm test:database');
  const result = spawnSync(process.execPath, [process.env.npm_execpath, '--filter', '@review-pilot/db', 'prisma', ...args], {
    stdio: 'inherit', env: process.env
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Prisma ${args[0]} failed`);
};
prismaCommand('migrate', 'deploy');
prismaCommand('migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code');

const { PrismaClient, Prisma } = await import('../packages/db/dist/index.js');
const client = new PrismaClient();
const prefix = `security-smoke-${randomUUID()}`;
try {
  await client.$connect();
  const created = await client.appSetting.create({ data: { key: prefix, value: { source: 'synthetic', count: 7 } } });
  assert.deepEqual(created.value, { source: 'synthetic', count: 7 });
  assert.ok(created.createdAt instanceof Date);
  await assert.rejects(client.appSetting.create({ data: { key: prefix, value: {} } }),
    error => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002');
  await assert.rejects(client.$transaction(async transaction => {
    await transaction.appSetting.create({ data: { key: `${prefix}-rollback`, value: {} } });
    throw new Error('intentional rollback');
  }), /intentional rollback/);
  assert.equal(await client.appSetting.findUnique({ where: { key: `${prefix}-rollback` } }), null);
  await client.$transaction([
    client.appSetting.update({ where: { key: prefix }, data: { value: { committed: true } } }),
    client.appSetting.create({ data: { key: `${prefix}-batch`, value: {} } })
  ]);
  assert.deepEqual((await client.appSetting.findUniqueOrThrow({ where: { key: prefix } })).value, { committed: true });
  assert.equal((await client.$queryRaw`SELECT 1::int AS value`)[0].value, 1);
  console.log('Database smoke passed: migrations/schema parity, JSON/date CRUD, P2002, interactive rollback, batch commit, raw query.');
} finally {
  await client.appSetting.deleteMany({ where: { key: { startsWith: prefix } } });
  await client.$disconnect();
}

delete process.env.DATABASE_URL;
const unconfigured = new PrismaClient();
try {
  await assert.rejects(unconfigured.$connect(), /DATABASE_URL is required/);
  console.log('Missing DATABASE_URL rejected before network access.');
} finally {
  await unconfigured.$disconnect();
}
