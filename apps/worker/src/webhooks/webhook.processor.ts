import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { signWebhookPayload, webhookJobNames, webhookQueueName, type WebhookDeliveryJobData } from "@review-pilot/shared";
import { Job, Worker } from "bullmq";
import { PrismaService } from "../prisma.service.js";
import { CryptoService } from "../security/crypto.service.js";

@Injectable()
export class WebhookProcessor implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<WebhookDeliveryJobData> | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CryptoService) private readonly crypto: CryptoService
  ) {}

  onModuleInit() {
    this.worker = new Worker(webhookQueueName, (job) => this.process(job), { connection: redisConnection(), concurrency: Number(process.env.WEBHOOK_WORKER_CONCURRENCY ?? 4) });
    console.log("webhook BullMQ worker ready");
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<WebhookDeliveryJobData>) {
    if (job.name !== webhookJobNames.deliver) throw new Error(`Unsupported webhook job: ${job.name}`);
    const delivery = await this.prisma.webhookDelivery.findUnique({ where: { id: job.data.deliveryId }, include: { endpoint: true } });
    if (!delivery || !delivery.endpoint.active) return { skipped: true };
    await this.prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "delivering", attempts: { increment: 1 }, nextAttemptAt: null } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify(delivery.payload);
    const secret = this.crypto.decryptSecret(delivery.endpoint.secretEncrypted);
    const signature = signWebhookPayload(secret, timestamp, body);
    try {
      const response = await fetch(delivery.endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Review-Pilot-Webhooks/1.0",
          "X-Review-Pilot-Delivery": delivery.id,
          "X-Review-Pilot-Timestamp": timestamp,
          "X-Review-Pilot-Signature": `v1=${signature}`
        },
        body,
        signal: AbortSignal.timeout(Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000))
      });
      if (!response.ok) throw new Error(`Webhook endpoint returned ${response.status}`);
      await this.prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "delivered", deliveredAt: new Date(), lastError: null } });
      return { delivered: true, status: response.status };
    } catch (error) {
      const maxAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
      const finalAttempt = job.attemptsMade + 1 >= maxAttempts;
      const message = error instanceof Error ? error.message.slice(0, 1000) : "Webhook delivery failed";
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: finalAttempt ? "failed" : "pending", lastError: message, nextAttemptAt: finalAttempt ? null : new Date(Date.now() + 30_000 * 2 ** job.attemptsMade) }
      });
      throw new Error(message);
    }
  }
}

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6380");
  return { host: url.hostname, port: Number(url.port || 6379), username: url.username || undefined, password: url.password || undefined, db: Number(url.pathname.slice(1) || 0), maxRetriesPerRequest: null };
}
