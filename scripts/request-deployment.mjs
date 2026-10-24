import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const marker = '<!-- coolify-production-report:v1 -->';

export function intentFor(env, now = new Date()) {
  if (env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME === 'pull_request') {
    throw new Error('Deployment reports are restricted to main releases');
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? '') ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') ||
      !/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID ?? '') ||
      !/^[1-9][0-9]{0,5}$/.test(env.GITHUB_RUN_ATTEMPT ?? '')) {
    throw new Error('Invalid release identity');
  }
  return { v: 1, repo: env.GITHUB_REPOSITORY, sha: env.GITHUB_SHA,
    requested_at: now.toISOString(), run_id: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT };
}

export function requestedBody(intent) {
  return `${marker}\n<!-- coolify-deploy-intent:${JSON.stringify(intent)} -->\n\n` +
    `### Coolify · Production\n\n**⏳ Deployment requested; runtime verification pending**\n\n` +
    `- Revision: [\`${intent.sha.slice(0, 7)}\`](https://github.com/${intent.repo}/commit/${intent.sha})\n` +
    `- Release workflow: [View run](https://github.com/${intent.repo}/actions/runs/${intent.run_id})\n\n` +
    `A successful deployment request is not proof that the new revision is running. ` +
    `The deployment observer will update this comment after checking the actual runtime.\n`;
}

export async function requestDeployment(env = process.env, fetcher = fetch, log = console) {
  const url = env.DEPLOY_WEBHOOK_URL;
  if (!url) { log.log('Image published; no deployment webhook configured.'); return { skipped: true }; }
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password) throw new Error('Deployment webhook must use HTTPS without URL credentials');
  if (!env.DEPLOY_WEBHOOK_TOKEN || !env.GITHUB_TOKEN) throw new Error('Deployment credentials are not configured');
  const intent = intentFor(env);
  const root = `https://api.github.com/repos/${intent.repo}`;
  async function github(path, method = 'GET', body) {
    const r = await fetcher(root + path, { method, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!r.ok) throw new Error(`GitHub report API returned HTTP ${r.status}`);
    return r.json();
  }
  // Preserve the current-main publication/deployment guard even if main advances between steps.
  const head = await github('/git/ref/heads/main');
  if (head.object?.sha !== intent.sha) { log.log('Release was superseded; deployment skipped.'); return { skipped: true }; }
  let registered = false;
  let reportComment;
  try {
    const prs = await github(`/commits/${intent.sha}/pulls?per_page=100`);
    const exact = prs.filter(p => p.merged_at && p.merge_commit_sha === intent.sha && p.base?.ref === 'main');
    if (exact.length === 1) {
      const pr = exact[0];
      let comments = [];
      for (let page = 1; page <= 10; page++) {
        const batch = await github(`/issues/${pr.number}/comments?per_page=100&page=${page}`);
        comments.push(...batch);
        if (batch.length < 100) break;
        if (page === 10) throw new Error('Report comment pagination exceeded');
      }
      const existing = comments.filter(c => c.user?.type === 'Bot' && (c.body ?? '').includes(marker));
      if (existing.length > 1) throw new Error('Multiple report comments require reconciliation');
      reportComment = await github(existing.length ? `/issues/comments/${existing[0].id}` : `/issues/${pr.number}/comments`,
        existing.length ? 'PATCH' : 'POST', { body: requestedBody(intent) });
      registered = true;
    } else {
      log.log('No unique merged PR for this revision; no PR comment was created.');
    }
  } catch {
    // Notification availability must not become a new production deployment dependency.
    log.warn('::warning::Deployment comment registration failed; the existing deployment will still be requested.');
  }
  async function reportRequestProblem(code) {
    if (!reportComment?.id) return;
    const rejected = [400, 401, 403, 404, 422].includes(code);
    const body = requestedBody(intent).replace('**⏳ Deployment requested; runtime verification pending**',
      rejected ? '**❌ Deployment request rejected**' : '**⚠️ Deployment request outcome unconfirmed**') +
      `\n<!-- coolify-deploy-request-error:${Number.isInteger(code) ? code : 0} -->\n` +
      (rejected ? 'The deployment endpoint rejected the request. Check the release workflow.\n' : 'The request did not complete normally; the observer will verify whether deployment started.\n');
    try { await github(`/issues/comments/${reportComment.id}`, 'PATCH', { body }); }
    catch { log.warn('::warning::Could not update the deployment request report.'); }
  }
  let response;
  try {
    response = await fetcher(target, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
      headers: { Authorization: `Bearer ${env.DEPLOY_WEBHOOK_TOKEN}` } });
  } catch {
    await reportRequestProblem(0);
    throw new Error('Deployment request did not complete; runtime outcome is unconfirmed. See the deployment platform.');
  }
  if (!response.ok) {
    await reportRequestProblem(response.status);
    throw new Error(`Deployment request returned HTTP ${response.status}; check the deployment platform.`);
  }
  // Do not print the webhook response: it may contain private infrastructure identifiers.
  log.log('Deployment request accepted; actual runtime verification continues separately.');
  return { registered, accepted: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  requestDeployment().catch(error => { console.error(error.message); process.exitCode = 1; });
}
