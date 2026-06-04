import "./load-env.js";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module.js";

async function bootstrap() {
  await NestFactory.createApplicationContext(WorkerModule);
  console.log("review-pilot-worker ready");
}

void bootstrap();
