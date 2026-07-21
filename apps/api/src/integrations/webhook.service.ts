import { ConflictException, Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Prisma } from "@review-pilot/db";
import { webhookJobNames, webhookQueueName, type WebhookDeliveryJobData, type WebhookEventInput } from "@review-pilot/shared";
import { Queue } from "bullmq";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma.service.js";
import { CryptoService } from "../security/crypto.service.js";

@Injectable()
export class WebhookService implements OnModuleDestroy {
  private readonly queue = new Queue<WebhookDeliveryJobData>(webhookQueueName, { connection: redisConnection() });

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CryptoService) private readonly crypto: CryptoService
  ) {}

  async listEndpoints() {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      include: { apiClient: { select: { name: true } }, _count: { select: { deliveries: true } } },
      orderBy: { createdAt: "desc" }
    });
    return endpoints.map((endpoint) => ({
      id: endpoint.id,
      apiClientId: endpoint.apiClientId,
      apiClientName: endpoint.apiClient.name,
      url: endpoint.url,
      events: endpoint.events,
      active: endpoint.active,
      deliveryCount: endpoint._count.deliveries,
      createdAt: endpoint.createdAt.toISOString(),
      updatedAt: endpoint.updatedAt.toISOString()
    }));
  }

  async createEndpoint(input: { apiClientId: string; url: string; events: string[] }) {
    const client = await this.prisma.apiClient.findUnique({ where: { id: input.apiClientId } });
    if (!client || client.revokedAt) throw new ConflictException("API client is not active");
    const secret = `whsec_${randomBytes(32).toString("base64url")}`;
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        apiClientId: input.apiClientId,
        url: input.url,
        events: [...new Set(input.events)],
        secretEncrypted: this.crypto.encryptSecret(secret)
      }
    });
    await this.audit(endpoint.apiClientId, "integration.webhook.create", "webhook-endpoint", endpoint.id);
    return { endpoint: safeEndpoint(endpoint), secret };
  }

  async updateEndpoint(id: string, input: { url?: string; events?: string[]; active?: boolean }) {
    const endpoint = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(input.url === undefined ? {} : { url: input.url }),
        ...(input.events === undefined ? {} : { events: [...new Set(input.events)] }),
        ...(input.active === undefined ? {} : { active: input.active })
      }
    });
    await this.audit(endpoint.apiClientId, "integration.webhook.update", "webhook-endpoint", endpoint.id);
    return safeEndpoint(endpoint);
  }

  async rotateSecret(id: string) {
    const secret = `whsec_${randomBytes(32).toString("base64url")}`;
    const endpoint = await this.prisma.webhookEndpoint.update({ where: { id }, data: { secretEncrypted: this.crypto.encryptSecret(secret) } });
    await this.audit(endpoint.apiClientId, "integration.webhook.rotate-secret", "webhook-endpoint", endpoint.id);
    return { endpoint: safeEndpoint(endpoint), secret };
  }

  async emit(input: WebhookEventInput, apiClientId?: string) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { active: true, events: { has: input.eventType }, ...(apiClientId ? { apiClientId } : {}) }
    });
    if (!endpoints.length) return { eventId: null, deliveries: 0 };
    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();
    const payload = jsonValue({
      eventId,
      eventType: input.eventType,
      occurredAt,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      resourceVersion: input.resourceVersion,
      data: input.data
    });
    const deliveries = await this.prisma.$transaction(
      endpoints.map((endpoint) => this.prisma.webhookDelivery.create({
        data: { endpointId: endpoint.id, eventId, eventType: input.eventType, payload }
      }))
    );
    await Promise.all(deliveries.map((delivery) => this.queue.add(webhookJobNames.deliver, { deliveryId: delivery.id }, webhookJobOptions(delivery.id))));
    return { eventId, deliveries: deliveries.length };
  }

  async replayDelivery(deliveryId: string) {
    const delivery = await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: "pending", nextAttemptAt: null, lastError: null }
    });
    await this.queue.add(webhookJobNames.deliver, { deliveryId }, webhookJobOptions(`${deliveryId}-${Date.now()}`));
    const endpoint = await this.prisma.webhookEndpoint.findUnique({ where: { id: delivery.endpointId }, select: { apiClientId: true } });
    if (endpoint) await this.audit(endpoint.apiClientId, "integration.webhook.replay", "webhook-delivery", delivery.id);
    return { id: delivery.id, status: delivery.status };
  }

  async onModuleDestroy() {
    await this.queue.close();
  }

  private async audit(apiClientId: string, action: string, targetType: string, targetId: string) {
    await this.prisma.apiAuditEvent.create({ data: { apiClientId, requestId: randomUUID(), action, targetType, targetId, result: "succeeded" } });
  }
}

function safeEndpoint(endpoint: { id: string; apiClientId: string; url: string; events: string[]; active: boolean; createdAt: Date; updatedAt: Date }) {
  return { ...endpoint, createdAt: endpoint.createdAt.toISOString(), updatedAt: endpoint.updatedAt.toISOString() };
}

function webhookJobOptions(jobId: string) {
  return {
    jobId,
    attempts: 6,
    backoff: { type: "exponential" as const, delay: 30_000 },
    removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 30 * 24 * 60 * 60, count: 5000 }
  };
}

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6380");
  return { host: url.hostname, port: Number(url.port || 6379), username: url.username || undefined, password: url.password || undefined, db: Number(url.pathname.slice(1) || 0) };
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
