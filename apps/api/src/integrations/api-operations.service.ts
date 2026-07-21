import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import type { ApiPrincipal } from "./api-auth.types.js";

@Injectable()
export class ApiOperationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get(principal: ApiPrincipal, operationId: string) {
    const operation = await this.prisma.apiOperation.findUnique({ where: { id: operationId } });
    if (!operation || operation.apiClientId !== principal.clientId) {
      throw new NotFoundException("Operation not found");
    }
    if (operation.locationId && !principal.allLocations && !principal.locationIds.includes(operation.locationId)) {
      throw new ForbiddenException("Operation is outside this client's location grants");
    }
    return toOperationDto(operation);
  }
}

export function toOperationDto(operation: {
  id: string;
  type: string;
  status: string;
  resourceType: string | null;
  resourceId: string | null;
  result: unknown;
  error: unknown;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}) {
  return {
    id: operation.id,
    type: operation.type,
    status: operation.status,
    resourceType: operation.resourceType,
    resourceId: operation.resourceId,
    createdAt: operation.createdAt.toISOString(),
    startedAt: operation.startedAt?.toISOString() ?? null,
    finishedAt: operation.finishedAt?.toISOString() ?? null,
    result: operation.result ?? null,
    error: operation.error ?? null
  };
}
