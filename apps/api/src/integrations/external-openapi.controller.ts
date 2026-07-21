import { Controller, Get, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { ExternalApiRequest } from "./api-auth.types.js";
import { ExternalApiErrorFilter } from "./api-error.filter.js";
import { ApiKeyGuard } from "./api-key.guard.js";
import { RequireApiScopes } from "./api-scope.decorator.js";
import { ApiScopeGuard } from "./api-scope.guard.js";
import { externalApiDocument } from "./openapi.document.js";

@Controller("v1")
@UseGuards(ApiKeyGuard, ApiScopeGuard)
@UseFilters(ExternalApiErrorFilter)
export class ExternalOpenApiController {
  @Get("openapi.json")
  @RequireApiScopes("system:read")
  get(@Req() _request: ExternalApiRequest) {
    return externalApiDocument();
  }
}
