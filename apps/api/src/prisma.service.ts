import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@review-pilot/db";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
