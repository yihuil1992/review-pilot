import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { appHref, demoMode } from "@/lib/demo-mode";
import { AuthGate } from "./auth-gate";
import { HomeClient } from "./home-client";

export default function HomePage() {
  return (
    <AuthGate>
      <AppShell
        current="/"
        title="Review command center"
        subtitle={demoMode ? "Preview the review workflow with sample data and no external service calls." : "See the current queue, due notifications, and setup status without placeholder data."}
        action={
          <Link className="button primary" href={appHref("/reviews")}>
            Open queue
            <ArrowRight aria-hidden="true" />
          </Link>
        }
      >
        <HomeClient />
      </AppShell>
    </AuthGate>
  );
}
