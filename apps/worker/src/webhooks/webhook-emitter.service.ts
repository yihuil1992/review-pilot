import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Prisma } from "@review-pilot/db";
import { webhookJobNames, webhookQueueName, type WebhookDeliveryJobData, type WebhookEventInput } from "@review-pilot/shared";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma.service.js";

@Injectable()
export class WebhookEmitterService implements OnModuleDestroy {
  private readonly queue = new Queue<WebhookDeliveryJobData>(webhookQueueName, { connection: redisConnection() });

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async emitForJob(input: { jobRunId?: string; queueJobId?: string }, event: WebhookEventInput) {
    const operation = await this.prisma.apiOperation.findFirst({
      where: input.jobRunId ? { jobRunId: input.jobRunId } : { queueJobId: input.queueJobId },
      select: { apiClientId: true }
    });
    if (!operation) return;
    await this.emit(operation.apiClientId, event);
  }

  async emit(apiClientId: string, event: WebhookEventInput) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({ where: { apiClientId, active: true, events: { has: event.eventType } } });
    if (!endpoints.length) return;
    const eventId = randomUUID();
    const payload = jsonValue({
      eventId,
      eventType: event.eventType,
      occurredAt: new Date().toISOString(),
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      resourceVersion: event.resourceVersion,
      data: event.data
    });
    const deliveries = await this.prisma.$transaction(endpoints.map((endpoint) => this.prisma.webhookDelivery.create({
      data: { endpointId: endpoint.id, eventId, eventType: event.eventType, payload }
    })));
    await Promise.all(deliveries.map((delivery) => this.queue.add(webhookJobNames.deliver, { deliveryId: delivery.id }, {
      jobId: delivery.id,
      attempts: 6,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 86_400, count: 1000 },
      removeOnFail: { age: 2_592_000, count: 5000 }
    })));
  }

  async emitAll(event: WebhookEventInput) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { active: true, events: { has: event.eventType } },
      distinct: ["apiClientId"],
      select: { apiClientId: true }
    });
    await Promise.all(endpoints.map((endpoint) => this.emit(endpoint.apiClientId, event)));
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6380");
  return { host: url.hostname, port: Number(url.port || 6379), username: url.username || undefined, password: url.password || undefined, db: Number(url.pathname.slice(1) || 0) };
}
