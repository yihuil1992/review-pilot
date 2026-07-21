import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { ExternalApiRequest } from "./api-auth.types.js";
import { ApiClientService } from "./api-client.service.js";
import { ApiRateLimitService } from "./api-rate-limit.service.js";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @Inject(ApiClientService) private readonly clients: ApiClientService,
    @Inject(ApiRateLimitService) private readonly limits: ApiRateLimitService
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<ExternalApiRequest>();
    await this.limits.consume(request.ip || request.socket.remoteAddress || "unknown", "unauthenticated", 120, 60, false);
    const authorization = request.header("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : undefined;
    const principal = await this.clients.authenticate(token);
    await this.limits.consume(principal.clientId, "general", 300, 60, false);
    request.apiPrincipal = principal;
    return true;
  }
}
