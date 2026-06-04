import "./load-env.js";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
const host = process.env.HOSTNAME ?? "::";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? true,
    credentials: true
  });
  await app.listen(port, host);
}

void bootstrap();
