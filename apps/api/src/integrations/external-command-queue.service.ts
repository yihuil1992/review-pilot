import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { externalCommandJobNames, externalCommandQueueName, type ExternalCommandJobData } from "@review-pilot/shared";
import { Queue } from "bullmq";

@Injectable()
export class ExternalCommandQueueService implements OnModuleDestroy {
  private readonly queue = new Queue<ExternalCommandJobData>(externalCommandQueueName, { connection: redisConnection() });

  async enqueueLocationSync(data: ExternalCommandJobData) {
    const job = await this.queue.add(externalCommandJobNames.syncLocation, data, {
      jobId: data.operationId,
      attempts: 2,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 500 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 }
    });
    return { queueJobId: String(job.id) };
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6380");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number(url.pathname.slice(1) || 0)
  };
}
