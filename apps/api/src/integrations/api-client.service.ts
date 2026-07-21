import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { ApiClientEnvironment, ApiScope } from "@review-pilot/shared";
import { apiScopes } from "@review-pilot/shared";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma.service.js";
import type { ApiPrincipal } from "./api-auth.types.js";

type CreateClientInput = {
  name: string;
  environment: ApiClientEnvironment;
  scopes: ApiScope[];
  allLocations: boolean;
  locationIds: string[];
  expiresAt?: string;
};

@Injectable()
export class ApiClientService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async authenticate(token: string | undefined): Promise<ApiPrincipal> {
    if (!token) {
      throw new UnauthorizedException("API bearer token required");
    }
    const parsed = parseApiKey(token);
    if (!parsed) {
      throw new UnauthorizedException("Invalid API bearer token");
    }
    const credential = await this.prisma.apiCredential.findUnique({
      where: { keyPrefix: parsed.keyPrefix },
      include: { apiClient: { include: { locationGrants: true } } }
    });
    const now = new Date();
    if (
      !credential ||
      credential.revokedAt ||
      credential.apiClient.revokedAt ||
      (credential.expiresAt && credential.expiresAt <= now) ||
      !safeHashEqual(hashToken(token), credential.secretHash)
    ) {
      throw new UnauthorizedException("Invalid or inactive API bearer token");
    }

    const deploymentEnvironment = currentEnvironment();
    if (credential.apiClient.environment !== deploymentEnvironment) {
      throw new UnauthorizedException("API credential environment does not match this deployment");
    }

    if (!credential.lastUsedAt || now.getTime() - credential.lastUsedAt.getTime() > 15 * 60_000) {
      await this.prisma.apiCredential.update({ where: { id: credential.id }, data: { lastUsedAt: now } });
    }

    return {
      clientId: credential.apiClient.id,
      credentialId: credential.id,
      credentialPrefix: credential.keyPrefix,
      environment: credential.apiClient.environment,
      scopes: credential.apiClient.scopes.filter((scope): scope is ApiScope => apiScopes.includes(scope as ApiScope)),
      allLocations: credential.apiClient.allLocations,
      locationIds: credential.apiClient.locationGrants.map((grant) => grant.locationId)
    };
  }

  async listClients() {
    const clients = await this.prisma.apiClient.findMany({
      include: { credentials: { orderBy: { createdAt: "desc" } }, locationGrants: true, webhookEndpoints: true },
      orderBy: { createdAt: "desc" }
    });
    return clients.map(toClientDto);
  }

  async createClient(input: CreateClientInput) {
    assertEnvironmentMatches(input.environment);
    const scopes = uniqueScopes(input.scopes);
    const locationIds = [...new Set(input.locationIds)];
    if (!input.allLocations) {
      await this.assertLocationsExist(locationIds);
    }
    const key = createApiKey(input.environment);
    const client = await this.prisma.$transaction(async (tx) => {
      const created = await tx.apiClient.create({
        data: {
          name: input.name,
          environment: input.environment,
          scopes,
          allLocations: input.allLocations,
          locationGrants: input.allLocations ? undefined : { create: locationIds.map((locationId) => ({ locationId })) },
          credentials: {
            create: {
              keyPrefix: key.keyPrefix,
              secretHash: hashToken(key.plaintext),
              expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
            }
          }
        },
        include: { credentials: true, locationGrants: true, webhookEndpoints: true }
      });
      await tx.apiAuditEvent.create({ data: { requestId: randomUUID(), action: "integration.client.create", targetType: "api-client", targetId: created.id, result: "succeeded", metadata: { keyPrefix: key.keyPrefix } } });
      return created;
    });
    return { client: toClientDto(client), apiKey: key.plaintext };
  }

  async rotateClient(clientId: string, expiresAt?: string) {
    const client = await this.prisma.apiClient.findUnique({ where: { id: clientId } });
    if (!client || client.revokedAt) {
      throw new ConflictException("API client is not active");
    }
    assertEnvironmentMatches(client.environment);
    const key = createApiKey(client.environment);
    const credential = await this.prisma.$transaction(async (tx) => {
      const created = await tx.apiCredential.create({
        data: { apiClientId: client.id, keyPrefix: key.keyPrefix, secretHash: hashToken(key.plaintext), expiresAt: expiresAt ? new Date(expiresAt) : null }
      });
      await tx.apiAuditEvent.create({ data: { apiClientId: client.id, apiCredentialId: created.id, requestId: randomUUID(), action: "integration.credential.rotate", targetType: "api-client", targetId: client.id, result: "succeeded", metadata: { keyPrefix: key.keyPrefix } } });
      return created;
    });
    return { credential: toCredentialDto(credential), apiKey: key.plaintext };
  }

  async revokeClient(clientId: string) {
    const now = new Date();
    const client = await this.prisma.$transaction(async (tx) => {
      await tx.apiCredential.updateMany({ where: { apiClientId: clientId, revokedAt: null }, data: { revokedAt: now } });
      const revoked = await tx.apiClient.update({ where: { id: clientId }, data: { revokedAt: now } });
      await tx.apiAuditEvent.create({ data: { apiClientId: clientId, requestId: randomUUID(), action: "integration.client.revoke", targetType: "api-client", targetId: clientId, result: "succeeded" } });
      return revoked;
    });
    return { id: client.id, revokedAt: client.revokedAt?.toISOString() ?? now.toISOString() };
  }

  async revokeCredential(credentialId: string) {
    const credential = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.apiCredential.update({ where: { id: credentialId }, data: { revokedAt: new Date() } });
      await tx.apiAuditEvent.create({ data: { apiClientId: revoked.apiClientId, apiCredentialId: revoked.id, requestId: randomUUID(), action: "integration.credential.revoke", targetType: "api-credential", targetId: revoked.id, result: "succeeded", metadata: { keyPrefix: revoked.keyPrefix } } });
      return revoked;
    });
    return toCredentialDto(credential);
  }

  async assertLocationAccess(principal: ApiPrincipal, locationId: string) {
    if (!principal.allLocations && !principal.locationIds.includes(locationId)) {
      throw new UnauthorizedException("API client is not authorized for this location");
    }
  }

  async assertReviewAccess(principal: ApiPrincipal, reviewId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }, select: { businessLocationId: true } });
    if (!review) {
      throw new UnauthorizedException("Review is unavailable to this API client");
    }
    await this.assertLocationAccess(principal, review.businessLocationId);
    return review.businessLocationId;
  }

  private async assertLocationsExist(locationIds: string[]) {
    if (!locationIds.length) {
      return;
    }
    const count = await this.prisma.businessLocation.count({ where: { id: { in: [...new Set(locationIds)] } } });
    if (count !== new Set(locationIds).size) {
      throw new ConflictException("One or more location grants do not exist");
    }
  }
}

export function currentEnvironment(): ApiClientEnvironment {
  if (!process.env.REVIEW_PILOT_ENV && process.env.NODE_ENV === "production") {
    throw new Error("REVIEW_PILOT_ENV is required in production");
  }
  const value = process.env.REVIEW_PILOT_ENV ?? "test";
  if (value !== "test" && value !== "live") {
    throw new Error("REVIEW_PILOT_ENV must be test or live");
  }
  return value;
}

function assertEnvironmentMatches(environment: ApiClientEnvironment) {
  if (environment !== currentEnvironment()) {
    throw new ConflictException(`Create ${environment} credentials on a ${environment} deployment`);
  }
}

export function createApiKey(environment: ApiClientEnvironment) {
  const publicId = randomBytes(9).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const keyPrefix = `rp_${environment}_${publicId}`;
  return { keyPrefix, plaintext: `${keyPrefix}.${secret}` };
}

export function parseApiKey(token: string) {
  const match = /^(rp_(?:test|live)_[a-f0-9]{18})\.([A-Za-z0-9_-]{32,})$/.exec(token);
  return match ? { keyPrefix: match[1]!, secret: match[2]! } : null;
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function safeHashEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function uniqueScopes(scopes: ApiScope[]) {
  return [...new Set(scopes)];
}

function toCredentialDto(credential: { id: string; keyPrefix: string; expiresAt: Date | null; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date }) {
  return {
    id: credential.id,
    keyPrefix: credential.keyPrefix,
    expiresAt: credential.expiresAt?.toISOString() ?? null,
    lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
    revokedAt: credential.revokedAt?.toISOString() ?? null,
    createdAt: credential.createdAt.toISOString()
  };
}

function toClientDto(client: {
  id: string;
  name: string;
  environment: ApiClientEnvironment;
  scopes: string[];
  allLocations: boolean;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  credentials: Array<{ id: string; keyPrefix: string; expiresAt: Date | null; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date }>;
  locationGrants: Array<{ locationId: string }>;
  webhookEndpoints: Array<{ id: string }>;
}) {
  return {
    id: client.id,
    name: client.name,
    environment: client.environment,
    scopes: client.scopes,
    allLocations: client.allLocations,
    locationIds: client.locationGrants.map((grant) => grant.locationId),
    revokedAt: client.revokedAt?.toISOString() ?? null,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
    credentials: client.credentials.map(toCredentialDto),
    webhookEndpointCount: client.webhookEndpoints.length
  };
}
