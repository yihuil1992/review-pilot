import { Inject, Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Prisma } from "@review-pilot/db";
import { PrismaService } from "../prisma.service.js";
import { CryptoService } from "../security/crypto.service.js";
import { SettingsService } from "../settings/settings.service.js";

const reviewSyncStatusKey = "reviewSyncStatus";
const reviewSyncIntervalMs = 60 * 60 * 1000;

type ReviewSyncStatus = {
  enabled: boolean;
  enabledAt: string | null;
  intervalMinutes: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  nextRunAt: string | null;
  syncWindowStartAt: string | null;
  syncWindowEndAt: string | null;
  status: "idle" | "running" | "succeeded" | "failed" | "disabled";
  locationsScanned: number;
  reviewsSeen: number;
  created: number;
  updated: number;
  error: string | null;
};

@Injectable()
export class GoogleReviewSyncService {
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(SettingsService) private readonly settings: SettingsService
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async syncOnSchedule() {
    if (process.env.REVIEW_SYNC_SCHEDULER_ENABLED === "false") {
      await this.writeStatus({
        ...emptyStatus("disabled"),
        enabled: false,
        nextRunAt: null
      });
      return;
    }

    await this.syncAll("schedule");
  }

  async syncAll(source: string) {
    if (this.running) {
      return;
    }

    this.running = true;
    const startedAt = new Date();
    const nextRunAt = new Date(startedAt.getTime() + reviewSyncIntervalMs);
    const previousStatus = await this.readStatus();
    const enabledAt = resolveEnabledAt(previousStatus, startedAt);
    const syncWindow = {
      start: previousStatus?.lastFinishedAt ? new Date(previousStatus.lastFinishedAt) : enabledAt,
      end: startedAt
    };
    const status = {
      ...emptyStatus("running"),
      enabled: process.env.REVIEW_SYNC_SCHEDULER_ENABLED !== "false",
      enabledAt: enabledAt.toISOString(),
      lastStartedAt: startedAt.toISOString(),
      nextRunAt: nextRunAt.toISOString(),
      syncWindowStartAt: syncWindow.start.toISOString(),
      syncWindowEndAt: syncWindow.end.toISOString()
    } satisfies ReviewSyncStatus;
    await this.writeStatus(status);

    try {
      const locations = await this.prisma.businessLocation.findMany({
        where: {
          enabled: true,
          OR: [{ googleOpenStatus: null }, { googleOpenStatus: { not: "CLOSED_PERMANENTLY" } }]
        },
        include: { googleAccount: true },
        orderBy: { businessName: "asc" }
      });

      let reviewsSeen = 0;
      let created = 0;
      let updated = 0;

      for (const location of locations) {
        const result = await this.syncLocation(location, syncWindow);
        reviewsSeen += result.reviewsSeen;
        created += result.created;
        updated += result.updated;
      }

      await this.writeStatus({
        enabled: true,
        enabledAt: enabledAt.toISOString(),
        intervalMinutes: 60,
        lastStartedAt: startedAt.toISOString(),
        lastFinishedAt: new Date().toISOString(),
        nextRunAt: nextRunAt.toISOString(),
        syncWindowStartAt: syncWindow.start.toISOString(),
        syncWindowEndAt: syncWindow.end.toISOString(),
        status: "succeeded",
        locationsScanned: locations.length,
        reviewsSeen,
        created,
        updated,
        error: null
      });

      return { ok: true, source, locationsScanned: locations.length, reviewsSeen, created, updated };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Review sync failed";
      await this.writeStatus({
        ...status,
        lastFinishedAt: new Date().toISOString(),
        status: "failed",
        error: message
      });
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async syncLocation(location: LocationWithAccount, syncWindow: { start: Date; end: Date }) {
    const token = await this.getAccessToken(location.googleAccountId);
    const reviewCollectionName = buildReviewCollectionName(location);
    let pageToken: string | undefined;
    let reviewsSeen = 0;
    let created = 0;
    let updated = 0;

    do {
      const url = new URL(`https://mybusiness.googleapis.com/v4/${reviewCollectionName}/reviews`);
      url.searchParams.set("pageSize", "50");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await googleFetch<GoogleReviewsResponse>(url.toString(), token);
      for (const review of response.reviews ?? []) {
        if (!isReviewInSyncWindow(review, syncWindow)) {
          continue;
        }

        reviewsSeen += 1;
        const googleReviewId = review.reviewId ?? review.name.split("/").pop() ?? review.name;
        const existing = await this.prisma.review.findUnique({
          where: {
            businessLocationId_googleReviewId: {
              businessLocationId: location.id,
              googleReviewId
            }
          },
          select: { id: true }
        });

        if (existing) {
          await this.prisma.review.update({
            where: { id: existing.id },
            data: reviewUpdateData(review)
          });
          updated += 1;
        } else {
          await this.prisma.review.create({
            data: reviewCreateData(location.id, googleReviewId, review)
          });
          created += 1;
        }
      }
      pageToken = response.nextPageToken;
    } while (pageToken);

    return { reviewsSeen, created, updated };
  }

  private async getAccessToken(googleAccountId: string): Promise<string> {
    const account = await this.prisma.googleAccount.findUnique({ where: { id: googleAccountId } });
    if (!account) {
      throw new Error("Google account not found");
    }

    if (account.accessTokenEncrypted && account.tokenExpiresAt && account.tokenExpiresAt.getTime() > Date.now() + 60_000) {
      return this.crypto.decryptSecret(account.accessTokenEncrypted);
    }

    const secret = await this.prisma.secretValue.findUnique({ where: { id: account.refreshTokenSecretId } });
    if (!secret) {
      throw new Error("Google refresh token is missing");
    }

    const oauth = await this.settings.getGoogleOAuthSettings();
    const refreshed = await postForm<GoogleTokenResponse>("https://oauth2.googleapis.com/token", {
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      refresh_token: this.crypto.decryptSecret(secret.ciphertext),
      grant_type: "refresh_token"
    });

    await this.prisma.googleAccount.update({
      where: { id: googleAccountId },
      data: {
        accessTokenEncrypted: this.crypto.encryptSecret(refreshed.access_token),
        tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000)
      }
    });

    return refreshed.access_token;
  }

  private async writeStatus(status: ReviewSyncStatus) {
    await this.prisma.appSetting.upsert({
      where: { key: reviewSyncStatusKey },
      create: { key: reviewSyncStatusKey, value: status as unknown as Prisma.InputJsonValue },
      update: { value: status as unknown as Prisma.InputJsonValue }
    });
  }

  private async readStatus(): Promise<ReviewSyncStatus | null> {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: reviewSyncStatusKey } });
    if (!setting?.value || typeof setting.value !== "object" || Array.isArray(setting.value)) {
      return null;
    }
    return setting.value as unknown as ReviewSyncStatus;
  }
}

function emptyStatus(status: ReviewSyncStatus["status"]): ReviewSyncStatus {
  return {
    enabled: process.env.REVIEW_SYNC_SCHEDULER_ENABLED !== "false",
    enabledAt: null,
    intervalMinutes: 60,
    lastStartedAt: null,
    lastFinishedAt: null,
    nextRunAt: null,
    syncWindowStartAt: null,
    syncWindowEndAt: null,
    status,
    locationsScanned: 0,
    reviewsSeen: 0,
    created: 0,
    updated: 0,
    error: null
  };
}

function resolveEnabledAt(previousStatus: ReviewSyncStatus | null, fallback: Date): Date {
  if (previousStatus?.enabled !== false) {
    return parseDate(previousStatus?.enabledAt) ?? parseDate(previousStatus?.lastStartedAt) ?? fallback;
  }
  return fallback;
}

function isReviewInSyncWindow(review: GoogleReview, syncWindow: { start: Date; end: Date }): boolean {
  const reviewTime = parseDate(review.updateTime)
    ?? parseDate(review.reviewReply?.updateTime)
    ?? parseDate(review.createTime);
  if (!reviewTime) {
    return false;
  }
  return reviewTime.getTime() >= syncWindow.start.getTime() && reviewTime.getTime() <= syncWindow.end.getTime();
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function reviewUpdateData(review: GoogleReview) {
  return {
    authorName: review.reviewer?.displayName ?? null,
    rating: starRatingToNumber(review.starRating),
    reviewText: review.comment ?? null,
    reviewCreatedAt: review.createTime ? new Date(review.createTime) : null,
    publishedReply: review.reviewReply?.comment ?? null,
    replyPublishedAt: review.reviewReply?.updateTime ? new Date(review.reviewReply.updateTime) : null
  };
}

function reviewCreateData(businessLocationId: string, googleReviewId: string, review: GoogleReview) {
  return {
    ...reviewUpdateData(review),
    businessLocationId,
    googleReviewId,
    status: review.reviewReply?.comment ? "published" as const : "new" as const
  };
}

function buildReviewCollectionName(location: { googleAccountName: string | null; googleLocationName: string }) {
  if (!location.googleAccountName) {
    throw new Error("Google account name is missing for this location. Discover locations again.");
  }
  return `${location.googleAccountName}/${location.googleLocationName}`;
}

function starRatingToNumber(rating: string | undefined): number {
  const map: Record<string, number> = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5
  };
  return rating ? map[rating] ?? 0 : 0;
}

async function postForm<T>(url: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body)
  });
  return parseExternalResponse<T>(response, "Google request failed");
}

async function googleFetch<T>(url: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  return parseExternalResponse<T>(response, "Google request failed");
}

async function parseExternalResponse<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.error_description ?? data?.error?.message ?? fallback);
  }
  return data as T;
}

type LocationWithAccount = Prisma.BusinessLocationGetPayload<{ include: { googleAccount: true } }>;

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
};

type GoogleReviewsResponse = {
  reviews?: GoogleReview[];
  nextPageToken?: string;
};

type GoogleReview = {
  name: string;
  reviewId?: string;
  reviewer?: { displayName?: string };
  starRating?: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: {
    comment?: string;
    updateTime?: string;
  };
};
