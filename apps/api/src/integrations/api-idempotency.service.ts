import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@review-pilot/db";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma.service.js";
import type { ApiPrincipal } from "./api-auth.types.js";
import { toOperationDto } from "./api-operations.service.js";

export type IdempotentHandlerResult<T> = {
  data: T;
  asynchronous?: boolean;
  queueJobId?: string;
  jobRunId?: string;
};

type ExecuteInput<T> = {
  principal: ApiPrincipal;
  requestId: string;
  idempotencyKey: string | undefined;
  action: string;
  requestBody: unknown;
  resourceType?: string;
  resourceId?: string;
  locationId?: string;
  handler: (operationId: string) => Promise<IdempotentHandlerResult<T>>;
};

@Injectable()
export class ApiIdempotencyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute<T>(input: ExecuteInput<T>): Promise<{
    data: T;
    operation: ReturnType<typeof toOperationDto>;
    replayed: boolean;
    statusCode: number;
  }> {
    const key = input.idempotencyKey?.trim();
    if (!key || key.length < 8 || key.length > 200) {
      throw new BadRequestException("Idempotency-Key header must be between 8 and 200 characters");
    }
    const fingerprint = fingerprintOf(input.requestBody);
    let record = await this.prisma.apiIdempotencyRecord.findUnique({
      where: { apiClientId_action_idempotencyKey: { apiClientId: input.principal.clientId, action: input.action, idempotencyKey: key } },
      include: { operation: true }
    });
    if (record && record.requestFingerprint !== fingerprint) {
      throw new ConflictException("Idempotency-Key was already used with a different request");
    }
    if (record?.status === "completed") {
      return {
        data: record.responseBody as T,
        operation: toOperationDto(record.operation),
        replayed: true,
        statusCode: record.responseStatus ?? 200
      };
    }
    if (record?.status === "processing") {
      throw new ConflictException("An identical idempotent request is still processing");
    }

    if (!record) {
      try {
        record = await this.prisma.$transaction(async (tx) => {
          const operation = await tx.apiOperation.create({
            data: {
              apiClientId: input.principal.clientId,
              apiCredentialId: input.principal.credentialId,
              requestId: input.requestId,
              type: input.action,
              status: "running",
              resourceType: input.resourceType,
              resourceId: input.resourceId,
              locationId: input.locationId,
              startedAt: new Date()
            }
          });
          return tx.apiIdempotencyRecord.create({
            data: {
              apiClientId: input.principal.clientId,
              operationId: operation.id,
              action: input.action,
              idempotencyKey: key,
              requestFingerprint: fingerprint,
              expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
            },
            include: { operation: true }
          });
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return this.execute(input);
        }
        throw error;
      }
    } else {
      record = await this.prisma.apiIdempotencyRecord.update({
        where: { id: record.id },
        data: { status: "processing" },
        include: { operation: true }
      });
      await this.prisma.apiOperation.update({
        where: { id: record.operationId },
        data: { status: "running", error: Prisma.JsonNull, startedAt: new Date(), finishedAt: null }
      });
    }

    try {
      const handled = await input.handler(record.operationId);
      const statusCode = handled.asynchronous ? 202 : 200;
      const safeData = jsonValue(handled.data);
      const operation = await this.prisma.apiOperation.update({
        where: { id: record.operationId },
        data: {
          status: handled.asynchronous ? "queued" : "succeeded",
          queueJobId: handled.queueJobId,
          jobRunId: handled.jobRunId,
          result: safeData,
          finishedAt: handled.asynchronous ? null : new Date()
        }
      });
      await this.prisma.apiIdempotencyRecord.update({
        where: { id: record.id },
        data: { status: "completed", responseStatus: statusCode, responseBody: safeData }
      });
      return { data: handled.data, operation: toOperationDto(operation), replayed: false, statusCode };
    } catch (error) {
      const safeError = { message: error instanceof Error ? error.message : "Operation failed" };
      await this.prisma.$transaction([
        this.prisma.apiOperation.update({
          where: { id: record.operationId },
          data: { status: "failed", error: safeError, finishedAt: new Date() }
        }),
        this.prisma.apiIdempotencyRecord.update({ where: { id: record.id }, data: { status: "failed" } })
      ]);
      throw error;
    }
  }
}

function fingerprintOf(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
