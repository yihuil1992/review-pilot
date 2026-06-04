import { AppShell } from "@/components/app-shell";
import { NotificationsClient } from "./notifications-client";

export default function NotificationsPage() {
  return (
    <AppShell
      current="/notifications"
      title="Operational tasks"
      subtitle="Monitor hourly Google review sync and scheduled Twilio notification work."
    >
      <NotificationsClient />
    </AppShell>
  );
}
