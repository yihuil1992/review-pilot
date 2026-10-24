// Real built-web smoke test. All requests stay on loopback; no provider/database access.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const backend = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Set-Cookie", "probe=synthetic; HttpOnly; Path=/; SameSite=Lax");
  res.end(JSON.stringify({ path: req.url, body: Buffer.concat(chunks).toString(), authorization: req.headers.authorization }));
});
backend.listen(0, "127.0.0.1");
await once(backend, "listening");
try {
  for (const hostname of ["one.example.com", "two.example.com"]) {
    let logs = "";
    const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "4390"], {
      cwd: fileURLToPath(new URL("../apps/web/", import.meta.url)),
      env: { ...process.env, NODE_ENV: "production", PUBLIC_WEB_ORIGIN: `https://${hostname}`, API_PROXY_URL: `http://127.0.0.1:${backend.address().port}` },
      stdio: ["ignore", "pipe", "pipe"]
    });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => { logs = (logs + data).slice(-3000); });
    const done = once(child, "exit");
    try {
      let ready = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        if (child.exitCode !== null) throw new Error(`Built web exited: ${logs}`);
        try { ready = (await fetch("http://127.0.0.1:4390/api/ready", { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Starting. */ }
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      assert.ok(ready, `Built web did not become ready: ${logs}`);
      const response = await fetch("http://127.0.0.1:4390/api/probe?x=1", { method: "POST", body: "synthetic-body", headers: { Authorization: "Bearer synthetic" } });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { path: "/api/probe?x=1", body: "synthetic-body", authorization: "Bearer synthetic" });
      assert.match(response.headers.get("set-cookie"), /probe=synthetic/);
      assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
      const redirect = await fetch("http://127.0.0.1:4390/path?q=1", { headers: { "cf-visitor": '{"scheme":"http"}' }, redirect: "manual" });
      assert.equal(redirect.status, 308);
      assert.equal(redirect.headers.get("location"), `https://${hostname}/path?q=1`);
      console.log(`Built image runtime-origin and API forwarding verified for ${hostname}.`);
    } finally {
      if (child.exitCode === null) child.kill("SIGTERM");
      await done;
    }
  }
} finally {
  backend.closeAllConnections();
  await new Promise((resolve) => backend.close(resolve));
}
