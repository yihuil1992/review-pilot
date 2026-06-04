"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, CheckCircle2, ChevronDown, CircleAlert, CircleDashed, Copy, ExternalLink, RefreshCw } from "lucide-react";

import { demoBootstrap, demoGoogleAccounts, demoLocations } from "@/lib/demo-data";
import { demoMode } from "@/lib/demo-mode";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";
const localGoogleCallbackUrl = `${apiBase.replace(/\/$/, "")}/google/oauth/callback`;

type BootstrapState = {
  ownerConfigured: boolean;
  publicBaseUrl: string | null;
  googleCallbackUrl: string | null;
  publicBaseUrlConfigured: boolean;
  codexConfigured: boolean;
  codex: {
    model: string;
    configured: boolean;
  };
  twilioConfigured: boolean;
  twilio: null | {
    accountSid: string;
    authTokenConfigured: boolean;
    authTokenMasked: string;
    fromNumber: string;
    notifyToNumber: string | null;
  };
  googleConfigured: boolean;
  googleOAuth: null | {
    clientId: string;
    clientSecretConfigured: boolean;
    clientSecretMasked: string | null;
  };
  publishTestMode: boolean;
};

type GoogleAccount = {
  id: string;
  email: string;
  status: string;
};

type BusinessLocation = {
  id: string;
  businessName: string;
  address: string | null;
  enabled: boolean;
  googleOpenStatus: string | null;
  googleAccount: { email: string };
};

type CodexLoginStatus = {
  loggedIn: boolean;
  loginStatus: string;
  session: null | {
    status: "running" | "ready" | "failed" | "expired";
    loginUrl?: string;
    userCode?: string;
    output?: string;
    error?: string;
  };
};

type CodexRuntimeStatus = {
  checked: boolean;
  installed: boolean;
  loggedIn: boolean;
  codexVersion: string;
  loginStatus: string;
  error: string | null;
};

const codexModelOptions = [
  { value: "gpt-5.5", label: "GPT-5.5" },
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { value: "custom", label: "Custom" }
];
const codexLoginToastId = "codex-login";

export function SettingsClient() {
  const [bootstrap, setBootstrap] = useState<BootstrapState | null>(null);
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [codexModel, setCodexModel] = useState("gpt-5.4");
  const [codexLogin, setCodexLogin] = useState<CodexLoginStatus | null>(null);
  const [codexRuntime, setCodexRuntime] = useState<CodexRuntimeStatus | null>(null);
  const [googleCallbackUrl, setGoogleCallbackUrl] = useState<string | null>(null);
  const [publishTestMode, setPublishTestMode] = useState(false);
  const [codexLoginChecking, setCodexLoginChecking] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const codexLoginPollRef = useRef(0);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const visibleLocations = locations.filter((location) => location.googleOpenStatus !== "CLOSED_PERMANENTLY");
  const enabledLocationCount = visibleLocations.filter((location) => location.enabled).length;

  useEffect(() => {
    void refreshBootstrap();
    return () => {
      codexLoginPollRef.current += 1;
    };
  }, []);

  useEffect(() => {
    function closeModelMenu(event: MouseEvent) {
      if (!modelMenuRef.current?.contains(event.target as Node)) {
        setModelMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModelMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeModelMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeModelMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function refreshBootstrap() {
    if (demoMode) {
      setBootstrap(demoBootstrap);
      setCodexModel(demoBootstrap.codex.model);
      setGoogleCallbackUrl(demoBootstrap.googleCallbackUrl);
      setPublishTestMode(demoBootstrap.publishTestMode);
      void loadGoogleResources();
      return;
    }

    const response = await fetch(`${apiBase}/settings/bootstrap`, {
      credentials: "include"
    });
    const data = await response.json();
    setBootstrap(data);
    if (data.codex?.model) {
      setCodexModel(codexModelOptions.some((option) => option.value === data.codex.model) ? data.codex.model : "custom");
    }
    if (data.googleCallbackUrl) {
      setGoogleCallbackUrl(data.googleCallbackUrl);
    }
    setPublishTestMode(Boolean(data.publishTestMode));
    void loadGoogleResources();
  }

  async function loadGoogleResources() {
    if (demoMode) {
      setAccounts(demoGoogleAccounts);
      setLocations(demoLocations);
      return;
    }

    const [accountsResponse, locationsResponse] = await Promise.all([
      fetch(`${apiBase}/google/accounts`, { credentials: "include" }),
      fetch(`${apiBase}/google/locations`, { credentials: "include" })
    ]);
    if (accountsResponse.ok) {
      setAccounts(await accountsResponse.json());
    }
    if (locationsResponse.ok) {
      setLocations(await locationsResponse.json());
    }
  }

  async function submit(path: string, body: Record<string, unknown>, success: string | null) {
    if (demoMode) {
      await sleep(180);
      const data = applyDemoSettingsAction(path, body);
      if (success) {
        toast.success(success);
      }
      return data;
    }

    const response = await fetch(`${apiBase}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrfHeader() },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.message ?? "Request failed");
      return data;
    }

    if (success) {
      toast.success(success);
    }
    await refreshBootstrap();
    return data;
  }

  async function savePublicUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit(
      "/settings/public-url",
      { publicBaseUrl: String(form.get("publicBaseUrl") ?? "") },
      "Public URL saved"
    );
    if (result?.googleCallbackUrl) {
      setGoogleCallbackUrl(result.googleCallbackUrl);
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success("Copied");
  }

  async function saveGoogle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit(
      "/settings/google-oauth",
      {
        clientId: String(form.get("clientId") ?? ""),
        clientSecret: String(form.get("clientSecret") ?? "")
      },
      "Google OAuth credentials saved"
    );
  }

  async function savePublishMode(enabled: boolean) {
    setPublishTestMode(enabled);
    await submit(
      "/settings/publish-mode",
      { publishTestMode: enabled },
      enabled ? "Publish test mode enabled" : "Publish test mode disabled"
    );
  }

  async function connectGoogle(mode: "local" | "public") {
    if (demoMode) {
      toast.success(mode === "local" ? "Local Google connect simulated" : "Public Google connect simulated");
      return;
    }

    const localReturnTo = `${window.location.origin}/settings?google=connected`;
    const result = await submit(
      "/google/oauth/connect-url",
      mode === "local" ? { redirectUri: localGoogleCallbackUrl, returnTo: localReturnTo } : {},
      mode === "local" ? "Local Google connect URL created" : "Public Google connect URL created"
    );
    if (result?.url) {
      window.location.href = result.url;
    }
  }

  async function discoverLocations(accountId: string) {
    await submit(`/google/accounts/${accountId}/discover-locations`, {}, "Google locations discovered");
    await loadGoogleResources();
  }

  async function syncLocation(locationId: string) {
    await submit(`/google/locations/${locationId}/sync-reviews`, {}, "Google reviews synced");
  }

  async function setLocationEnabled(locationId: string, enabled: boolean) {
    if (demoMode) {
      setLocations((current) => current.map((location) => location.id === locationId ? { ...location, enabled } : location));
      toast.success(enabled ? "Location enabled" : "Location disabled");
      return;
    }

    await submit(`/google/locations/${locationId}/enabled`, { enabled }, enabled ? "Location enabled" : "Location disabled");
    await loadGoogleResources();
  }

  async function saveCodex(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit(
      "/settings/codex",
      {
        model: codexModel === "custom" ? String(form.get("customModel") ?? "") : codexModel
      },
      "Codex runtime settings saved"
    );
  }

  async function testCodex() {
    const result = await submit("/settings/codex/test", {}, null);
    setCodexRuntime({
      checked: true,
      installed: Boolean(result?.installed),
      loggedIn: Boolean(result?.loggedIn),
      codexVersion: String(result?.codexVersion ?? ""),
      loginStatus: String(result?.loginStatus ?? ""),
      error: result?.error ? String(result.error) : null
    });
    const message = codexStatusText(result);
    if (result?.ok) {
      toast.success(message);
    } else {
      toast.error(message);
    }
  }

  async function startCodexLogin() {
    toast.dismiss(codexLoginToastId);
    const result = await submit("/settings/codex/login/start", {}, null);
    if (result?.status) {
      setCodexLogin({ loggedIn: false, loginStatus: "Device authorization started", session: result });
      void pollCodexLogin();
    }
  }

  async function fetchCodexLoginStatus(notify: boolean) {
    if (demoMode) {
      const data: CodexLoginStatus = {
        loggedIn: true,
        loginStatus: "Demo Codex authorization is ready",
        session: {
          status: "ready",
          loginUrl: "https://chatgpt.com/",
          userCode: "RP-DEMO"
        }
      };
      setCodexLogin(data);
      if (notify) {
        toast.success("Codex is logged in", { id: codexLoginToastId });
      }
      return data;
    }

    const response = await fetch(`${apiBase}/settings/codex/login/status`, {
      credentials: "include"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.message ?? "Codex authorization status failed");
      return null;
    }
    setCodexLogin(data);
    if (notify) {
      if (data.loggedIn) {
        toast.success("Codex is logged in", { id: codexLoginToastId });
      } else if (data.session?.status === "ready") {
        toast.success("Codex authorization is ready", { id: codexLoginToastId });
      } else if (data.session?.status === "failed" || data.session?.status === "expired") {
        toast.error(data.session.error || data.loginStatus || "Codex authorization failed", { id: codexLoginToastId });
      } else {
        toast.info(data.session?.loginUrl || data.session?.userCode ? "Codex authorization code is ready" : "Waiting for Codex authorization", { id: codexLoginToastId });
      }
    }
    return data as CodexLoginStatus;
  }

  function applyDemoSettingsAction(path: string, body: Record<string, unknown>) {
    if (path === "/settings/public-url") {
      const publicBaseUrl = String(body.publicBaseUrl ?? demoBootstrap.publicBaseUrl);
      const googleCallbackUrl = `${publicBaseUrl.replace(/\/$/, "")}/api/google/oauth/callback`;
      setBootstrap((current) => current ? { ...current, publicBaseUrl, googleCallbackUrl, publicBaseUrlConfigured: true } : current);
      setGoogleCallbackUrl(googleCallbackUrl);
      return { publicBaseUrl, googleCallbackUrl };
    }
    if (path === "/settings/publish-mode") {
      const enabled = Boolean(body.publishTestMode);
      setBootstrap((current) => current ? { ...current, publishTestMode: enabled } : current);
      setPublishTestMode(enabled);
      return { publishTestMode: enabled };
    }
    if (path === "/settings/codex/test") {
      return {
        ok: true,
        installed: true,
        loggedIn: true,
        codexVersion: "codex-demo 5.4.0",
        loginStatus: "Logged in"
      };
    }
    if (path === "/settings/codex/login/start") {
      return {
        status: "ready",
        loginUrl: "https://chatgpt.com/",
        userCode: "RP-DEMO"
      };
    }
    if (path === "/settings/codex") {
      const model = String(body.model ?? demoBootstrap.codex.model);
      setBootstrap((current) => current ? { ...current, codexConfigured: true, codex: { model, configured: true } } : current);
      return { model };
    }
    if (path === "/settings/google-oauth") {
      setBootstrap((current) => current ? { ...current, googleConfigured: true } : current);
      return { ok: true };
    }
    if (path === "/settings/twilio") {
      setBootstrap((current) => current ? { ...current, twilioConfigured: true } : current);
      return { ok: true };
    }
    if (path === "/twilio/test-credentials") {
      return { status: "demo-active" };
    }
    if (path === "/twilio/send-test") {
      return { queued: true };
    }
    if (path.includes("/discover-locations") || path.includes("/sync-reviews")) {
      return { ok: true };
    }
    return { ok: true };
  }

  async function checkCodexLogin() {
    await fetchCodexLoginStatus(true);
  }

  async function pollCodexLogin() {
    const pollId = codexLoginPollRef.current + 1;
    codexLoginPollRef.current = pollId;
    setCodexLoginChecking(true);
    let announcedCode = false;
    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await sleep(attempt < 8 ? 800 : 2000);
        if (codexLoginPollRef.current !== pollId) {
          return;
        }
        const data = await fetchCodexLoginStatus(false);
        if (!data) {
          return;
        }
        if (!announcedCode && data.session && (data.session.loginUrl || data.session.userCode)) {
          announcedCode = true;
          toast.info("Codex authorization code is ready", { id: codexLoginToastId });
        }
        if (data.loggedIn || data.session?.status === "ready") {
          toast.success("Codex is logged in", { id: codexLoginToastId });
          return;
        }
        if (data.session?.status === "failed" || data.session?.status === "expired") {
          toast.error(data.session.error || data.loginStatus || "Codex authorization failed", { id: codexLoginToastId });
          return;
        }
      }
    } finally {
      if (codexLoginPollRef.current === pollId) {
        setCodexLoginChecking(false);
      }
    }
  }

  async function saveTwilio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit(
      "/settings/twilio",
      {
        accountSid: String(form.get("accountSid") ?? ""),
        authToken: String(form.get("authToken") ?? ""),
        fromNumber: String(form.get("fromNumber") ?? ""),
        notifyToNumber: String(form.get("notifyToNumber") ?? "")
      },
      "Twilio credentials saved"
    );
  }

  async function validateTwilio() {
    const result = await submit("/twilio/test-credentials", {}, null);
    if (result?.status) {
      toast.success(`Twilio account status: ${result.status}`);
    }
  }

  async function sendTestSms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit(
      "/twilio/send-test",
      { toNumber: String(form.get("toNumber") ?? "") },
      "Twilio test SMS queued"
    );
  }

  const readinessItems = [
    {
      label: "Owner access",
      complete: Boolean(bootstrap?.ownerConfigured),
      detail: "Password gate protects the operator console."
    },
    {
      label: "Public domain",
      complete: Boolean(bootstrap?.publicBaseUrlConfigured),
      detail: bootstrap?.publicBaseUrl || "Required for public callbacks and signed links."
    },
    {
      label: "Google Business",
      complete: Boolean(bootstrap?.googleConfigured),
      detail: `${accounts.length} account${accounts.length === 1 ? "" : "s"} connected, ${enabledLocationCount} active location${enabledLocationCount === 1 ? "" : "s"}.`
    },
    {
      label: "Codex runtime",
      complete: Boolean(bootstrap?.codexConfigured),
      detail: bootstrap?.codex.model ? `Reply model: ${bootstrap.codex.model}` : "Choose the model used for draft generation."
    },
    {
      label: "Twilio alerts",
      complete: Boolean(bootstrap?.twilioConfigured),
      detail: "Used for scheduled notification links and retries."
    }
  ];

  return (
    <section className="settings-page settings-page-refined">
      <section className="card settings-overview">
        <div className="settings-overview-head">
          <div>
            <h2>System readiness</h2>
            <p>{setupCount(bootstrap)} of 5 required connections are ready.</p>
          </div>
          <strong className={setupCount(bootstrap) === 5 ? "settings-health ready" : "settings-health attention"}>
            {setupCount(bootstrap) === 5 ? "Ready" : "Needs setup"}
          </strong>
        </div>
        <div className="setup-progress-bars" aria-hidden="true">
          {["ownerConfigured", "publicBaseUrlConfigured", "codexConfigured", "googleConfigured", "twilioConfigured"].map((key) => (
            <span key={key} className={Boolean(bootstrap?.[key as keyof BootstrapState]) ? "complete" : ""} />
          ))}
        </div>
        <div className="readiness-grid">
          {readinessItems.map((item) => (
            <ReadinessItem key={item.label} {...item} />
          ))}
        </div>
        <div className="settings-metrics" aria-label="Operational summary">
          <div>
            <span>Publish mode</span>
            <strong>{publishTestMode ? "Test mode" : "Live Google publish"}</strong>
          </div>
          <div>
            <span>Google accounts</span>
            <strong>{accounts.length}</strong>
          </div>
          <div>
            <span>Active locations</span>
            <strong>{enabledLocationCount}</strong>
          </div>
          <div>
            <span>AI model</span>
            <strong>{bootstrap?.codex.model || codexModel}</strong>
          </div>
        </div>
      </section>

      <section className="card settings-section settings-google-section">
        <div className="settings-section-head">
          <div>
            <h2>Google workspace</h2>
            <p>OAuth credentials, connected accounts, and the locations Review Pilot will sync.</p>
          </div>
          <span className={`settings-health ${bootstrap?.googleConfigured ? "ready" : "attention"}`}>
            {bootstrap?.googleConfigured ? "Connected" : "Not connected"}
          </span>
        </div>

        <div className="settings-split">
          <form className="settings-subsection" onSubmit={savePublicUrl}>
            <div className="settings-subsection-head">
              <h3>Domain</h3>
              <p>Used for callbacks, signed review links, and public owner actions.</p>
            </div>
            <div className="field">
              <label htmlFor="publicBaseUrl">Public base URL</label>
              <input key={bootstrap?.publicBaseUrl ?? "empty-public-url"} id="publicBaseUrl" name="publicBaseUrl" defaultValue={bootstrap?.publicBaseUrl ?? ""} placeholder="https://reviews.example.com" required />
            </div>
            <button className="button primary" type="submit">Save domain</button>
          </form>

          <div className="settings-subsection">
            <div className="settings-subsection-head">
              <h3>Redirect URIs</h3>
              <p>Copy these into the Google Cloud OAuth client.</p>
            </div>
            <CallbackField label="Public redirect URI" value={googleCallbackUrl ?? ""} onCopy={copyText} />
            <CallbackField label="Local development URI" value={localGoogleCallbackUrl} onCopy={copyText} />
          </div>
        </div>

        <form className="settings-subsection settings-subsection-wide" onSubmit={saveGoogle}>
          <div className="settings-subsection-head">
            <h3>OAuth credentials</h3>
            <p>Save the Google client credentials, then connect the Business Profile account.</p>
          </div>
          <div className="settings-form-grid">
            <div className="field">
              <label htmlFor="clientId">Client ID</label>
              <input key={bootstrap?.googleOAuth?.clientId ?? "empty-client-id"} id="clientId" name="clientId" defaultValue={bootstrap?.googleOAuth?.clientId ?? ""} placeholder="client-id.apps.googleusercontent.com" required />
            </div>
            <div className="field">
              <label htmlFor="clientSecret">Client secret</label>
              <input
                id="clientSecret"
                name="clientSecret"
                type="password"
                placeholder={bootstrap?.googleOAuth?.clientSecretConfigured ? `${bootstrap.googleOAuth.clientSecretMasked ?? "••••••••"} saved, leave blank to keep` : "Required before connecting Google"}
                required={!bootstrap?.googleOAuth?.clientSecretConfigured}
              />
            </div>
          </div>
          <div className="settings-actions">
            <button className="button primary" type="submit">Save Google OAuth</button>
            <button className="button" type="button" onClick={() => connectGoogle("local")}>Connect locally</button>
            <button className="button" type="button" onClick={() => connectGoogle("public")}>
              Connect public domain
              <ExternalLink aria-hidden="true" />
            </button>
          </div>
        </form>

        <div className="settings-subsection settings-subsection-wide">
          <div className="settings-subsection-head account-management-head">
            <div>
              <h3>Connected accounts</h3>
              <p>{accounts.length ? `${accounts.length} account${accounts.length === 1 ? "" : "s"} connected.` : "Connect Google to discover business locations."}</p>
            </div>
          </div>
          {accounts.length ? (
            <div className="accounts-compact-list">
              {accounts.map((account) => (
                <div className="account-row compact" key={account.id}>
                  <div className="account-main">
                    <strong>{account.email}</strong>
                    <StatusPill complete label={account.status} />
                  </div>
                  <button className="button" type="button" onClick={() => discoverLocations(account.id)}>
                    <RefreshCw aria-hidden="true" />
                    Discover locations
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-row">No Google accounts connected yet.</div>
          )}
        </div>

        <div className="settings-subsection settings-subsection-wide">
          <div className="settings-subsection-head location-management-head">
            <div>
              <h3>Business locations</h3>
              <p>{enabledLocationCount} active of {visibleLocations.length} discovered locations.</p>
            </div>
            <label className={`settings-mode-toggle ${publishTestMode ? "warning" : "ready"}`}>
              <input
                type="checkbox"
                checked={publishTestMode}
                onChange={(event) => void savePublishMode(event.currentTarget.checked)}
              />
              <span>{publishTestMode ? "Test publish mode" : "Live publish mode"}</span>
            </label>
          </div>
          {visibleLocations.length === 0 ? (
            <div className="empty-row">No active business locations discovered yet.</div>
          ) : (
            <div className="location-table" role="table" aria-label="Business locations">
              <div className="location-table-head" role="row">
                <span>Location</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {visibleLocations.map((location) => (
                <div className="location-row compact" key={location.id} role="row">
                  <div className="location-main">
                    <strong>{location.businessName}</strong>
                    <span>{location.address ?? "No address returned"}</span>
                    <small>{location.googleAccount.email}</small>
                  </div>
                  <StatusPill complete={location.enabled} label={location.enabled ? "Enabled" : "Disabled"} />
                  <div className="location-actions">
                    <button
                      className="button"
                      type="button"
                      onClick={() => setLocationEnabled(location.id, !location.enabled)}
                    >
                      {location.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      className="button"
                      type="button"
                      disabled={!location.enabled}
                      onClick={() => syncLocation(location.id)}
                    >
                      Sync reviews
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <form className="card half settings-section settings-runtime-card" onSubmit={saveCodex}>
        <div className="settings-section-head">
          <div>
            <h2>AI runtime</h2>
            <p>Controls how Review Pilot drafts replies and checks publish risk.</p>
          </div>
          <span className={`settings-health ${bootstrap?.codexConfigured ? "ready" : "attention"}`}>
            {bootstrap?.codexConfigured ? "Configured" : "Needs model"}
          </span>
        </div>
        {codexRuntime ? (
          <div className={`notice ${codexRuntime.installed && codexRuntime.loggedIn ? "success" : "error"}`}>
            <strong>{codexRuntime.installed ? "Codex CLI detected" : "Codex CLI not found"}</strong>
            <div>
              {codexRuntime.installed
                ? `${codexRuntime.codexVersion || "Version unavailable"} · ${codexRuntime.loggedIn ? "Logged in" : "Not logged in"}`
                : "Install Codex CLI on this machine, then run Test Codex again."}
            </div>
            {codexRuntime.error ? <pre className="log-output">{codexRuntime.error}</pre> : null}
          </div>
        ) : (
          <p className="settings-help">Codex is detected from this server. Test the runtime after changing models or credentials.</p>
        )}
        <div className="field">
          <label htmlFor="model">Model</label>
          <div className="settings-select" ref={modelMenuRef}>
            <input type="hidden" id="model" name="model" value={codexModel} />
            <button
              className="settings-select-button"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={modelMenuOpen}
              onClick={() => setModelMenuOpen((open) => !open)}
            >
              <span>{codexModelOptions.find((option) => option.value === codexModel)?.label ?? codexModel}</span>
              <ChevronDown aria-hidden="true" />
            </button>
            {modelMenuOpen ? (
              <div className="settings-select-menu" role="listbox" aria-label="Codex model">
                {codexModelOptions.map((option) => {
                  const selected = option.value === codexModel;
                  return (
                    <button
                      className={`settings-select-option ${selected ? "selected" : ""}`}
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setCodexModel(option.value);
                        setModelMenuOpen(false);
                      }}
                    >
                      <span>{option.label}</span>
                      {selected ? <Check aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
        {codexModel === "custom" ? (
          <div className="field">
            <label htmlFor="customModel">Custom model</label>
            <input id="customModel" name="customModel" defaultValue={bootstrap?.codex.model ?? ""} placeholder="gpt-5.4" required />
          </div>
        ) : null}
        <div className="field">
          <label>Codex authorization</label>
          <div className="status-row">
            <button className="button" type="button" onClick={startCodexLogin} disabled={codexLoginChecking || (codexRuntime?.checked && !codexRuntime.installed)}>
              {codexLoginChecking ? "Waiting for authorization" : "Start device authorization"}
            </button>
            <button className="button" type="button" onClick={checkCodexLogin} disabled={codexLoginChecking}>Refresh status</button>
          </div>
        </div>
        {codexLogin?.session ? (
          <div className={`notice ${codexLogin.loggedIn || codexLogin.session.status === "ready" ? "success" : ""}`}>
            <strong>{codexSessionLabel(codexLogin)}</strong>
            {codexLogin.session.loginUrl ? (
              <div><a href={codexLogin.session.loginUrl} target="_blank" rel="noreferrer">Open authorization link</a></div>
            ) : null}
            {codexLogin.session.userCode ? <div>Code: <strong>{codexLogin.session.userCode}</strong></div> : null}
            {codexLogin.session.output ? <pre className="log-output">{codexLogin.session.output}</pre> : null}
          </div>
        ) : null}
        {codexLogin && !codexLogin.session ? (
          <div className={`notice ${codexLogin.loggedIn ? "success" : "error"}`}>{codexLogin.loginStatus}</div>
        ) : null}
        <p className="settings-help">This starts device authorization on the server. Open the link in your browser; the deployed runtime receives the login after authorization. For persistent hosting, keep <code>CODEX_HOME</code> on durable storage.</p>
        <div className="status-row">
          <button className="button primary" type="submit">Save model</button>
          <button className="button" type="button" onClick={testCodex}>Test Codex</button>
        </div>
      </form>

      <section className="card half settings-section settings-notification-card">
        <div className="settings-section-head">
          <div>
            <h2>Notifications</h2>
            <p>Twilio credentials for scheduled review links, retries, and due sends.</p>
          </div>
          <span className={`settings-health ${bootstrap?.twilioConfigured ? "ready" : "attention"}`}>
            {bootstrap?.twilioConfigured ? "Configured" : "Needs Twilio"}
          </span>
        </div>
        <form className="settings-form-grid" onSubmit={saveTwilio}>
          <div className="field">
            <label htmlFor="accountSid">Account SID</label>
            <input key={bootstrap?.twilio?.accountSid ?? "empty-account-sid"} id="accountSid" name="accountSid" defaultValue={bootstrap?.twilio?.accountSid ?? ""} required />
          </div>
          <div className="field">
            <label htmlFor="authToken">Auth token</label>
            <input
              id="authToken"
              name="authToken"
              type="password"
              placeholder={bootstrap?.twilio?.authTokenConfigured ? `${bootstrap.twilio.authTokenMasked} saved, leave blank to keep` : "Required before validating Twilio"}
              required={!bootstrap?.twilio?.authTokenConfigured}
            />
          </div>
          <div className="field">
            <label htmlFor="fromNumber">From number</label>
            <input key={bootstrap?.twilio?.fromNumber ?? "empty-from-number"} id="fromNumber" name="fromNumber" defaultValue={bootstrap?.twilio?.fromNumber ?? ""} placeholder="+1234567890" required />
          </div>
          <div className="field">
            <label htmlFor="notifyToNumber">Notification number</label>
            <input key={bootstrap?.twilio?.notifyToNumber ?? "empty-notify-number"} id="notifyToNumber" name="notifyToNumber" defaultValue={bootstrap?.twilio?.notifyToNumber ?? ""} placeholder="+1234567890" />
          </div>
          <div className="settings-actions span-all">
            <button className="button primary" type="submit">Save Twilio</button>
            <button className="button" type="button" onClick={validateTwilio}>Validate</button>
          </div>
        </form>
        <form className="settings-test-row" onSubmit={sendTestSms}>
          <div className="field">
            <label htmlFor="toNumber">Send test SMS</label>
            <input id="toNumber" name="toNumber" placeholder="+1234567890" required />
          </div>
          <button className="button" type="submit">Send test</button>
        </form>
      </section>
    </section>
  );
}

function setupCount(bootstrap: BootstrapState | null): number {
  if (!bootstrap) {
    return 0;
  }
  return [
    bootstrap.ownerConfigured,
    bootstrap.publicBaseUrlConfigured,
    bootstrap.codexConfigured,
    bootstrap.googleConfigured,
    bootstrap.twilioConfigured
  ].filter(Boolean).length;
}

function ReadinessItem({ label, complete, detail }: { label: string; complete: boolean; detail: string }) {
  return (
    <div className={`readiness-item ${complete ? "complete" : "attention"}`}>
      {complete ? <CheckCircle2 aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function StatusPill({ complete, label }: { complete: boolean; label: string }) {
  return (
    <span className={`status-pill ${complete ? "ready" : "attention"}`}>
      {complete ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      {label}
    </span>
  );
}

function CallbackField({ label, value, onCopy }: { label: string; value: string; onCopy: (value: string) => void }) {
  return (
    <div className="field callback-field">
      <label>{label}</label>
      <div className="copy-row">
        <input readOnly value={value || "Save public URL first"} />
        <button className="button" type="button" disabled={!value} onClick={() => onCopy(value)}>
          <Copy aria-hidden="true" />
          Copy
        </button>
      </div>
    </div>
  );
}

function csrfHeader(): Record<string, string> {
  const token = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("rp_csrf="))
    ?.slice("rp_csrf=".length);
  return token ? { "X-CSRF-Token": decodeURIComponent(token) } : {};
}

function codexStatusText(result: Record<string, unknown> | undefined): string {
  if (!result?.installed) {
    return "Codex CLI is not installed or is not on PATH";
  }
  if (!result?.loggedIn) {
    return "Codex CLI is installed, but not logged in";
  }
  return `Codex ready: ${String(result.codexVersion ?? "version unavailable")}`;
}

function codexSessionLabel(status: CodexLoginStatus): string {
  if (status.loggedIn || status.session?.status === "ready") {
    return "ready";
  }
  if (status.session?.status === "running" && (status.session.loginUrl || status.session.userCode)) {
    return "authorization ready";
  }
  if (status.session?.status === "running") {
    return "starting";
  }
  return status.session?.status ?? status.loginStatus;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
