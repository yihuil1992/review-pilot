import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@review-pilot/db";
import { PrismaService } from "../prisma.service.js";

@Injectable()
export class ApiOperationTrackerService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  startByJobRunId(jobRunId: string) {
    return this.prisma.apiOperation.updateMany({ where: { jobRunId }, data: { status: "running", startedAt: new Date() } });
  }

  succeedByJobRunId(jobRunId: string, result: unknown) {
    return this.prisma.apiOperation.updateMany({ where: { jobRunId }, data: { status: "succeeded", result: jsonValue(result), finishedAt: new Date() } });
  }

  failByJobRunId(jobRunId: string, error: unknown) {
    return this.prisma.apiOperation.updateMany({ where: { jobRunId }, data: { status: "failed", error: safeError(error), finishedAt: new Date() } });
  }

  startByQueueJobId(queueJobId: string) {
    return this.prisma.apiOperation.updateMany({ where: { queueJobId }, data: { status: "running", startedAt: new Date() } });
  }

  succeedByQueueJobId(queueJobId: string, result: unknown) {
    return this.prisma.apiOperation.updateMany({ where: { queueJobId }, data: { status: "succeeded", result: jsonValue(result), finishedAt: new Date() } });
  }

  failByQueueJobId(queueJobId: string, error: unknown) {
    return this.prisma.apiOperation.updateMany({ where: { queueJobId }, data: { status: "failed", error: safeError(error), finishedAt: new Date() } });
  }

  async start(operationId: string) {
    return this.prisma.apiOperation.update({ where: { id: operationId }, data: { status: "running", startedAt: new Date() } });
  }

  async succeed(operationId: string, result: unknown) {
    return this.prisma.apiOperation.update({ where: { id: operationId }, data: { status: "succeeded", result: jsonValue(result), finishedAt: new Date() } });
  }

  async fail(operationId: string, error: unknown) {
    return this.prisma.apiOperation.update({ where: { id: operationId }, data: { status: "failed", error: safeError(error), finishedAt: new Date() } });
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function safeError(error: unknown): Prisma.InputJsonValue {
  return { message: error instanceof Error ? error.message.slice(0, 1000) : "Operation failed" };
}
