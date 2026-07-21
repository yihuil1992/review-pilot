import "./load-env.js";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { json } from "express";
import { AppModule } from "./app.module.js";
import { apiRequestContext } from "./integrations/api-request-context.middleware.js";

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
const host = process.env.HOSTNAME ?? "::";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: process.env.API_BODY_LIMIT ?? "256kb" }));
  app.use(apiRequestContext);
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    app.getHttpAdapter().getInstance().set("trust proxy", trustProxy === "true" ? 1 : trustProxy);
  }
  app.setGlobalPrefix("api");
  const allowedOrigins = (process.env.WEB_ORIGIN ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:3217"))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS origin is not allowed"), false);
    },
    credentials: true
  });
  await app.listen(port, host);
}

void bootstrap();
