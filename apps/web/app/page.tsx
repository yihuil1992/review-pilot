import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { HomeClient } from "./home-client";

export default function HomePage() {
  return (
    <AppShell
      current="/"
      title="Review command center"
      subtitle="See the current queue, due notifications, and setup status without placeholder data."
      action={
        <Link className="button primary" href="/reviews">
          Open queue
          <ArrowRight aria-hidden="true" />
        </Link>
      }
    >
      <HomeClient />
    </AppShell>
  );
}
