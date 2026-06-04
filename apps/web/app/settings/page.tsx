import { AppShell } from "@/components/app-shell";
import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
  return (
    <AppShell
      current="/settings"
      title="Production setup"
      subtitle="Configure the self-hosted review workflow. Secrets are saved encrypted and shown masked after setup."
    >
      <SettingsClient />
    </AppShell>
  );
}
