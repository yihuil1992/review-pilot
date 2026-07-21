import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import type { ExternalApiRequest } from "./api-auth.types.js";

@Catch()
export class ExternalApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<ExternalApiRequest>();
    if (!request.originalUrl.startsWith("/api/v1")) {
      throw exception;
    }
    const response = context.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : null;
    const detail = extractDetail(raw, exception, status);
    const code = errorCode(status, raw);
    const body = {
      type: `https://review-pilot.local/problems/${code}`,
      title: HttpStatus[status] ?? "Error",
      status,
      detail,
      instance: request.originalUrl,
      code,
      requestId: request.requestId ?? "unknown",
      ...(raw && typeof raw === "object" && "errors" in raw ? { errors: (raw as { errors: unknown }).errors } : {}),
      ...(raw && typeof raw === "object" && "issues" in raw ? { errors: (raw as { issues: unknown }).issues } : {})
    };
    response.status(status).type("application/problem+json").json(body);
  }
}

function extractDetail(raw: string | object | null, exception: unknown, status: number) {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "message" in raw) {
    const message = (raw as { message: unknown }).message;
    return Array.isArray(message) ? message.join("; ") : String(message);
  }
  if (status < 500 && exception instanceof Error) return exception.message;
  return "The API could not complete the request";
}

function errorCode(status: number, raw: string | object | null) {
  if (raw && typeof raw === "object" && "code" in raw && typeof (raw as { code: unknown }).code === "string") {
    return (raw as { code: string }).code;
  }
  return ({ 400: "invalid_request", 401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "conflict", 429: "rate_limited" } as Record<number, string>)[status] ?? (status >= 500 ? "internal_error" : "request_failed");
}
