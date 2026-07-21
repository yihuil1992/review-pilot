import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { prisma } from "../packages/db/dist/index.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://review_pilot:review_pilot@localhost:5433/review_pilot";
const publicId = randomBytes(9).toString("hex");
const keyPrefix = `rp_test_${publicId}`;
const apiKey = `${keyPrefix}.${randomBytes(32).toString("base64url")}`;
const secretHash = createHash("sha256").update(apiKey).digest("hex");
const port = 4100 + Math.floor(Math.random() * 500);
let clientId;
let credentialId;
let secretValueId;
let googleAccountId;
let allowedReviewId;
let deniedReviewId;
let apiProcess;
let stderr = "";

try {
  const fixtureSuffix = randomBytes(8).toString("hex");
  const secretValue = await prisma.secretValue.create({ data: { scope: `smoke-${fixtureSuffix}`, key: "refresh", ciphertext: "smoke-test-only" } });
  secretValueId = secretValue.id;
  const googleAccount = await prisma.googleAccount.create({
    data: { googleUserId: `smoke-${fixtureSuffix}`, email: `smoke-${fixtureSuffix}@example.test`, refreshTokenSecretId: secretValue.id, status: "active" }
  });
  googleAccountId = googleAccount.id;
  const allowedLocation = await prisma.businessLocation.create({
    data: { googleAccountId: googleAccount.id, googleLocationName: `locations/smoke-allowed-${fixtureSuffix}`, businessName: "Smoke Allowed Location", enabled: true }
  });
  const deniedLocation = await prisma.businessLocation.create({
    data: { googleAccountId: googleAccount.id, googleLocationName: `locations/smoke-denied-${fixtureSuffix}`, businessName: "Smoke Denied Location", enabled: true }
  });
  const allowedReview = await prisma.review.create({
    data: {
      businessLocationId: allowedLocation.id,
      googleReviewId: `review-allowed-${fixtureSuffix}`,
      authorName: "Smoke Customer",
      rating: 5,
      reviewText: "Smoke review",
      status: "draft_ready",
      drafts: { create: { aiBody: "Original generated reply", body: "Original generated reply", version: 1 } }
    }
  });
  allowedReviewId = allowedReview.id;
  const deniedReview = await prisma.review.create({
    data: { businessLocationId: deniedLocation.id, googleReviewId: `review-denied-${fixtureSuffix}`, authorName: "Denied Customer", rating: 4, status: "new" }
  });
  deniedReviewId = deniedReview.id;

  const client = await prisma.apiClient.create({
    data: {
      name: "External API smoke test",
      environment: "test",
      scopes: ["system:read", "reviews:read", "reviews:write", "operations:read"],
      allLocations: false,
      locationGrants: { create: { locationId: allowedLocation.id } },
      credentials: { create: { keyPrefix, secretHash } }
    },
    include: { credentials: true }
  });
  clientId = client.id;
  credentialId = client.credentials[0].id;

  apiProcess = spawn(process.execPath, [resolve("apps/api/dist/apps/api/src/main.js")], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      REVIEW_PILOT_ENV: "test",
      WEB_ORIGIN: "http://localhost:3217",
      EXTERNAL_API_RATE_LIMIT_ENABLED: "true"
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true
  });
  apiProcess.stderr.setEncoding("utf8");
  apiProcess.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4000);
  });

  await waitUntilReady(port);
  const unauthorized = await fetch(`http://127.0.0.1:${port}/api/v1/system/status`);
  const unauthorizedBody = await unauthorized.json();
  assert(unauthorized.status === 401, `Expected unauthenticated 401, received ${unauthorized.status}`);
  assert(unauthorized.headers.get("content-type")?.includes("application/problem+json"), "Expected RFC 9457 content type");
  assert(unauthorizedBody.code === "unauthorized", "Expected stable unauthorized problem code");

  const headers = { Authorization: `Bearer ${apiKey}`, "X-Request-Id": "external-api-smoke-0001" };
  const statusResponse = await fetch(`http://127.0.0.1:${port}/api/v1/system/status`, { headers });
  const status = await statusResponse.json();
  assert(statusResponse.ok && status.data?.ready === true, "Authenticated status endpoint was not ready");
  assert(status.meta?.requestId === "external-api-smoke-0001", "Request ID was not propagated");

  const openApiResponse = await fetch(`http://127.0.0.1:${port}/api/v1/openapi.json`, { headers });
  const openApi = await openApiResponse.json();
  assert(openApiResponse.ok && openApi.openapi === "3.1.0", "OpenAPI 3.1 document was unavailable");
  assert(Object.keys(openApi.paths ?? {}).length === 22, "OpenAPI path inventory is incomplete");

  const listResponse = await fetch(`http://127.0.0.1:${port}/api/v1/reviews?status=all`, { headers });
  const list = await listResponse.json();
  assert(listResponse.ok && list.data.length === 1 && list.data[0].id === allowedReviewId, "Location grants did not filter the review list");

  const deniedResponse = await fetch(`http://127.0.0.1:${port}/api/v1/reviews/${deniedReviewId}`, { headers });
  assert(deniedResponse.status === 404, `Expected cross-location review access to return 404, received ${deniedResponse.status}`);

  const writeHeaders = {
    ...headers,
    "Content-Type": "application/json",
    "Idempotency-Key": "external-api-smoke-edit-0001",
    "X-Request-Id": "external-api-smoke-write-0001"
  };
  const editBody = JSON.stringify({ body: "Human edited smoke reply", expectedVersion: 1 });
  const firstEditResponse = await fetch(`http://127.0.0.1:${port}/api/v1/reviews/${allowedReviewId}/draft`, { method: "PATCH", headers: writeHeaders, body: editBody });
  const firstEdit = await firstEditResponse.json();
  assert(firstEditResponse.ok && firstEdit.data.replayed === false, "First idempotent draft edit did not execute");
  assert(firstEdit.data.draft.body === "Human edited smoke reply", "Draft body was not persisted");

  const replayResponse = await fetch(`http://127.0.0.1:${port}/api/v1/reviews/${allowedReviewId}/draft`, { method: "PATCH", headers: writeHeaders, body: editBody });
  const replay = await replayResponse.json();
  assert(replayResponse.ok && replay.data.replayed === true, "Identical idempotent request was not replayed");

  const conflictResponse = await fetch(`http://127.0.0.1:${port}/api/v1/reviews/${allowedReviewId}/draft`, {
    method: "PATCH",
    headers: writeHeaders,
    body: JSON.stringify({ body: "Different body for same key", expectedVersion: 1 })
  });
  assert(conflictResponse.status === 409, `Expected idempotency fingerprint conflict, received ${conflictResponse.status}`);

  const operationResponse = await fetch(`http://127.0.0.1:${port}/api/v1/operations/${firstEdit.data.operation.id}`, { headers });
  const operation = await operationResponse.json();
  assert(operationResponse.ok && operation.data.status === "succeeded", "Synchronous operation did not reach succeeded status");

  await prisma.apiCredential.update({ where: { id: credentialId }, data: { revokedAt: new Date() } });
  const revokedResponse = await fetch(`http://127.0.0.1:${port}/api/v1/system/status`, { headers });
  assert(revokedResponse.status === 401, `Revoked credential remained active; received ${revokedResponse.status}`);

  console.log(JSON.stringify({
    ok: true,
    unauthorizedStatus: unauthorized.status,
    problemCode: unauthorizedBody.code,
    environment: status.data.environment,
    openApiVersion: openApi.openapi,
    openApiPaths: Object.keys(openApi.paths).length,
    locationGrantFiltered: true,
    idempotencyReplay: true,
    idempotencyConflict: conflictResponse.status,
    operationStatus: operation.data.status,
    revokedStatus: revokedResponse.status
  }));
} finally {
  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill("SIGTERM");
    await Promise.race([new Promise((resolveExit) => apiProcess.once("exit", resolveExit)), delay(2000)]);
  }
  if (clientId) {
    await prisma.apiClient.delete({ where: { id: clientId } }).catch(() => undefined);
  }
  await prisma.apiAuditEvent.deleteMany({ where: { requestId: { startsWith: "external-api-smoke" } } }).catch(() => undefined);
  if (googleAccountId) {
    await prisma.googleAccount.delete({ where: { id: googleAccountId } }).catch(() => undefined);
  }
  if (secretValueId) {
    await prisma.secretValue.delete({ where: { id: secretValueId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
}

async function waitUntilReady(port) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (apiProcess?.exitCode !== null) {
      throw new Error(`API process exited before readiness. ${stderr}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // Expected while the server starts.
    }
    await delay(250);
  }
  throw new Error(`API did not become ready. ${stderr}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
