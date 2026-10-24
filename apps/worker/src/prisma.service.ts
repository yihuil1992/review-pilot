import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { PrismaClient } from "@review-pilot/db";

@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
