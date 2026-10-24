import assert from 'node:assert/strict';
import test from 'node:test';
import { intentFor, marker, requestDeployment, requestedBody } from './request-deployment.mjs';

const env = { GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push', GITHUB_REPOSITORY: 'example/project',
  GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '1234', GITHUB_RUN_ATTEMPT: '1', GITHUB_TOKEN: 'github-secret',
  DEPLOY_WEBHOOK_URL: 'https://deployment.example/private?uuid=private-id', DEPLOY_WEBHOOK_TOKEN: 'deploy-secret' };
const pr = { number: 2, merged_at: '2026-10-24T00:00:00Z', merge_commit_sha: env.GITHUB_SHA, base: { ref: 'main' } };
const log = { log() {}, warn() {} };
function transport({ comments = [], head = env.GITHUB_SHA, rejectComment = false, deployStatus = 200, deployError = false, prs = [pr] } = {}) {
  const calls = [];
  return { calls, fetch: async (url, options) => {
    url = String(url); calls.push({ url, ...options });
    let value;
    let status = 200;
    if (url.includes('/git/ref/')) value = { object: { sha: head } };
    else if (url.includes('/commits/')) value = prs;
    else if (url.includes('/comments') && options.method === 'GET') value = comments;
    else if (url.includes('/comments')) { value = { id: 51 }; status = rejectComment ? 403 : 201; }
    else { if (deployError) throw new Error('private response must not escape'); status = deployStatus; }
    return { ok: status >= 200 && status < 300, status, json: async () => value };
  }};
}
test('intent contains only public source identity', () => {
  const body = requestedBody(intentFor(env));
  for (const secret of ['github-secret', 'deploy-secret', 'private-id', 'deployment.example']) assert.ok(!body.includes(secret));
  assert.match(body, /not proof/);
});
test('PR/untrusted identities cannot request a production release', () => {
  for (const override of [{ GITHUB_REF: 'refs/pull/1/merge' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_SHA: 'bad' }, { GITHUB_RUN_ID: '1\nsecret' }]) {
    assert.throws(() => intentFor({ ...env, ...override }));
  }
});
test('registers a pending comment before requesting deployment, without waiting', async () => {
  const t = transport();
  assert.deepEqual(await requestDeployment(env, t.fetch, log), { registered: true, accepted: true });
  assert.equal(t.calls.length, 5);
  assert.equal(t.calls[3].method, 'POST');
  assert.match(t.calls[3].body, /runtime verification pending/);
  assert.equal(t.calls[4].url, env.DEPLOY_WEBHOOK_URL);
  assert.equal(t.calls[4].redirect, 'error');
});
test('updates the existing bot comment instead of creating another', async () => {
  const t = transport({ comments: [{ id: 50, user: { type: 'Bot' }, body: marker }] });
  await requestDeployment(env, t.fetch, log);
  assert.equal(t.calls[3].method, 'PATCH');
  assert.match(t.calls[3].url, /\/issues\/comments\/50$/);
});
test('does not edit a human-authored comment that copies a marker', async () => {
  const t = transport({ comments: [{ id: 50, user: { type: 'User' }, body: marker }] });
  await requestDeployment(env, t.fetch, log);
  assert.equal(t.calls[3].method, 'POST');
});
test('comment failure does not prevent the deployment', async () => {
  const t = transport({ rejectComment: true });
  assert.deepEqual(await requestDeployment(env, t.fetch, log), { registered: false, accepted: true });
});
test('superseded revision neither comments nor deploys', async () => {
  const t = transport({ head: 'b'.repeat(40) });
  assert.deepEqual(await requestDeployment(env, t.fetch, log), { skipped: true });
  assert.equal(t.calls.length, 1);
});
test('no associated PR does not fabricate a report', async () => {
  const t = transport({ prs: [] });
  assert.deepEqual(await requestDeployment(env, t.fetch, log), { registered: false, accepted: true });
  assert.equal(t.calls.length, 3);
});
test('rejected request never reports success or exposes response data', async () => {
  const t = transport({ deployStatus: 403 });
  await assert.rejects(() => requestDeployment(env, t.fetch, log), /HTTP 403/);
  assert.ok(!t.calls.some(x => (x.body ?? '').includes('Deployment verified')));
  const update = t.calls.at(-1);
  assert.equal(update.method, 'PATCH');
  assert.match(update.url, /\/issues\/comments\/51$/);
  assert.match(update.body, /coolify-deploy-request-error:403/);
  assert.match(update.body, /Deployment request rejected/);
  for (const secret of ['github-secret', 'deploy-secret', 'private-id', 'deployment.example']) assert.ok(!update.body.includes(secret));
  const intent = body => JSON.parse(JSON.parse(body).body.match(/coolify-deploy-intent:(\{[^\n]*\}) -->/)[1]);
  assert.deepEqual(intent(update.body), intent(t.calls[3].body));
});

test('network failure remains unconfirmed and retains the source intent', async () => {
  const t = transport({ deployError: true });
  await assert.rejects(() => requestDeployment(env, t.fetch, log), /runtime outcome is unconfirmed/);
  assert.match(t.calls.at(-1).body, /coolify-deploy-request-error:0/);
  assert.match(t.calls.at(-1).body, /outcome unconfirmed/);
  assert.ok(!t.calls.at(-1).body.includes('private response'));
});
