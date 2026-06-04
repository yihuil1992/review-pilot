import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { MessageAlert } from "@/components/product-ui";
import { ReviewsClient } from "./reviews-client";

export default async function ReviewsPage({
  searchParams
}: {
  searchParams?: Promise<{ review?: string; link?: string }>;
}) {
  const params = await searchParams;
  const signedReview = Boolean(params?.review && params?.link);

  return (
    <AppShell
      current="/reviews"
      title={signedReview ? "Review link" : "Unhandled reviews"}
      subtitle={
        signedReview
          ? "Handle this signed review with the same draft, publish, and handled actions."
          : "Triage each review with the business, risk, draft, and publish action in one focused view."
      }
    >
      <Suspense fallback={<MessageAlert>Loading reviews...</MessageAlert>}>
        <ReviewsClient />
      </Suspense>
    </AppShell>
  );
}
