import { AppShell } from "@/components/app-shell";
import { demoMode } from "@/lib/demo-mode";
import { NotificationsClient } from "./notifications-client";

export default function NotificationsPage() {
  return (
    <AppShell
      current="/notifications"
      title="Operational tasks"
      subtitle={demoMode ? "Preview sync and notification task controls without sending messages." : "Monitor hourly Google review sync and scheduled Twilio notification work."}
    >
      <NotificationsClient />
    </AppShell>
  );
}
