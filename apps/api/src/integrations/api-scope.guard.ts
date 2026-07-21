import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ApiScope } from "@review-pilot/shared";
import type { ExternalApiRequest } from "./api-auth.types.js";
import { ApiRateLimitService } from "./api-rate-limit.service.js";
import { apiScopesMetadataKey } from "./api-scope.decorator.js";

const costlyScopes = new Set<ApiScope>([
  "drafts:generate",
  "sync:run",
  "reviews:publish:test",
  "reviews:publish:live",
  "notifications:send",
  "notifications:manage",
  "publish-mode:manage"
]);

@Injectable()
export class ApiScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ApiRateLimitService) private readonly limits: ApiRateLimitService
  ) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<ApiScope[]>(apiScopesMetadataKey, [context.getHandler(), context.getClass()]) ?? [];
    const request = context.switchToHttp().getRequest<ExternalApiRequest>();
    const principal = request.apiPrincipal;
    if (!principal || required.some((scope) => !principal.scopes.includes(scope))) {
      throw new ForbiddenException(`Required API scope: ${required.join(", ") || "unknown"}`);
    }
    for (const scope of required.filter((candidate) => costlyScopes.has(candidate))) {
      const [limit, window] = scopeLimit(scope);
      await this.limits.consume(principal.clientId, scope, limit, window, true);
    }
    return true;
  }
}

function scopeLimit(scope: ApiScope): [number, number] {
  if (scope === "reviews:publish:live" || scope === "notifications:send") return [10, 3600];
  if (scope === "sync:run") return [12, 3600];
  if (scope === "drafts:generate") return [30, 3600];
  return [60, 3600];
}
