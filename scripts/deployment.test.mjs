import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import nextConfig from '../apps/web/next.config.mjs';
const run = (overrides) => spawnSync('sh', ['scripts/production-entrypoint.sh', process.execPath, '-e', 'console.log(JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([k])=>/REVIEW_|NOTIFICATION_SCHEDULER/.test(k)))))'], {env:{...process.env,...overrides},encoding:'utf8'});
test('standby overrides attempts to activate trial effects or schedulers', () => {
 const r=run({REVIEW_PILOT_PRODUCTION_ACTIVE:'false',REVIEW_PILOT_TRIAL_MODE:'false',REVIEW_SYNC_SCHEDULER_ENABLED:'true',NOTIFICATION_SCHEDULER_ENABLED:'true'});
 assert.equal(r.status,0);const e=JSON.parse(r.stdout);assert.equal(e.REVIEW_PILOT_ENV,'live');assert.equal(e.REVIEW_PILOT_TRIAL_MODE,'true');assert.equal(e.REVIEW_SYNC_SCHEDULER_ENABLED,'false');assert.equal(e.REVIEW_SYNC_AUTO_GENERATE_ENABLED,'false');assert.equal(e.NOTIFICATION_SCHEDULER_ENABLED,'false');
});
test('activation is explicit, preserves individual scheduler choices, and rejects typos',()=>{
 const r=run({REVIEW_PILOT_PRODUCTION_ACTIVE:'true',REVIEW_SYNC_SCHEDULER_ENABLED:'false',NOTIFICATION_SCHEDULER_ENABLED:'true'});assert.equal(r.status,0);const e=JSON.parse(r.stdout);assert.equal(e.REVIEW_PILOT_TRIAL_MODE,'false');assert.equal(e.REVIEW_SYNC_SCHEDULER_ENABLED,'false');assert.equal(e.NOTIFICATION_SCHEDULER_ENABLED,'true');assert.equal(run({REVIEW_PILOT_PRODUCTION_ACTIVE:'yes'}).status,1);
});
test('production web retains HTTPS redirect and private-app headers without trial mode',async()=>{
 const original={...process.env};try{process.env.REVIEW_PILOT_TRIAL_MODE='false';process.env.PUBLIC_WEB_ORIGIN='https://reviews.shakingcrab.net';const c=nextConfig('phase-production-build');assert.equal((await c.redirects())[0].destination,'https://reviews.shakingcrab.net/:path*');assert.ok((await c.headers())[0].headers.some(x=>x.key==='Strict-Transport-Security'));process.env.PUBLIC_WEB_ORIGIN='http://invalid.test';assert.throws(()=>nextConfig('phase-production-build'),/HTTPS origin/);}finally{process.env=original;}
});
