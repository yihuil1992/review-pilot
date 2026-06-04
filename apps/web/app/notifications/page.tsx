import { AppShell } from "@/components/app-shell";
import { NotificationsClient } from "./notifications-client";

export default function NotificationsPage() {
  return (
    <AppShell
      current="/notifications"
      title="Notification tasks"
      subtitle="Scheduled Twilio links, retries, cancellations, and due sends in one operational queue."
    >
      <NotificationsClient />
    </AppShell>
  );
}
