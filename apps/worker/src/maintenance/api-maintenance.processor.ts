import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma.service.js";

@Injectable()
export class ApiMaintenanceProcessor {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Cron("0 3 * * *")
  async cleanup() {
    const now = new Date();
    const operationCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const auditCutoff = new Date(now.getTime() - Number(process.env.API_AUDIT_RETENTION_DAYS ?? 180) * 24 * 60 * 60 * 1000);
    const webhookCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const idempotency = await this.prisma.apiIdempotencyRecord.deleteMany({ where: { expiresAt: { lt: now }, status: { not: "processing" } } });
    const operations = await this.prisma.apiOperation.deleteMany({ where: { createdAt: { lt: operationCutoff }, status: { in: ["succeeded", "failed", "canceled"] }, idempotencyRecord: null } });
    const deliveries = await this.prisma.webhookDelivery.deleteMany({ where: { createdAt: { lt: webhookCutoff }, status: { in: ["delivered", "failed"] } } });
    const audits = await this.prisma.apiAuditEvent.deleteMany({ where: { createdAt: { lt: auditCutoff } } });
    return { idempotency: idempotency.count, operations: operations.count, deliveries: deliveries.count, audits: audits.count };
  }
}
