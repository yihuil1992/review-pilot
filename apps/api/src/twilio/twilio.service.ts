import { BadGatewayException, Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SettingsService } from "../settings/settings.service.js";
import { CryptoService } from "../security/crypto.service.js";
import { PrismaService } from "../prisma.service.js";

const defaultSignedLinkTtlMs = 24 * 60 * 60 * 1000;

@Injectable()
export class TwilioService {
  constructor(
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async validateCredentials() {
    const twilio = await this.settings.getTwilioSettings();
    const response = await twilioFetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}.json`,
      twilio.accountSid,
      twilio.authToken
    );
    return {
      ok: true,
      accountSid: response.sid,
      status: response.status,
      type: response.type
    };
  }

  async sendTestSms(input: { toNumber: string; reviewId?: string }) {
    const [twilio, publicBaseUrl] = await Promise.all([
      this.settings.getTwilioSettings(),
      this.settings.getPublicBaseUrl()
    ]);
    const reviewUrl = input.reviewId ? this.createReviewLink(publicBaseUrl, input.reviewId) : `${publicBaseUrl}/reviews`;
    const message = `Review Pilot test: open ${reviewUrl}`;
    const response = await twilioFetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Messages.json`,
      twilio.accountSid,
      twilio.authToken,
      {
        method: "POST",
        body: new URLSearchParams({
          To: input.toNumber,
          From: twilio.fromNumber,
          Body: message
        })
      }
    );

    return {
      ok: true,
      sid: response.sid,
      status: response.status,
      reviewUrl
    };
  }

  async sendReviewNotification(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        businessLocation: true,
        analysis: true
      }
    });
    if (!review) {
      throw new Error("Review not found");
    }

    const [twilio, publicBaseUrl] = await Promise.all([
      this.settings.getTwilioSettings(),
      this.settings.getPublicBaseUrl()
    ]);
    if (!twilio.notifyToNumber) {
      throw new Error("Twilio notification number is not configured");
    }

    const pendingCount = await this.prisma.review.count({
      where: {
        businessLocationId: review.businessLocationId,
        status: { in: ["new", "draft_ready", "failed", "deferred"] }
      }
    });
    const reviewUrl = this.createReviewLink(publicBaseUrl, review.id);
    const severity = review.analysis?.severity ?? "yellow";
    const summary = extractSummary(review.analysis?.issues, review.analysis?.positives);
    const queueInfo = pendingCount > 1 ? ` (${pendingCount - 1} more pending)` : "";
    const message = [
      `New review${queueInfo} - ${review.businessLocation.businessName}`,
      `${review.authorName ?? "Customer"} (${review.rating}/5)`,
      `Severity: ${severity}`,
      summary,
      `Open: ${reviewUrl}`
    ].filter(Boolean).join("\n");

    const response = await this.sendSms({
      toNumber: twilio.notifyToNumber,
      body: message
    });

    await this.prisma.review.update({
      where: { id: review.id },
      data: {
        notified: true,
        notificationSentAt: new Date(),
        notificationStatus: "sent",
        notificationLastError: null,
        actions: {
          create: {
            type: "twilio_notified",
            metadata: { sid: response.sid, status: response.status }
          }
        }
      }
    });

    return {
      ok: true,
      reviewId: review.id,
      sid: response.sid,
      status: response.status,
      reviewUrl
    };
  }

  private async sendSms(input: { toNumber: string; body: string }) {
    const twilio = await this.settings.getTwilioSettings();
    return twilioFetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Messages.json`,
      twilio.accountSid,
      twilio.authToken,
      {
        method: "POST",
        body: new URLSearchParams({
          To: input.toNumber,
          From: twilio.fromNumber,
          Body: input.body.slice(0, 1500)
        })
      }
    );
  }

  createReviewLink(publicBaseUrl: string, reviewId: string): string {
    const token = this.crypto.signSession({
      reviewId,
      exp: Date.now() + defaultSignedLinkTtlMs
    });
    return `${publicBaseUrl.replace(/\/$/, "")}/reviews?review=${encodeURIComponent(reviewId)}&link=${encodeURIComponent(token)}`;
  }

  verifyReviewLink(token: string | undefined, reviewId: string): boolean {
    if (!token) {
      return false;
    }
    const payload = this.crypto.verifySession<{ reviewId: string; exp: number }>(token);
    return Boolean(payload?.reviewId === reviewId && payload.exp > Date.now());
  }

  validateWebhookSignature(url: string, params: Record<string, string>, signature: string | undefined, authToken: string): boolean {
    if (!signature) {
      return false;
    }

    const payload = Object.keys(params)
      .sort()
      .reduce((acc, key) => `${acc}${key}${params[key]}`, url);
    const expected = createHmac("sha1", authToken).update(payload).digest("base64");
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  }
}

async function twilioFetch(
  url: string,
  accountSid: string,
  authToken: string,
  init: RequestInit = {}
): Promise<TwilioResponse> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new BadGatewayException({
      message: data.message ?? "Twilio request failed",
      status: response.status,
      code: data.code
    });
  }
  return data as TwilioResponse;
}

type TwilioResponse = {
  sid?: string;
  status?: string;
  type?: string;
  message?: string;
  code?: number;
};

function extractSummary(issues: unknown, positives: unknown): string | null {
  const issueList = Array.isArray(issues) ? issues.slice(0, 2).join(", ") : "";
  const positiveList = Array.isArray(positives) ? positives.slice(0, 2).join(", ") : "";
  if (issueList) {
    return `Issues: ${issueList}`;
  }
  if (positiveList) {
    return `Positives: ${positiveList}`;
  }
  return null;
}
