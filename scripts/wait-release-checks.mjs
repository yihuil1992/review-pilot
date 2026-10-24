// Publish only a commit whose independent correctness and dependency gates passed.
const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repository, GITHUB_SHA: revision } = process.env;
if (!token || !repository || !/^[0-9a-f]{40}$/.test(revision ?? "")) throw new Error("Missing release context");
const required = ["verify", "Full lockfile OSV scan"];
const deadline = Date.now() + 25 * 60_000;
while (true) {
  const response = await fetch(`https://api.github.com/repos/${repository}/commits/${revision}/check-runs?per_page=100`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`Cannot verify release checks: HTTP ${response.status}`);
  const { check_runs: runs } = await response.json();
  const checks = required.map((name) => runs.filter((run) => run.name === name && run.head_sha === revision && run.app?.slug === "github-actions").sort((a, b) => b.id - a.id)[0]);
  if (checks.some((check) => check?.status === "completed" && check.conclusion !== "success")) throw new Error("A required release check failed");
  if (checks.every((check) => check?.status === "completed" && check.conclusion === "success")) break;
  if (Date.now() >= deadline) throw new Error("Required release checks did not complete in time");
  console.log("Waiting for correctness and dependency checks on this exact commit.");
  await new Promise((resolve) => setTimeout(resolve, 15_000));
}
console.log("Exact-commit release checks passed.");
