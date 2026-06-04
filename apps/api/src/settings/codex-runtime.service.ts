import { Inject, Injectable } from "@nestjs/common";
import { SemanticQueueService } from "../semantic/semantic-queue.service.js";

@Injectable()
export class CodexRuntimeService {
  constructor(@Inject(SemanticQueueService) private readonly queue: SemanticQueueService) {}

  testRuntime() {
    return this.queue.testRuntime();
  }

  startDeviceLogin() {
    return this.queue.startDeviceLogin();
  }

  getDeviceLoginStatus() {
    return this.queue.getDeviceLoginStatus();
  }
}
