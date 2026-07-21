import { describe, expect, it } from "vitest";
import { createApiKey, currentEnvironment, hashToken, parseApiKey, safeHashEqual } from "./api-client.service.js";

describe("API credential format", () => {
  it("creates parseable high-entropy test and live keys", () => {
    for (const environment of ["test", "live"] as const) {
      const key = createApiKey(environment);
      expect(key.plaintext).toMatch(new RegExp(`^rp_${environment}_`));
      expect(parseApiKey(key.plaintext)?.keyPrefix).toBe(key.keyPrefix);
      expect(key.plaintext.length).toBeGreaterThan(60);
    }
  });

  it("compares token hashes without accepting malformed values", () => {
    const first = createApiKey("test").plaintext;
    const second = createApiKey("test").plaintext;
    expect(safeHashEqual(hashToken(first), hashToken(first))).toBe(true);
    expect(safeHashEqual(hashToken(first), hashToken(second))).toBe(false);
    expect(parseApiKey("owner-password")).toBeNull();
  });

  it("requires an explicit environment in production", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEnvironment = process.env.REVIEW_PILOT_ENV;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.REVIEW_PILOT_ENV;
      expect(() => currentEnvironment()).toThrow("REVIEW_PILOT_ENV is required in production");
      process.env.REVIEW_PILOT_ENV = "live";
      expect(currentEnvironment()).toBe("live");
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousEnvironment === undefined) delete process.env.REVIEW_PILOT_ENV;
      else process.env.REVIEW_PILOT_ENV = previousEnvironment;
    }
  });
});
