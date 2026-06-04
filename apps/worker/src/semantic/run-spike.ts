import { config } from "dotenv";
import { CodexSubscriptionEngine } from "./codex-subscription.engine.js";

config();

const engine = new CodexSubscriptionEngine();

const result = await engine.analyzeReview({
  businessName: "Shaking Crab Williamsburg",
  authorName: "Ethan Reynolds",
  rating: 2,
  reviewText:
    "Service was friendly but the crab bag was disappointing. The sauce tasted watery and half the crab legs were overcooked. We waited almost 40 minutes even though the restaurant wasn't packed. I wanted to like this place but probably won't come back.",
  reviewCreatedAt: "2026-06-01T18:12:00Z",
  historicalReplies: []
});

console.log(JSON.stringify(result, null, 2));
