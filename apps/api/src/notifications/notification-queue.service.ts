import { Injectable, OnModuleDestroy } from "@nestjs/common";
import {
  notificationJobNames,
  notificationQueueName,
  type NotificationSendJobData
} from "@review-pilot/shared";
import { Queue } from "bullmq";

@Injectable()
export class NotificationQueueService implements OnModuleDestroy {
  private readonly queue = new Queue(notificationQueueName, {
    connection: redisConnection()
  });

  async enqueueScanDue(source: string) {
    const job = await this.queue.add(
      notificationJobNames.scanDue,
      { source },
      {
        attempts: 1,
        removeOnComplete: { age: 24 * 60 * 60, count: 100 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 500 }
      }
    );
    return { jobId: String(job.id), name: job.name };
  }

  async enqueueSend(data: NotificationSendJobData) {
    const job = await this.queue.add(notificationJobNames.send, data, {
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 500 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 }
    });
    return { jobId: String(job.id), name: job.name };
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
