import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { externalCommandJobNames, externalCommandQueueName, type ExternalCommandJobData } from "@review-pilot/shared";
import { Job, Worker } from "bullmq";
import { GoogleReviewSyncService } from "../google/google-review-sync.service.js";
import { ApiOperationTrackerService } from "./api-operation-tracker.service.js";
import { WebhookEmitterService } from "../webhooks/webhook-emitter.service.js";

@Injectable()
export class ExternalCommandProcessor implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<ExternalCommandJobData> | null = null;

  constructor(
    @Inject(GoogleReviewSyncService) private readonly googleSync: GoogleReviewSyncService,
    @Inject(ApiOperationTrackerService) private readonly operations: ApiOperationTrackerService,
    @Inject(WebhookEmitterService) private readonly webhooks: WebhookEmitterService
  ) {}

  onModuleInit() {
    this.worker = new Worker(externalCommandQueueName, (job) => this.process(job), { connection: redisConnection(), concurrency: 1 });
    console.log("external command BullMQ worker ready");
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<ExternalCommandJobData>) {
    if (job.name !== externalCommandJobNames.syncLocation) throw new Error(`Unsupported external command: ${job.name}`);
    await this.operations.start(job.data.operationId);
    try {
      const result = await this.googleSync.syncOne(job.data.locationId, "external_api");
      const operation = await this.operations.succeed(job.data.operationId, result);
      await this.webhooks.emit(job.data.apiClientId, {
        eventType: "sync.completed",
        resourceType: "location",
        resourceId: job.data.locationId,
        resourceVersion: operation.updatedAt.toISOString(),
        data: result
      });
      return result;
    } catch (error) {
      await this.operations.fail(job.data.operationId, error);
      throw error;
    }
  }
}

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6380");
  return { host: url.hostname, port: Number(url.port || 6379), username: url.username || undefined, password: url.password || undefined, db: Number(url.pathname.slice(1) || 0), maxRetriesPerRequest: null };
}
