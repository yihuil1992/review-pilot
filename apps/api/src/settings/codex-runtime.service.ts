import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { CodexModelCatalogSchema } from "@review-pilot/shared";
import { SemanticQueueService } from "../semantic/semantic-queue.service.js";

@Injectable()
export class CodexRuntimeService {
  constructor(@Inject(SemanticQueueService) private readonly queue: SemanticQueueService) {}

  testRuntime() {
    return this.queue.testRuntime();
  }

  async listModels() {
    try {
      return CodexModelCatalogSchema.parse(await this.queue.listModels());
    } catch {
      throw new ServiceUnavailableException("Could not load models from the worker. Check Codex login and try again.");
    }
  }

  startDeviceLogin() {
    return this.queue.startDeviceLogin();
  }

  getDeviceLoginStatus() {
    return this.queue.getDeviceLoginStatus();
  }
}
