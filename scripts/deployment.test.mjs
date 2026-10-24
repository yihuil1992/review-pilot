import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { ingressPolicy } from '../apps/web/runtime-ingress.mjs';
const run = (overrides) => spawnSync('sh', ['scripts/production-entrypoint.sh', process.execPath, '-e', 'console.log(JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([k])=>/REVIEW_|NOTIFICATION_SCHEDULER/.test(k)))))'], {env:{...process.env,...overrides},encoding:'utf8'});
test('standby overrides attempts to activate trial effects or schedulers', () => {
 const r=run({REVIEW_PILOT_PRODUCTION_ACTIVE:'false',REVIEW_PILOT_TRIAL_MODE:'false',REVIEW_SYNC_SCHEDULER_ENABLED:'true',NOTIFICATION_SCHEDULER_ENABLED:'true'});
 assert.equal(r.status,0);const e=JSON.parse(r.stdout);assert.equal(e.REVIEW_PILOT_ENV,'live');assert.equal(e.REVIEW_PILOT_TRIAL_MODE,'true');assert.equal(e.REVIEW_SYNC_SCHEDULER_ENABLED,'false');assert.equal(e.REVIEW_SYNC_AUTO_GENERATE_ENABLED,'false');assert.equal(e.NOTIFICATION_SCHEDULER_ENABLED,'false');
});
test('activation is explicit, preserves individual scheduler choices, and rejects typos',()=>{
 const r=run({REVIEW_PILOT_PRODUCTION_ACTIVE:'true',REVIEW_SYNC_SCHEDULER_ENABLED:'false',NOTIFICATION_SCHEDULER_ENABLED:'true'});assert.equal(r.status,0);const e=JSON.parse(r.stdout);assert.equal(e.REVIEW_PILOT_TRIAL_MODE,'false');assert.equal(e.REVIEW_SYNC_SCHEDULER_ENABLED,'false');assert.equal(e.NOTIFICATION_SCHEDULER_ENABLED,'true');assert.equal(run({REVIEW_PILOT_PRODUCTION_ACTIVE:'yes'}).status,1);
});
test('production activation leaves SMS scheduling off by default',()=>{
 const r=run({REVIEW_PILOT_PRODUCTION_ACTIVE:'true',NOTIFICATION_SCHEDULER_ENABLED:''});assert.equal(r.status,0);const e=JSON.parse(r.stdout);assert.equal(e.REVIEW_PILOT_TRIAL_MODE,'false');assert.equal(e.NOTIFICATION_SCHEDULER_ENABLED,'false');
});
test('one image uses different runtime origins and API targets without compiled hostnames',()=>{
 for (const host of ['one.example.com','two.example.com']) {
  const env={PUBLIC_WEB_ORIGIN:`https://${host}`,API_PROXY_URL:'http://backend:4000'};
  const redirected=ingressPolicy('http://localhost/path?q=1',new Headers({'cf-visitor':'{"scheme":"http"}'}),env);
  assert.equal(redirected.redirect,`https://${host}/path?q=1`);
  const proxied=ingressPolicy('http://localhost/api/ready?check=1',new Headers(),env);
  assert.equal(proxied.rewrite,'http://backend:4000/api/ready?check=1');
  assert.equal(proxied.headers['Strict-Transport-Security'],'max-age=86400');
  assert.equal(proxied.headers['X-Robots-Tag'],'noindex, nofollow');
 }
});
test('ingress rejects invalid origins and does not forward unrelated paths',()=>{
 for(const origin of ['http://example.com','https://example.com/path','https://user:pass@example.com']) {
  assert.throws(()=>ingressPolicy('http://localhost/',new Headers(),{PUBLIC_WEB_ORIGIN:origin}),/HTTPS origin/);
 }
 for(const upstream of ['file:///etc/passwd','http://user:pass@api','http://api:4000/path','http://api:4000?x=1']) {
  assert.throws(()=>ingressPolicy('http://localhost/api/test',new Headers(),{API_PROXY_URL:upstream}),/HTTP\(S\) origin/);
 }
 assert.deepEqual(ingressPolicy('http://localhost/apix',new Headers(),{API_PROXY_URL:'http://api:4000'}),{headers:{}});
 assert.deepEqual(ingressPolicy('http://localhost/',new Headers(),{}),{headers:{}});
});
