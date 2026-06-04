import { AuthGate } from "@/app/auth-gate";
import { AppShell } from "@/components/app-shell";
import { demoMode } from "@/lib/demo-mode";
import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
  return (
    <AuthGate>
      <AppShell
        current="/settings"
        title={demoMode ? "Demo setup" : "Production setup"}
        subtitle={demoMode ? "Inspect the production settings surface with masked sample credentials." : "Configure the self-hosted review workflow. Secrets are saved encrypted and shown masked after setup."}
      >
        <SettingsClient />
      </AppShell>
    </AuthGate>
  );
}
