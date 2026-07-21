import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ReviewSeverity, ReviewStatus } from "@review-pilot/db";
import { PrismaService } from "../prisma.service.js";
import type { ApiPrincipal } from "./api-auth.types.js";

const unhandledStatuses: ReviewStatus[] = ["new", "analysis_pending", "draft_ready", "regeneration_pending", "publishing", "deferred", "failed"];

@Injectable()
export class ExternalDataService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listReviews(principal: ApiPrincipal, query: {
    cursor?: string;
    limit: number;
    status: "unhandled" | "all";
    locationId?: string;
    severity?: "green" | "yellow" | "red";
    rating?: number;
    updatedSince?: string;
  }) {
    if (query.locationId) await this.assertLocation(principal, query.locationId);
    const cursor = decodeCursor(query.cursor);
    const locationWhere = authorizedLocationWhere(principal, query.locationId);
    const where: Prisma.ReviewWhereInput = {
      businessLocationId: locationWhere,
      ...(query.status === "all" ? {} : { status: { in: unhandledStatuses } }),
      ...(query.rating ? { rating: query.rating } : {}),
      ...(query.severity ? { analysis: { severity: query.severity as ReviewSeverity } } : {}),
      ...(query.updatedSince ? { updatedAt: { gte: new Date(query.updatedSince) } } : {}),
      ...(cursor ? cursorWhere(cursor) : {})
    };
    const reviews = await this.prisma.review.findMany({
      where,
      include: reviewIncludes(),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1
    });
    const hasMore = reviews.length > query.limit;
    const items = reviews.slice(0, query.limit);
    return { items: items.map(toExternalReview), nextCursor: hasMore ? encodeCursor(items.at(-1)!) : null };
  }

  async getReview(principal: ApiPrincipal, reviewId: string) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, businessLocationId: authorizedLocationWhere(principal) },
      include: reviewIncludes()
    });
    if (!review) throw new NotFoundException("Review not found");
    return toExternalReview(review);
  }

  async getReviewState(principal: ApiPrincipal, reviewId: string) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, businessLocationId: authorizedLocationWhere(principal) },
      select: { id: true, businessLocationId: true, updatedAt: true, drafts: { orderBy: { version: "desc" }, take: 1, select: { id: true, version: true, body: true } } }
    });
    if (!review) throw new NotFoundException("Review not found");
    return { ...review, draft: review.drafts[0] ?? null };
  }

  async listLocations(principal: ApiPrincipal) {
    const locations = await this.prisma.businessLocation.findMany({
      where: {
        id: authorizedLocationWhere(principal),
        OR: [{ googleOpenStatus: null }, { googleOpenStatus: { not: "CLOSED_PERMANENTLY" } }]
      },
      include: { googleAccount: { select: { id: true, email: true, status: true } } },
      orderBy: [{ enabled: "desc" }, { businessName: "asc" }]
    });
    return locations.map(toExternalLocation);
  }

  async getLocation(principal: ApiPrincipal, locationId: string) {
    await this.assertLocation(principal, locationId);
    const location = await this.prisma.businessLocation.findUnique({
      where: { id: locationId },
      include: { googleAccount: { select: { id: true, email: true, status: true } } }
    });
    if (!location) throw new NotFoundException("Location not found");
    return toExternalLocation(location);
  }

  async listAccounts(principal: ApiPrincipal) {
    const accounts = await this.prisma.googleAccount.findMany({
      where: principal.allLocations ? undefined : { businessLocations: { some: { id: { in: principal.locationIds } } } },
      select: { id: true, email: true, status: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" }
    });
    return accounts.map((account) => ({ ...account, createdAt: account.createdAt.toISOString(), updatedAt: account.updatedAt.toISOString() }));
  }

  async assertAccountAccess(principal: ApiPrincipal, accountId: string) {
    const account = await this.prisma.googleAccount.findFirst({
      where: {
        id: accountId,
        ...(principal.allLocations ? {} : { businessLocations: { some: { id: { in: principal.locationIds } } } })
      },
      select: { id: true }
    });
    if (!account) throw new NotFoundException("Google account not found");
  }

  async listNotificationTasks(principal: ApiPrincipal, query: {
    cursor?: string;
    limit: number;
    status?: string;
    locationId?: string;
    dueBefore?: string;
    updatedSince?: string;
  }) {
    if (query.locationId) await this.assertLocation(principal, query.locationId);
    const cursor = decodeCursor(query.cursor);
    const reviews = await this.prisma.review.findMany({
      where: {
        businessLocationId: authorizedLocationWhere(principal, query.locationId),
        ...(query.status ? { notificationStatus: query.status } : { notificationStatus: { not: "none" } }),
        ...(query.dueBefore ? { notifyAt: { lte: new Date(query.dueBefore) } } : {}),
        ...(query.updatedSince ? { updatedAt: { gte: new Date(query.updatedSince) } } : {}),
        ...(cursor ? cursorWhere(cursor) : {})
      },
      include: { businessLocation: { select: { id: true, businessName: true } }, analysis: { select: { severity: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1
    });
    const hasMore = reviews.length > query.limit;
    const items = reviews.slice(0, query.limit);
    return {
      items: items.map((review) => ({
        reviewId: review.id,
        locationId: review.businessLocation.id,
        business: review.businessLocation.businessName,
        author: review.authorName ?? "Customer",
        rating: review.rating,
        reviewStatus: review.status,
        notificationStatus: review.notificationStatus,
        notifyAt: review.notifyAt?.toISOString() ?? null,
        notificationSentAt: review.notificationSentAt?.toISOString() ?? null,
        notificationAttempts: review.notificationAttempts,
        notificationLastError: review.notificationLastError,
        severity: review.analysis?.severity ?? null,
        updatedAt: review.updatedAt.toISOString()
      })),
      nextCursor: hasMore ? encodeCursor(items.at(-1)!) : null
    };
  }

  async assertExpectedReviewUpdate(principal: ApiPrincipal, reviewId: string, expectedUpdatedAt?: string) {
    const state = await this.getReviewState(principal, reviewId);
    if (expectedUpdatedAt && state.updatedAt.toISOString() !== expectedUpdatedAt) {
      throw new ConflictException("Review changed after the supplied expectedUpdatedAt value");
    }
    return state;
  }

  private async assertLocation(principal: ApiPrincipal, locationId: string) {
    if (!principal.allLocations && !principal.locationIds.includes(locationId)) {
      throw new ForbiddenException("Location is outside this API client's grants");
    }
  }
}

function authorizedLocationWhere(principal: ApiPrincipal, requested?: string): Prisma.StringFilter | string {
  if (requested) return requested;
  return principal.allLocations ? {} : { in: principal.locationIds };
}

function reviewIncludes() {
  return {
    businessLocation: { include: { googleAccount: { select: { id: true, email: true } } } },
    analysis: true,
    drafts: { orderBy: { version: "desc" as const }, take: 1 },
    jobs: {
      where: { type: { in: ["semantic.generateReply", "semantic.regenerateReply"] } },
      orderBy: { createdAt: "desc" as const },
      take: 1,
      select: { id: true, type: true, status: true, errorCode: true, errorMessage: true, startedAt: true, finishedAt: true }
    },
    actions: { orderBy: { createdAt: "desc" as const }, take: 20, select: { id: true, type: true, createdAt: true } }
  };
}

type ExternalReviewPayload = Prisma.ReviewGetPayload<{ include: ReturnType<typeof reviewIncludes> }>;

function toExternalReview(review: ExternalReviewPayload) {
  const draft = review.drafts[0] ?? null;
  const job = review.jobs[0] ?? null;
  return {
    id: review.id,
    googleReviewId: review.googleReviewId,
    location: {
      id: review.businessLocation.id,
      businessName: review.businessLocation.businessName,
      googleAccountId: review.businessLocation.googleAccount.id,
      googleAccountEmail: review.businessLocation.googleAccount.email
    },
    googleMapsUrl: buildGoogleMapsUrl(review.businessLocation.placeId, review.businessLocation.businessName),
    author: review.authorName ?? "Customer",
    rating: review.rating,
    text: review.reviewText ?? "",
    reviewCreatedAt: review.reviewCreatedAt?.toISOString() ?? null,
    status: review.status,
    analysis: review.analysis ? {
      severity: review.analysis.severity,
      priority: review.analysis.priority,
      issues: review.analysis.issues,
      positives: review.analysis.positives,
      keywords: review.analysis.keywords,
      publishRisk: review.analysis.publishRisk,
      reasoning: review.analysis.reasoning
    } : null,
    draft: draft ? {
      id: draft.id,
      body: draft.body,
      version: draft.version,
      instruction: draft.instruction,
      userEdited: draft.userEdited,
      editedAt: draft.editedAt?.toISOString() ?? null,
      createdAt: draft.createdAt.toISOString()
    } : null,
    operationSummary: job ? {
      jobRunId: job.id,
      type: job.type,
      status: job.status,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null
    } : null,
    actions: review.actions.map((action) => ({ id: action.id, type: action.type, createdAt: action.createdAt.toISOString() })),
    publishedReply: review.publishedReply,
    replyPublishedAt: review.replyPublishedAt?.toISOString() ?? null,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString()
  };
}

function toExternalLocation(location: {
  id: string;
  businessName: string;
  address: string | null;
  googleOpenStatus: string | null;
  notificationPhoneNumber: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  googleAccount: { id: string; email: string; status: string };
}) {
  return {
    id: location.id,
    businessName: location.businessName,
    address: location.address,
    googleOpenStatus: location.googleOpenStatus,
    notificationPhoneNumber: location.notificationPhoneNumber,
    enabled: location.enabled,
    googleAccount: location.googleAccount,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString()
  };
}

function cursorWhere(cursor: { createdAt: Date; id: string }): Prisma.ReviewWhereInput {
  return { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] };
}

function encodeCursor(value: { createdAt: Date; id: string }) {
  return Buffer.from(JSON.stringify({ createdAt: value.createdAt.toISOString(), id: value.id })).toString("base64url");
}

function decodeCursor(value?: string): { createdAt: Date; id: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { createdAt?: string; id?: string };
    const createdAt = new Date(parsed.createdAt ?? "");
    if (!parsed.id || Number.isNaN(createdAt.getTime())) throw new Error();
    return { createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException("Invalid pagination cursor");
  }
}

function buildGoogleMapsUrl(placeId: string | null, businessName: string) {
  if (!placeId) return null;
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", businessName);
  url.searchParams.set("query_place_id", placeId);
  return url.toString();
}
