export const demoReviews = [
  {
    id: "demo-review-1",
    business: "Harbor & Pine Dental",
    businessLocationId: "demo-location-1",
    googleMapsUrl: "https://maps.google.com/?q=Harbor%20%26%20Pine%20Dental",
    author: "Morgan Lee",
    rating: 2,
    text: "I waited almost 40 minutes after my appointment time and nobody explained what was happening. The hygienist was kind, but the front desk made the whole visit feel disorganized.",
    status: "new",
    reviewCreatedAt: "2026-06-04T12:18:00.000Z",
    analysis: {
      severity: "red",
      priority: "urgent",
      publishRisk: {
        requiresHumanReview: true,
        reasons: [
          "Low rating mentions delay and service breakdown.",
          "Reply should acknowledge frustration without sharing private health details."
        ]
      }
    },
    draft: null,
    publishedReply: null,
    publishTestMode: true
  },
  {
    id: "demo-review-2",
    business: "Harbor & Pine Dental",
    businessLocationId: "demo-location-1",
    googleMapsUrl: "https://maps.google.com/?q=Harbor%20%26%20Pine%20Dental",
    author: "Priya Shah",
    rating: 5,
    text: "The team squeezed me in for an urgent crown repair before a work trip. Fast, calm, and really thoughtful.",
    status: "new",
    reviewCreatedAt: "2026-06-04T10:10:00.000Z",
    analysis: {
      severity: "green",
      priority: "normal",
      publishRisk: {
        requiresHumanReview: false,
        reasons: ["Positive review with no sensitive details.", "Warm concise reply is appropriate."]
      }
    },
    draft: {
      body: "Priya, thank you for the kind words. We are glad we could help before your trip and appreciate you trusting Harbor & Pine Dental.",
      version: 1,
      instruction: null
    },
    publishedReply: null,
    publishTestMode: true
  },
  {
    id: "demo-review-3",
    business: "Lakeview Auto Detail",
    businessLocationId: "demo-location-2",
    googleMapsUrl: "https://maps.google.com/?q=Lakeview%20Auto%20Detail",
    author: "Andre Wilson",
    rating: 3,
    text: "The interior looked great, but the pickup time changed twice. I would come back if scheduling gets tighter.",
    status: "new",
    reviewCreatedAt: "2026-06-03T20:30:00.000Z",
    analysis: {
      severity: "yellow",
      priority: "normal",
      publishRisk: {
        requiresHumanReview: false,
        reasons: ["Mixed feedback includes a fixable scheduling issue.", "Reply should thank and acknowledge the timing concern."]
      }
    },
    draft: null,
    publishedReply: null,
    publishTestMode: true
  },
  {
    id: "demo-review-4",
    business: "North Star Bakery",
    businessLocationId: "demo-location-3",
    googleMapsUrl: "https://maps.google.com/?q=North%20Star%20Bakery",
    author: "Elena Garcia",
    rating: 4,
    text: "Loved the cardamom buns. The line was long on Sunday morning, but the staff kept it moving.",
    status: "new",
    reviewCreatedAt: "2026-06-02T14:05:00.000Z",
    analysis: {
      severity: "green",
      priority: "low",
      publishRisk: {
        requiresHumanReview: false,
        reasons: ["Mostly positive review.", "No escalation or policy concerns detected."]
      }
    },
    draft: {
      body: "Elena, thank you for stopping by and for the kind note about the cardamom buns. We appreciate your patience on a busy Sunday morning.",
      version: 1,
      instruction: null
    },
    publishedReply: null,
    publishTestMode: true
  }
];

export const demoNotificationTasks = [
  {
    reviewId: "demo-review-1",
    business: "Harbor & Pine Dental",
    author: "Morgan Lee",
    rating: 2,
    reviewStatus: "new",
    notificationStatus: "pending",
    notifyAt: "2026-06-04T14:30:00.000Z",
    notificationSentAt: null,
    notificationAttempts: 0,
    notificationLastError: null,
    severity: "red"
  },
  {
    reviewId: "demo-review-2",
    business: "Harbor & Pine Dental",
    author: "Priya Shah",
    rating: 5,
    reviewStatus: "new",
    notificationStatus: "sent",
    notifyAt: "2026-06-04T11:00:00.000Z",
    notificationSentAt: "2026-06-04T11:01:00.000Z",
    notificationAttempts: 1,
    notificationLastError: null,
    severity: "green"
  },
  {
    reviewId: "demo-review-3",
    business: "Lakeview Auto Detail",
    author: "Andre Wilson",
    rating: 3,
    reviewStatus: "new",
    notificationStatus: "failed",
    notifyAt: "2026-06-03T21:00:00.000Z",
    notificationSentAt: null,
    notificationAttempts: 2,
    notificationLastError: "Demo carrier rejected the sample destination number.",
    severity: "yellow"
  },
  {
    reviewId: "demo-review-4",
    business: "North Star Bakery",
    author: "Elena Garcia",
    rating: 4,
    reviewStatus: "new",
    notificationStatus: "canceled",
    notifyAt: "2026-06-02T15:00:00.000Z",
    notificationSentAt: null,
    notificationAttempts: 0,
    notificationLastError: null,
    severity: "green"
  }
];

export const demoGoogleAccounts = [
  {
    id: "demo-account-1",
    email: "owner@example.com",
    status: "connected"
  }
];

export const demoLocations = [
  {
    id: "demo-location-1",
    businessName: "Harbor & Pine Dental",
    address: "215 Harbor Ave, Portland, ME",
    enabled: true,
    googleOpenStatus: "OPEN",
    googleAccount: { email: "owner@example.com" }
  },
  {
    id: "demo-location-2",
    businessName: "Lakeview Auto Detail",
    address: "88 Lakeview Dr, Madison, WI",
    enabled: true,
    googleOpenStatus: "OPEN",
    googleAccount: { email: "owner@example.com" }
  },
  {
    id: "demo-location-3",
    businessName: "North Star Bakery",
    address: "19 Cedar St, Burlington, VT",
    enabled: false,
    googleOpenStatus: "OPEN",
    googleAccount: { email: "owner@example.com" }
  }
];

export const demoBootstrap = {
  ownerConfigured: true,
  publicBaseUrl: "https://yihuil1992.github.io/review-pilot",
  googleCallbackUrl: "https://yihuil1992.github.io/review-pilot/api/google/oauth/callback",
  publicBaseUrlConfigured: true,
  codexConfigured: true,
  codex: {
    model: "gpt-5.4",
    configured: true
  },
  twilioConfigured: true,
  twilio: {
    accountSid: "AC1234567890DEMO",
    authTokenConfigured: true,
    authTokenMasked: "••••••••demo",
    fromNumber: "+15550101010",
    notifyToNumber: "+15550101999"
  },
  googleConfigured: true,
  googleOAuth: {
    clientId: "demo-client-id.apps.googleusercontent.com",
    clientSecretConfigured: true,
    clientSecretMasked: "••••••••demo"
  },
  publishTestMode: true
};

export const demoReviewSync = {
  enabled: true,
  intervalMinutes: 60,
  lastStartedAt: "2026-06-04T13:00:00.000Z",
  lastFinishedAt: "2026-06-04T13:01:12.000Z",
  nextRunAt: "2026-06-04T14:00:00.000Z",
  status: "succeeded" as const,
  locationsScanned: 3,
  reviewsSeen: 17,
  created: 4,
  updated: 2,
  error: null
};

export function demoDraft(author: string, business: string, instruction?: string): string {
  const suffix = instruction ? ` We adjusted this demo draft for: ${instruction}.` : "";
  return `${author}, thank you for taking the time to share this. We appreciate the feedback and will use it to improve the experience at ${business}.${suffix}`;
}
