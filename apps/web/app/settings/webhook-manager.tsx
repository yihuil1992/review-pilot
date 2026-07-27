"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleDashed,
  Copy,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Webhook
} from "lucide-react";
import { toast } from "sonner";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

const webhookEvents = [
  { value: "review.created", label: "Review created" },
  { value: "review.updated", label: "Review updated" },
  { value: "draft.ready", label: "Draft ready" },
  { value: "publish.succeeded", label: "Publish succeeded" },
  { value: "publish.failed", label: "Publish failed" },
  { value: "notification.updated", label: "Notification updated" },
  { value: "sync.completed", label: "Sync completed" }
] as const;

type WebhookClientOption = {
  id: string;
  name: string;
  revokedAt: string | null;
};

type WebhookEndpoint = {
  id: string;
  apiClientId: string;
  apiClientName: string;
  url: string;
  events: string[];
  active: boolean;
  deliveryCount: number;
  createdAt: string;
  updatedAt: string;
};

type WebhookDelivery = {
  id: string;
  eventId: string;
  eventType: string;
  status: "pending" | "delivering" | "delivered" | "failed";
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RevealedSecret = {
  endpointName: string;
  value: string;
};

export function WebhookManager({ clients, demoMode }: { clients: WebhookClientOption[]; demoMode: boolean }) {
  const activeClients = clients.filter((client) => !client.revokedAt);
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(!demoMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyActions, setBusyActions] = useState<Set<string>>(() => new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, WebhookDelivery[]>>({});
  const [deliveryLoading, setDeliveryLoading] = useState<string | null>(null);
  const [deliveryErrors, setDeliveryErrors] = useState<Record<string, string | null>>({});
  const [revealedSecret, setRevealedSecret] = useState<RevealedSecret | null>(null);

  useEffect(() => {
    if (demoMode) {
      setLoading(false);
      return;
    }
    void loadEndpoints();
  }, [demoMode]);

  async function loadEndpoints() {
    setLoading(true);
    setLoadError(null);
    try {
      setEndpoints(await integrationRequest<WebhookEndpoint[]>("/integrations/webhooks"));
    } catch (error) {
      setLoadError(errorMessage(error, "Webhooks failed to load"));
    } finally {
      setLoading(false);
    }
  }

  async function loadDeliveries(endpointId: string) {
    setDeliveryLoading(endpointId);
    setDeliveryErrors((current) => ({ ...current, [endpointId]: null }));
    try {
      const result = await integrationRequest<WebhookDelivery[]>(`/integrations/webhooks/${endpointId}/deliveries`);
      setDeliveries((current) => ({ ...current, [endpointId]: result }));
    } catch (error) {
      setDeliveryErrors((current) => ({ ...current, [endpointId]: errorMessage(error, "Deliveries failed to load") }));
    } finally {
      setDeliveryLoading((current) => current === endpointId ? null : current);
    }
  }

  async function createWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const selectedEvents = form.getAll("events").map(String);
    if (!selectedEvents.length) {
      toast.error("Select at least one webhook event");
      return;
    }

    setActionBusy("create", true);
    try {
      const result = await integrationRequest<{ endpoint: WebhookEndpoint; secret: string }>("/integrations/webhooks", {
        method: "POST",
        body: {
          apiClientId: String(form.get("apiClientId") ?? ""),
          url: String(form.get("url") ?? ""),
          events: selectedEvents,
          ownerPassword: String(form.get("ownerPassword") ?? "")
        }
      });
      setRevealedSecret({ endpointName: endpointLabel(result.endpoint, activeClients), value: result.secret });
      formElement.reset();
      toast.success("Webhook endpoint created");
      await loadEndpoints();
    } catch (error) {
      toast.error(errorMessage(error, "Webhook creation failed"));
    } finally {
      setActionBusy("create", false);
    }
  }

  async function saveEndpoint(endpointId: string, body: { url: string; events: string[] }) {
    if (!body.events.length) {
      toast.error("Select at least one webhook event");
      return;
    }
    await runEndpointAction(`save:${endpointId}`, "Webhook changes saved", async () => {
      await integrationRequest(`/integrations/webhooks/${endpointId}`, { method: "PATCH", body });
      await loadEndpoints();
    });
  }

  async function setEndpointActive(endpoint: WebhookEndpoint) {
    const nextActive = !endpoint.active;
    await runEndpointAction(`active:${endpoint.id}`, nextActive ? "Webhook resumed" : "Webhook paused", async () => {
      await integrationRequest(`/integrations/webhooks/${endpoint.id}`, {
        method: "PATCH",
        body: { active: nextActive }
      });
      await loadEndpoints();
    });
  }

  async function rotateSecret(endpoint: WebhookEndpoint) {
    const ownerPassword = window.prompt("Confirm the owner password to rotate this signing secret");
    if (!ownerPassword) return;
    await runEndpointAction(`rotate:${endpoint.id}`, "Signing secret rotated", async () => {
      const result = await integrationRequest<{ secret: string }>(`/integrations/webhooks/${endpoint.id}/rotate-secret`, {
        method: "POST",
        body: { ownerPassword }
      });
      setRevealedSecret({ endpointName: endpointLabel(endpoint, activeClients), value: result.secret });
    });
  }

  async function replayDelivery(endpointId: string, deliveryId: string) {
    await runEndpointAction(`replay:${deliveryId}`, "Delivery queued for replay", async () => {
      await integrationRequest(`/integrations/webhook-deliveries/${deliveryId}/replay`, { method: "POST", body: {} });
      await loadDeliveries(endpointId);
    });
  }

  async function runEndpointAction(action: string, successMessage: string, operation: () => Promise<void>) {
    setActionBusy(action, true);
    try {
      await operation();
      toast.success(successMessage);
    } catch (error) {
      toast.error(errorMessage(error, "Webhook request failed"));
    } finally {
      setActionBusy(action, false);
    }
  }

  function setActionBusy(action: string, value: boolean) {
    setBusyActions((current) => {
      const next = new Set(current);
      if (value) next.add(action);
      else next.delete(action);
      return next;
    });
  }

  function toggleEndpoint(endpointId: string) {
    if (expandedId === endpointId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(endpointId);
    void loadDeliveries(endpointId);
  }

  if (demoMode) {
    return (
      <div className="settings-subsection webhook-manager">
        <WebhookHeading />
        <div className="empty-row">Webhook configuration is unavailable in demo mode.</div>
      </div>
    );
  }

  return (
    <div className="settings-subsection webhook-manager">
      <WebhookHeading />

      {revealedSecret ? (
        <div className="notice success webhook-secret" role="status">
          <div>
            <strong>Copy this signing secret now</strong>
            <p>{revealedSecret.endpointName} will use it to sign every delivery. It cannot be displayed again.</p>
          </div>
          <code className="log-output">{revealedSecret.value}</code>
          <div className="settings-actions">
            <button className="button" type="button" onClick={() => void copySecret(revealedSecret.value)}>
              <Copy aria-hidden="true" />
              Copy secret
            </button>
            <button className="button" type="button" onClick={() => setRevealedSecret(null)}>Hide secret</button>
          </div>
        </div>
      ) : null}

      <form className="webhook-create-form" onSubmit={createWebhook}>
        <div className="settings-form-grid">
          <div className="field">
            <label htmlFor="webhookClient">API client</label>
            <select id="webhookClient" name="apiClientId" required disabled={!activeClients.length || busyActions.has("create")}>
              <option value="">Select an API client</option>
              {activeClients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="webhookUrl">HTTPS endpoint URL</label>
            <input
              id="webhookUrl"
              name="url"
              type="url"
              inputMode="url"
              placeholder="https://internal.example.com/webhooks/review-pilot"
              pattern="https://.*"
              required
              disabled={!activeClients.length || busyActions.has("create")}
            />
          </div>
          <div className="field">
            <label htmlFor="webhookOwnerPassword">Owner password confirmation</label>
            <input
              id="webhookOwnerPassword"
              name="ownerPassword"
              type="password"
              required
              disabled={!activeClients.length || busyActions.has("create")}
            />
          </div>
        </div>
        <EventChoices name="events" defaultEvents={webhookEvents.map((eventOption) => eventOption.value)} disabled={!activeClients.length || busyActions.has("create")} />
        {!activeClients.length ? (
          <p className="settings-help">Create an active API credential before adding its webhook endpoint.</p>
        ) : null}
        <button className="button primary" type="submit" disabled={!activeClients.length || busyActions.has("create")}>
          <Webhook aria-hidden="true" />
          {busyActions.has("create") ? "Creating webhook" : "Create webhook"}
        </button>
      </form>

      {loadError ? (
        <div className="notice error webhook-load-error" role="alert">
          <span>{loadError}</span>
          <button className="button" type="button" onClick={() => void loadEndpoints()}>
            <RefreshCw aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="webhook-skeleton" aria-label="Loading webhooks">
          <span />
          <span />
        </div>
      ) : endpoints.length ? (
        <div className="webhook-endpoint-list">
          {endpoints.map((endpoint) => (
            <WebhookEndpointRow
              key={`${endpoint.id}:${endpoint.updatedAt}`}
              endpoint={endpoint}
              expanded={expandedId === endpoint.id}
              busyActions={busyActions}
              deliveries={deliveries[endpoint.id] ?? []}
              deliveriesLoaded={Object.hasOwn(deliveries, endpoint.id)}
              deliveryLoading={deliveryLoading === endpoint.id}
              deliveryError={deliveryErrors[endpoint.id] ?? null}
              onToggle={() => toggleEndpoint(endpoint.id)}
              onSave={(body) => saveEndpoint(endpoint.id, body)}
              onSetActive={() => setEndpointActive(endpoint)}
              onRotate={() => rotateSecret(endpoint)}
              onRefreshDeliveries={() => loadDeliveries(endpoint.id)}
              onReplay={(deliveryId) => replayDelivery(endpoint.id, deliveryId)}
            />
          ))}
        </div>
      ) : !loadError ? (
        <div className="empty-row">No webhook endpoints have been created.</div>
      ) : null}
    </div>
  );
}

function WebhookHeading() {
  return (
    <div className="settings-subsection-head">
      <div>
        <h3>Webhooks</h3>
        <p>Send signed event updates to an external system and inspect recent delivery attempts.</p>
      </div>
    </div>
  );
}

function WebhookEndpointRow({
  endpoint,
  expanded,
  busyActions,
  deliveries,
  deliveriesLoaded,
  deliveryLoading,
  deliveryError,
  onToggle,
  onSave,
  onSetActive,
  onRotate,
  onRefreshDeliveries,
  onReplay
}: {
  endpoint: WebhookEndpoint;
  expanded: boolean;
  busyActions: ReadonlySet<string>;
  deliveries: WebhookDelivery[];
  deliveriesLoaded: boolean;
  deliveryLoading: boolean;
  deliveryError: string | null;
  onToggle: () => void;
  onSave: (body: { url: string; events: string[] }) => Promise<void>;
  onSetActive: () => Promise<void>;
  onRotate: () => Promise<void>;
  onRefreshDeliveries: () => Promise<void>;
  onReplay: (deliveryId: string) => Promise<void>;
}) {
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSave({
      url: String(form.get("url") ?? ""),
      events: form.getAll("events").map(String)
    });
  }

  const endpointBusy = ["save", "active", "rotate"].some((action) => busyActions.has(`${action}:${endpoint.id}`));

  return (
    <article className="webhook-endpoint-row" data-active={endpoint.active}>
      <div className="webhook-endpoint-summary">
        <div className="webhook-endpoint-main">
          <div className="webhook-endpoint-title">
            <strong>{endpoint.apiClientName}</strong>
            <span className={`status-pill ${endpoint.active ? "ready" : "attention"}`}>
              {endpoint.active ? <CheckCircle2 aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
              {endpoint.active ? "Active" : "Paused"}
            </span>
          </div>
          <span title={endpoint.url}>{endpoint.url}</span>
          <small>{endpoint.events.length} events · {endpoint.deliveryCount} deliveries</small>
        </div>
        <button className="button webhook-manage-button" type="button" aria-expanded={expanded} onClick={onToggle}>
          Manage
          <ChevronDown aria-hidden="true" />
        </button>
      </div>

      {expanded ? (
        <div className="webhook-endpoint-details">
          <form className="webhook-edit-form" onSubmit={save}>
            <div className="field">
              <label htmlFor={`webhook-url-${endpoint.id}`}>HTTPS endpoint URL</label>
              <input
                id={`webhook-url-${endpoint.id}`}
                name="url"
                type="url"
                inputMode="url"
                pattern="https://.*"
                defaultValue={endpoint.url}
                required
                disabled={endpointBusy}
              />
            </div>
            <EventChoices name="events" defaultEvents={endpoint.events} disabled={endpointBusy} />
            <div className="settings-actions">
              <button className="button primary" type="submit" disabled={endpointBusy}>
                {busyActions.has(`save:${endpoint.id}`) ? "Saving changes" : "Save changes"}
              </button>
              <button className="button" type="button" disabled={endpointBusy} onClick={() => void onSetActive()}>
                {endpoint.active ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                {busyActions.has(`active:${endpoint.id}`) ? "Updating status" : endpoint.active ? "Pause webhook" : "Resume webhook"}
              </button>
              <button className="button" type="button" disabled={endpointBusy} onClick={() => void onRotate()}>
                <RotateCcw aria-hidden="true" />
                {busyActions.has(`rotate:${endpoint.id}`) ? "Rotating secret" : "Rotate secret"}
              </button>
            </div>
          </form>

          <div className="webhook-deliveries">
            <div className="webhook-deliveries-head">
              <div>
                <strong>Recent deliveries</strong>
                <span>Newest 20 attempts, payloads are not shown.</span>
              </div>
              <button className="button" type="button" disabled={deliveryLoading} onClick={() => void onRefreshDeliveries()}>
                <RefreshCw aria-hidden="true" />
                {deliveryLoading ? "Refreshing" : "Refresh deliveries"}
              </button>
            </div>

            {deliveryError ? <div className="notice error" role="alert">{deliveryError}</div> : null}
            {deliveryLoading && !deliveriesLoaded ? (
              <div className="webhook-skeleton compact" aria-label="Loading deliveries"><span /><span /></div>
            ) : deliveries.length ? (
              <div className="webhook-delivery-list">
                {deliveries.map((delivery) => (
                  <div className="webhook-delivery-row" key={delivery.id}>
                    <div className="webhook-delivery-main">
                      <div>
                        <strong>{eventLabel(delivery.eventType)}</strong>
                        <span className={`webhook-delivery-status ${delivery.status}`}>
                          {delivery.status === "failed" ? <CircleAlert aria-hidden="true" /> : delivery.status === "delivered" ? <CheckCircle2 aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
                          {delivery.status}
                        </span>
                      </div>
                      <span>{formatDate(delivery.createdAt)} · {delivery.attempts} {delivery.attempts === 1 ? "attempt" : "attempts"}</span>
                      {delivery.lastError ? <small title={delivery.lastError}>{delivery.lastError}</small> : null}
                    </div>
                    {delivery.status === "failed" ? (
                      <button
                        className="button"
                        type="button"
                        disabled={busyActions.has(`replay:${delivery.id}`)}
                        onClick={() => void onReplay(delivery.id)}
                      >
                        <RotateCcw aria-hidden="true" />
                        {busyActions.has(`replay:${delivery.id}`) ? "Queueing replay" : "Replay delivery"}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : deliveriesLoaded && !deliveryError ? (
              <div className="empty-row">No deliveries have been recorded for this endpoint.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function EventChoices({ name, defaultEvents, disabled }: { name: string; defaultEvents: readonly string[]; disabled: boolean }) {
  return (
    <fieldset className="webhook-events" disabled={disabled}>
      <legend>Subscribed events</legend>
      <div>
        {webhookEvents.map((eventOption) => (
          <label className="status-pill" key={eventOption.value}>
            <input type="checkbox" name={name} value={eventOption.value} defaultChecked={defaultEvents.includes(eventOption.value)} />
            {eventOption.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

async function integrationRequest<T = unknown>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH"; body?: Record<string, unknown> } = {}
): Promise<T> {
  const method = options.method ?? "GET";
  const response = await fetch(`${apiBase}${path}`, {
    method,
    credentials: "include",
    headers: method === "GET" ? undefined : { "Content-Type": "application/json", ...csrfHeader() },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.message === "string"
      ? data.message
      : Array.isArray(data?.message)
        ? data.message.join(", ")
        : "Webhook request failed";
    throw new Error(message);
  }
  return data as T;
}

function csrfHeader(): Record<string, string> {
  const token = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("rp_csrf="))
    ?.slice("rp_csrf=".length);
  return token ? { "X-CSRF-Token": decodeURIComponent(token) } : {};
}

async function copySecret(secret: string) {
  try {
    await navigator.clipboard.writeText(secret);
    toast.success("Signing secret copied");
  } catch {
    toast.error("Could not copy the signing secret");
  }
}

function endpointLabel(endpoint: Pick<WebhookEndpoint, "apiClientId" | "apiClientName">, clients: WebhookClientOption[]) {
  return endpoint.apiClientName || clients.find((client) => client.id === endpoint.apiClientId)?.name || "This webhook";
}

function eventLabel(value: string) {
  return webhookEvents.find((eventOption) => eventOption.value === value)?.label ?? value;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
