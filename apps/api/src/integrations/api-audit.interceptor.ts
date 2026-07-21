import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from "@nestjs/common";
import { Prisma } from "@review-pilot/db";
import type { Response } from "express";
import { catchError, from, mergeMap, Observable, tap, throwError } from "rxjs";
import { PrismaService } from "../prisma.service.js";
import type { ExternalApiRequest } from "./api-auth.types.js";

@Injectable()
export class ApiAuditInterceptor implements NestInterceptor {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<ExternalApiRequest>();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
      return next.handle();
    }
    const response = context.switchToHttp().getResponse<Response>();
    const principal = request.apiPrincipal;
    const startedAt = Date.now();
    const action = `${request.method.toUpperCase()} ${request.route?.path ?? request.path}`;
    return from(this.prisma.apiAuditEvent.create({
      data: {
        apiClientId: principal?.clientId,
        apiCredentialId: principal?.credentialId,
        requestId: request.requestId ?? "unknown",
        action,
        targetType: targetType(request.path),
        targetId: firstPathId(request.path),
        result: "started",
        sourceIp: request.ip,
        userAgent: request.header("user-agent")?.slice(0, 512),
        metadata: { path: request.path } satisfies Prisma.InputJsonValue
      }
    })).pipe(
      mergeMap((audit) => next.handle().pipe(
        tap(() => {
          void this.finish(audit.id, "succeeded", response.statusCode, startedAt);
        }),
        catchError((error) => {
          void this.finish(audit.id, "failed", typeof error?.getStatus === "function" ? error.getStatus() : 500, startedAt);
          return throwError(() => error);
        })
      ))
    );
  }

  private async finish(id: string, result: string, httpStatus: number, startedAt: number) {
    await this.prisma.apiAuditEvent.update({
      where: { id },
      data: { result, httpStatus, durationMs: Date.now() - startedAt }
    }).catch(() => undefined);
  }
}

function targetType(path: string) {
  return path.split("/").filter(Boolean)[2] ?? null;
}

function firstPathId(path: string) {
  return path.split("/").filter(Boolean)[3] ?? null;
}
