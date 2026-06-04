import { BadGatewayException, BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@review-pilot/db";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma.service.js";
import { CryptoService } from "../security/crypto.service.js";
import { SettingsService } from "../settings/settings.service.js";

const googleOAuthStateTtlMs = 10 * 60 * 1000;
const businessManageScope = "https://www.googleapis.com/auth/business.manage";

@Injectable()
export class GoogleService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(SettingsService) private readonly settings: SettingsService
  ) {}

  async createConnectUrl(input: { redirectUri?: string; returnTo?: string } = {}): Promise<{ url: string; redirectUri: string; expiresAt: string }> {
    const [{ clientId }, publicBaseUrl] = await Promise.all([
      this.settings.getGoogleOAuthSettings(),
      this.settings.getPublicBaseUrl()
    ]);
    const redirectUri = input.redirectUri ?? `${publicBaseUrl}/api/google/oauth/callback`;
    const returnTo = input.returnTo ?? `${publicBaseUrl}/settings?google=connected`;
    const state = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + googleOAuthStateTtlMs);

    await this.prisma.appSetting.upsert({
      where: { key: `googleOAuthState:${state}` },
      create: { key: `googleOAuthState:${state}`, value: { redirectUri, returnTo, expiresAt: expiresAt.toISOString() } },
      update: { value: { redirectUri, returnTo, expiresAt: expiresAt.toISOString() } }
    });

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", ["openid", "email", "profile", businessManageScope].join(" "));

    return { url: url.toString(), redirectUri, expiresAt: expiresAt.toISOString() };
  }

  async completeOAuth(code: string, state: string): Promise<{ accountId: string; email: string; returnTo: string | null }> {
    const stateKey = `googleOAuthState:${state}`;
    const savedState = await this.prisma.appSetting.findUnique({ where: { key: stateKey } });
    await this.prisma.appSetting.deleteMany({ where: { key: stateKey } });
    if (!savedState?.value || typeof savedState.value !== "object" || Array.isArray(savedState.value)) {
      throw new Error("Google OAuth state is invalid or expired");
    }

    const stateValue = savedState.value as { redirectUri?: string; returnTo?: string; expiresAt?: string };
    if (!stateValue.redirectUri || !stateValue.expiresAt || Date.parse(stateValue.expiresAt) < Date.now()) {
      throw new Error("Google OAuth state is invalid or expired");
    }

    const oauth = await this.settings.getGoogleOAuthSettings();
    const token = await postForm<GoogleTokenResponse>("https://oauth2.googleapis.com/token", {
      code,
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      redirect_uri: stateValue.redirectUri,
      grant_type: "authorization_code"
    });

    if (!token.refresh_token) {
      throw new Error("Google did not return a refresh token. Reconnect with prompt=consent or revoke the old grant first.");
    }

    const user = await googleFetch<GoogleUserInfo>("https://openidconnect.googleapis.com/v1/userinfo", token.access_token);
    const refreshTokenSecret = await this.prisma.secretValue.upsert({
      where: { scope_key: { scope: "googleRefreshToken", key: user.sub } },
      create: {
        scope: "googleRefreshToken",
        key: user.sub,
        ciphertext: this.crypto.encryptSecret(token.refresh_token)
      },
      update: {
        ciphertext: this.crypto.encryptSecret(token.refresh_token)
      }
    });

    const account = await this.prisma.googleAccount.upsert({
      where: { googleUserId: user.sub },
      create: {
        googleUserId: user.sub,
        email: user.email,
        refreshTokenSecretId: refreshTokenSecret.id,
        accessTokenEncrypted: this.crypto.encryptSecret(token.access_token),
        tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000)
      },
      update: {
        email: user.email,
        refreshTokenSecretId: refreshTokenSecret.id,
        accessTokenEncrypted: this.crypto.encryptSecret(token.access_token),
        tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
        status: "active"
      }
    });

    return { accountId: account.id, email: account.email, returnTo: stateValue.returnTo ?? null };
  }

  async listAccounts() {
    return this.prisma.googleAccount.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, status: true, createdAt: true, updatedAt: true }
    });
  }

  async discoverLocations(googleAccountId: string) {
    const token = await this.getAccessToken(googleAccountId);
    const accounts = await this.listGoogleAccounts(token);
    const locations = [];

    for (const account of accounts) {
      for (const location of await this.listGoogleLocations(account.name, token)) {
        const address = formatAddress(location.storefrontAddress);
        const openStatus = location.openInfo?.status ?? null;
        const locationIdentity = {
          googleAccountId,
          googleLocationName: location.name
        };

        if (openStatus === "CLOSED_PERMANENTLY") {
          await this.prisma.businessLocation.updateMany({
            where: locationIdentity,
            data: {
              googleAccountName: account.name,
              placeId: location.metadata?.placeId ?? null,
              businessName: location.title ?? location.name,
              address,
              googleOpenStatus: openStatus,
              enabled: false
            }
          });
          continue;
        }

        const saved = await this.prisma.businessLocation.upsert({
          where: {
            googleAccountId_googleLocationName: locationIdentity
          },
          create: {
            googleAccountId,
            googleLocationName: location.name,
            googleAccountName: account.name,
            placeId: location.metadata?.placeId ?? null,
            businessName: location.title ?? location.name,
            address,
            googleOpenStatus: openStatus
          },
          update: {
            googleAccountName: account.name,
            placeId: location.metadata?.placeId ?? null,
            businessName: location.title ?? location.name,
            address,
            googleOpenStatus: openStatus
          }
        });
        locations.push(saved);
      }
    }

    return { locations };
  }

  private async listGoogleAccounts(token: string): Promise<NonNullable<GoogleAccountsResponse["accounts"]>> {
    const accounts = [];
    let pageToken: string | undefined;

    do {
      const url = new URL("https://mybusinessaccountmanagement.googleapis.com/v1/accounts");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await googleFetch<GoogleAccountsResponse>(url.toString(), token);
      accounts.push(...(response.accounts ?? []));
      pageToken = response.nextPageToken;
    } while (pageToken);

    return accounts;
  }

  private async listGoogleLocations(accountName: string, token: string): Promise<NonNullable<GoogleLocationsResponse["locations"]>> {
    const locations = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`);
      url.searchParams.set("readMask", "name,title,storefrontAddress,metadata,openInfo");
      url.searchParams.set("pageSize", "100");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await googleFetch<GoogleLocationsResponse>(url.toString(), token);
      locations.push(...(response.locations ?? []));
      pageToken = response.nextPageToken;
    } while (pageToken);

    return locations;
  }

  async listLocations() {
    return this.prisma.businessLocation.findMany({
      where: {
        OR: [{ googleOpenStatus: null }, { googleOpenStatus: { not: "CLOSED_PERMANENTLY" } }]
      },
      include: { googleAccount: { select: { email: true } } },
      orderBy: [{ enabled: "desc" }, { businessName: "asc" }]
    });
  }

  async setLocationEnabled(locationId: string, enabled: boolean) {
    const location = await this.prisma.businessLocation.findUnique({ where: { id: locationId } });
    if (!location) {
      throw new Error("Business location not found");
    }
    if (location.googleOpenStatus === "CLOSED_PERMANENTLY" && enabled) {
      throw new BadRequestException("Permanently closed locations cannot be enabled");
    }

    return this.prisma.businessLocation.update({
      where: { id: locationId },
      data: { enabled },
      include: { googleAccount: { select: { email: true } } }
    });
  }

  async syncReviews(locationId: string) {
    const location = await this.prisma.businessLocation.findUnique({
      where: { id: locationId },
      include: { googleAccount: true }
    });
    if (!location) {
      throw new Error("Business location not found");
    }
    if (!location.enabled) {
      throw new BadRequestException("Business location is disabled");
    }

    const token = await this.getAccessToken(location.googleAccountId);
    let pageToken: string | undefined;
    let imported = 0;

    const reviewCollectionName = buildReviewCollectionName(location);

    do {
      const url = new URL(`https://mybusiness.googleapis.com/v4/${reviewCollectionName}/reviews`);
      url.searchParams.set("pageSize", "50");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }
      const response = await googleFetch<GoogleReviewsResponse>(url.toString(), token);
      for (const review of response.reviews ?? []) {
        const googleReviewId = review.reviewId ?? review.name.split("/").pop() ?? review.name;
        const existing = await this.prisma.review.upsert({
          where: {
            businessLocationId_googleReviewId: {
              businessLocationId: location.id,
              googleReviewId
            }
          },
          create: {
            businessLocationId: location.id,
            googleReviewId,
            authorName: review.reviewer?.displayName ?? null,
            rating: starRatingToNumber(review.starRating),
            reviewText: review.comment ?? null,
            reviewCreatedAt: review.createTime ? new Date(review.createTime) : null,
            status: review.reviewReply?.comment ? "published" : "new",
            publishedReply: review.reviewReply?.comment ?? null,
            replyPublishedAt: review.reviewReply?.updateTime ? new Date(review.reviewReply.updateTime) : null
          },
          update: {
            authorName: review.reviewer?.displayName ?? null,
            rating: starRatingToNumber(review.starRating),
            reviewText: review.comment ?? null,
            reviewCreatedAt: review.createTime ? new Date(review.createTime) : null,
            publishedReply: review.reviewReply?.comment ?? undefined,
            replyPublishedAt: review.reviewReply?.updateTime ? new Date(review.reviewReply.updateTime) : undefined
          }
        });
        imported += existing ? 1 : 0;
      }
      pageToken = response.nextPageToken;
    } while (pageToken);

    return { imported };
  }

  async publishReply(reviewId: string, body: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: { businessLocation: true }
    });
    if (!review) {
      throw new Error("Review not found");
    }

    const token = await this.getAccessToken(review.businessLocation.googleAccountId);
    const googleReviewName = `${buildReviewCollectionName(review.businessLocation)}/reviews/${review.googleReviewId}`;
    await googleFetch(`https://mybusiness.googleapis.com/v4/${googleReviewName}/reply`, token, {
      method: "PUT",
      body: JSON.stringify({ comment: body })
    });
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
    throw new BadGatewayException({
      message: data?.error_description ?? data?.error?.message ?? fallback,
      status: response.status
    });
  }
  return data as T;
}

function starRatingToNumber(starRating: string | undefined): number {
  return ({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 } as Record<string, number>)[starRating ?? ""] ?? 5;
}

function buildReviewCollectionName(location: { googleAccountName: string | null; googleLocationName: string }): string {
  const embeddedAccountName = extractAccountName(location.googleLocationName);
  const accountName = location.googleAccountName ?? embeddedAccountName;
  const locationId = extractResourceId(location.googleLocationName);

  if (!accountName || !locationId) {
    throw new Error("Google account and location resource names are required for review sync/publish");
  }

  return `${normalizeAccountName(accountName)}/locations/${locationId}`;
}

function normalizeAccountName(accountName: string): string {
  if (accountName.startsWith("accounts/")) {
    return accountName;
  }
  return `accounts/${accountName}`;
}

function extractAccountName(resourceName: string): string | null {
  const parts = resourceName.split("/");
  const accountIndex = parts.indexOf("accounts");
  if (accountIndex === -1 || !parts[accountIndex + 1]) {
    return null;
  }
  return `accounts/${parts[accountIndex + 1]}`;
}

function extractResourceId(resourceName: string): string | null {
  const parts = resourceName.split("/").filter(Boolean);
  return parts.at(-1) ?? null;
}

function formatAddress(address: GooglePostalAddress | undefined): string | null {
  if (!address) {
    return null;
  }

  return [
    ...(address.addressLines ?? []),
    [address.locality, address.administrativeArea, address.postalCode].filter(Boolean).join(" "),
    address.regionCode
  ].filter(Boolean).join(", ");
}

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
};

type GoogleAccountsResponse = {
  accounts?: Array<{ name: string; accountName?: string }>;
  nextPageToken?: string;
};

type GoogleLocationsResponse = {
  locations?: Array<{
    name: string;
    title?: string;
    storefrontAddress?: GooglePostalAddress;
    metadata?: { placeId?: string };
    openInfo?: { status?: string };
  }>;
  nextPageToken?: string;
};

type GooglePostalAddress = {
  regionCode?: string;
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  addressLines?: string[];
};

type GoogleReviewsResponse = {
  reviews?: Array<{
    name: string;
    reviewId?: string;
    reviewer?: { displayName?: string };
    starRating?: string;
    comment?: string;
    createTime?: string;
    reviewReply?: { comment?: string; updateTime?: string };
  }>;
  nextPageToken?: string;
};
