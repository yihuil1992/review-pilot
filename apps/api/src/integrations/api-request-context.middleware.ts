import { randomUUID } from "node:crypto";
import type { NextFunction, Response } from "express";
import type { ExternalApiRequest } from "./api-auth.types.js";

const requestIdPattern = /^[A-Za-z0-9._:-]{8,128}$/;

export function apiRequestContext(request: ExternalApiRequest, response: Response, next: NextFunction) {
  const supplied = request.header("x-request-id")?.trim();
  const requestId = supplied && requestIdPattern.test(supplied) ? supplied : randomUUID();
  request.requestId = requestId;
  response.setHeader("X-Request-Id", requestId);
  next();
}
