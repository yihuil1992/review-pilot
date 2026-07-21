import { describe, expect, it } from "vitest";
import { externalApiDocument } from "./openapi.document.js";

describe("external OpenAPI contract", () => {
  it("documents every v1 resource and bearer security", () => {
    const document = externalApiDocument();
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths)).toHaveLength(22);
    expect(document.paths["/reviews/{reviewId}/publish-attempts"]?.post?.security).toEqual([{ BearerAuth: [] }]);
    expect(document.components?.schemas?.ProblemDetails).toBeDefined();
    expect(document.components?.securitySchemes?.BearerAuth).toBeDefined();
  });
});
