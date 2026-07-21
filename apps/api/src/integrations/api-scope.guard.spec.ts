import { describe, expect, it, vi } from "vitest";
import { ApiScopeGuard } from "./api-scope.guard.js";

describe("ApiScopeGuard", () => {
  it("allows declared scopes", async () => {
    const limits = { consume: vi.fn().mockResolvedValue(undefined) };
    const guard = new ApiScopeGuard(reflector(["reviews:read"]), limits as never);
    await expect(guard.canActivate(context(["reviews:read"]))).resolves.toBe(true);
    expect(limits.consume).not.toHaveBeenCalled();
  });

  it("denies missing scopes", async () => {
    const guard = new ApiScopeGuard(reflector(["reviews:write"]), { consume: vi.fn() } as never);
    await expect(guard.canActivate(context(["reviews:read"]))).rejects.toMatchObject({ status: 403 });
  });

  it("fails through the distributed safety bucket for costly actions", async () => {
    const limits = { consume: vi.fn().mockResolvedValue(undefined) };
    const guard = new ApiScopeGuard(reflector(["notifications:send"]), limits as never);
    await expect(guard.canActivate(context(["notifications:send"]))).resolves.toBe(true);
    expect(limits.consume).toHaveBeenCalledWith("client-1", "notifications:send", 10, 3600, true);
  });
});

function reflector(required: string[]) {
  return { getAllAndOverride: () => required } as never;
}

function context(scopes: string[]) {
  const request = {
    apiPrincipal: {
      clientId: "client-1",
      credentialId: "credential-1",
      credentialPrefix: "rp_test_public",
      environment: "test",
      scopes,
      allLocations: true,
      locationIds: []
    }
  };
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request })
  } as never;
}
