import { Injectable, OnModuleDestroy } from "@nestjs/common";
import {
  codexRuntimeJobNames,
  codexRuntimeQueueName,
  semanticJobNames,
  semanticQueueName,
  type SemanticJobData
} from "@review-pilot/shared";
import { Job, Queue, QueueEvents } from "bullmq";

@Injectable()
export class SemanticQueueService implements OnModuleDestroy {
  private readonly connection = redisConnection();
  private readonly semanticQueue = new Queue<SemanticJobData>(semanticQueueName, {
    connection: this.connection
  });
  private readonly runtimeQueue = new Queue(codexRuntimeQueueName, {
    connection: this.connection
  });
  private readonly runtimeEvents = new QueueEvents(codexRuntimeQueueName, {
    connection: this.connection
  });

  async enqueueGenerate(data: SemanticJobData) {
    const job = await this.semanticQueue.add(semanticJobNames.generateReply, data, semanticJobOptions(data));
    return queueResponse(job);
  }

  async enqueueRegenerate(data: SemanticJobData) {
    const job = await this.semanticQueue.add(semanticJobNames.regenerateReply, data, semanticJobOptions(data));
    return queueResponse(job);
  }

  async testRuntime() {
    return this.enqueueRuntimeCommand(codexRuntimeJobNames.test);
  }

  async startDeviceLogin() {
    return this.enqueueRuntimeCommand(codexRuntimeJobNames.startLogin);
  }

  async getDeviceLoginStatus() {
    return this.enqueueRuntimeCommand(codexRuntimeJobNames.loginStatus);
  }

  async onModuleDestroy() {
    await Promise.all([
      this.semanticQueue.close(),
      this.runtimeQueue.close(),
      this.runtimeEvents.close()
    ]);
  }

  private async enqueueRuntimeCommand(name: string) {
    await this.runtimeEvents.waitUntilReady();
    const job = await this.runtimeQueue.add(name, {}, {
      attempts: 1,
      removeOnComplete: { age: 60 * 60, count: 100 },
      removeOnFail: { age: 24 * 60 * 60, count: 100 }
    });
    return job.waitUntilFinished(this.runtimeEvents, 60_000);
  }
}

function semanticJobOptions(data: SemanticJobData) {
  return {
    jobId: data.jobRunId,
    attempts: 2,
    backoff: { type: "exponential" as const, delay: 30_000 },
    removeOnComplete: { age: 24 * 60 * 60, count: 500 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 }
  };
}

function queueResponse(job: Job<SemanticJobData>) {
  return { queued: true, queueJobId: String(job.id), name: job.name };
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
