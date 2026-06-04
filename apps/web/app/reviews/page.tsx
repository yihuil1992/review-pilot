import { Suspense } from "react";
import { SignedReviewAuthGate } from "@/app/auth-gate";
import { AppShell } from "@/components/app-shell";
import { MessageAlert } from "@/components/product-ui";
import { demoMode } from "@/lib/demo-mode";
import { ReviewsClient } from "./reviews-client";

export default function ReviewsPage() {
  return (
    <SignedReviewAuthGate>
      <AppShell
        current="/reviews"
        title="Unhandled reviews"
        subtitle={
          demoMode
            ? "Try review triage, AI drafts, test publish, and handled states with sample data."
            : "Triage each review with the business, risk, draft, and publish action in one focused view."
        }
      >
        <Suspense fallback={<MessageAlert>Loading reviews...</MessageAlert>}>
          <ReviewsClient />
        </Suspense>
      </AppShell>
    </SignedReviewAuthGate>
  );
}
