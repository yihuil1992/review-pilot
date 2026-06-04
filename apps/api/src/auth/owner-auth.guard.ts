import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { csrfCookieName } from "./auth.controller.js";
import { AuthService, ownerSessionCookieName } from "./auth.service.js";

@Injectable()
export class OwnerAuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = parseCookie(request.headers.cookie ?? "")[ownerSessionCookieName];
    const session = await this.auth.verifyToken(token);
    if (!session) {
      throw new UnauthorizedException("Owner login required");
    }
    if (requiresCsrf(request)) {
      const cookies = parseCookie(request.headers.cookie ?? "");
      const csrfHeader = request.header("x-csrf-token");
      if (!cookies[csrfCookieName] || !csrfHeader || cookies[csrfCookieName] !== csrfHeader) {
        throw new UnauthorizedException("CSRF token required");
      }
    }

    request.headers["x-review-pilot-owner-id"] = session.ownerId;
    return true;
  }
}

function requiresCsrf(request: Request): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
}

function parseCookie(header: string): Record<string, string> {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) {
          return [part, ""];
        }
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}
