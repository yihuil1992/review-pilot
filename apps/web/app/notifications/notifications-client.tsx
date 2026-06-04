"use client";

import { useEffect, useState } from "react";
import { Ban, Clock3, Filter, RefreshCw, RotateCcw, Send, Zap } from "lucide-react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

type NotificationTask = {
  reviewId: string;
  business: string;
  author: string;
  rating: number;
  reviewStatus: string;
  notificationStatus: string;
  notifyAt: string | null;
  notificationSentAt: string | null;
  notificationAttempts: number;
  notificationLastError: string | null;
  severity: string | null;
};

type Message = {
  kind: "success" | "error";
  text: string;
};

type NotificationCounts = {
  all: number;
  pending: number;
  sent: number;
  failed: number;
  canceled: number;
} & Record<string, number>;

type ReviewSyncStatus = {
  enabled: boolean;
  intervalMinutes: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  nextRunAt: string | null;
  status: "idle" | "running" | "succeeded" | "failed" | "disabled";
  locationsScanned: number;
  reviewsSeen: number;
  created: number;
  updated: number;
  error: string | null;
};

const statusOptions = ["all", "pending", "sent", "failed", "canceled"];
const emptyCounts: NotificationCounts = { all: 0, pending: 0, sent: 0, failed: 0, canceled: 0 };

export function NotificationsClient() {
  const [tasks, setTasks] = useState<NotificationTask[]>([]);
  const [counts, setCounts] = useState<NotificationCounts>(emptyCounts);
  const [reviewSync, setReviewSync] = useState<ReviewSyncStatus | null>(null);
  const [status, setStatus] = useState("all");
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void loadTasks();
  }, [status]);

  useEffect(() => {
    void loadReviewSync();
  }, []);

  async function loadTasks() {
    setMessage(null);
    const query = status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
    const response = await fetch(`${apiBase}/notifications/tasks${query}`, { credentials: "include" });
    const data = await response.json().catch(() => []);
    if (!response.ok) {
      setMessage({ kind: "error", text: data?.message ?? "Notification tasks failed to load" });
      return;
    }
    if (Array.isArray(data)) {
      setTasks(data);
      setCounts(countTasks(data));
      return;
    }
    setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    setCounts({ ...emptyCounts, ...(data.counts ?? {}) });
  }

  async function loadReviewSync() {
    const response = await fetch(`${apiBase}/notifications/review-sync-status`, { credentials: "include" });
    const data = await response.json().catch(() => null);
    if (response.ok && data) {
      setReviewSync(data);
    }
  }

  async function post(path: string, success: string) {
    setBusy(path);
    setMessage(null);
    try {
      const response = await fetch(`${apiBase}${path}`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeader()
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ kind: "error", text: data.message ?? "Request failed" });
        return;
      }
      setMessage({ kind: "success", text: success });
      await Promise.all([loadTasks(), loadReviewSync()]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="tasks-page">
      <div className="rp-card review-sync-card" data-status={reviewSync?.status ?? "idle"}>
        <div className="review-sync-overview">
          <div className="review-sync-lead">
            <span className="review-sync-icon">
              <Clock3 aria-hidden="true" />
            </span>
            <div>
              <div className="review-sync-title-row">
                <h2>Review sync</h2>
                <span className={reviewSyncChipClass(reviewSync?.status ?? "idle")}>{formatSyncStatus(reviewSync?.status ?? "idle")}</span>
              </div>
              <p>{syncSummary(reviewSync)}</p>
            </div>
          </div>
          <button className="button" type="button" onClick={loadReviewSync}>
            <RefreshCw aria-hidden="true" />
            Refresh status
          </button>
        </div>
        <div className="review-sync-grid">
          <div>
            <span>Last scan</span>
            <strong>{formatDate(reviewSync?.lastFinishedAt ?? null, "Not run yet")}</strong>
          </div>
          <div>
            <span>Next scan</span>
            <strong>{formatDate(reviewSync?.nextRunAt ?? null, "Waiting for worker")}</strong>
          </div>
          <div>
            <span>Locations</span>
            <strong>{reviewSync?.locationsScanned ?? 0}</strong>
          </div>
          <div>
            <span>Reviews seen</span>
            <strong>{reviewSync?.reviewsSeen ?? 0}</strong>
          </div>
          <div>
            <span>New</span>
            <strong>{reviewSync?.created ?? 0}</strong>
          </div>
          <div>
            <span>Updated</span>
            <strong>{reviewSync?.updated ?? 0}</strong>
          </div>
        </div>
        {reviewSync?.error ? <div className="notice error">{reviewSync.error}</div> : null}
      </div>

      <div className="tasks-toolbar">
        <div className="filter-stack">
          {statusOptions.map((option) => (
            <button
              className={`rp-chip ${status === option ? "selected" : ""}`}
              key={option}
              type="button"
              onClick={() => setStatus(option)}
            >
              {option} {counts[option] ?? 0}
            </button>
          ))}
        </div>
        <div className="tasks-actions">
          <button className="button" type="button" onClick={loadTasks}>
            <RefreshCw aria-hidden="true" />
            Refresh
          </button>
          <button className="button primary" disabled={Boolean(busy)} type="button" onClick={() => post("/notifications/run-due", "Due notification scan queued")}>
            <Zap aria-hidden="true" />
            Run due now
          </button>
        </div>
      </div>

      {message ? <div className={`notice ${message.kind}`}>{message.text}</div> : null}

      <div className="rp-card tasks-card">
        <div className="panel-head">
          <div>
            <h2>Due queue</h2>
            <p>{tasks.length} task{tasks.length === 1 ? "" : "s"} in this view</p>
          </div>
          <button className="icon-button" type="button" aria-label="Filter tasks">
            <Filter aria-hidden="true" />
          </button>
        </div>

        <div className="task-list">
          {tasks.length === 0 ? <div className="notice">No notification tasks in this view.</div> : null}
          {tasks.map((task) => (
            <article className="task-card" key={task.reviewId}>
              <div className="task-icon" data-status={task.notificationStatus}>
                {task.notificationStatus === "sent" ? <Send aria-hidden="true" /> : <Zap aria-hidden="true" />}
              </div>
              <div className="task-main">
                <div className="task-title-row">
                  <h3>{task.business}</h3>
                  <span className={statusChipClass(task.notificationStatus)}>{task.notificationStatus}</span>
                  {task.severity ? <span className={severityChipClass(task.severity)}>{task.severity}</span> : null}
                </div>
                <p>{task.author} · {task.rating}/5 · review {task.reviewStatus}</p>
                <p>Due {formatDate(task.notifyAt)} · sent {formatDate(task.notificationSentAt)} · attempts {task.notificationAttempts}</p>
                {task.notificationLastError ? <div className="notice error">{task.notificationLastError}</div> : null}
              </div>
              <div className="task-actions">
                <button
                  className="button"
                  disabled={Boolean(busy) || task.notificationStatus === "sent"}
                  type="button"
                  onClick={() => post(`/notifications/tasks/${task.reviewId}/send-now`, "Notification send queued")}
                >
                  <Send aria-hidden="true" />
                  Send
                </button>
                <button
                  className="button"
                  disabled={Boolean(busy) || task.notificationStatus === "sent" || task.notificationStatus === "canceled"}
                  type="button"
                  onClick={() => post(`/notifications/tasks/${task.reviewId}/cancel`, "Notification canceled")}
                >
                  <Ban aria-hidden="true" />
                  Cancel
                </button>
                <button
                  className="button"
                  disabled={Boolean(busy) || task.notificationStatus === "pending"}
                  type="button"
                  onClick={() => post(`/notifications/tasks/${task.reviewId}/rerun`, "Notification requeued")}
                >
                  <RotateCcw aria-hidden="true" />
                  Rerun
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function countTasks(tasks: NotificationTask[]): NotificationCounts {
  return tasks.reduce<NotificationCounts>((acc, task) => {
    acc.all += 1;
    acc[task.notificationStatus] = (acc[task.notificationStatus] ?? 0) + 1;
    return acc;
  }, { ...emptyCounts });
}

function statusChipClass(status: string): string {
  if (status === "sent") {
    return "rp-chip success";
  }
  if (status === "failed") {
    return "rp-chip danger";
  }
  if (status === "pending") {
    return "rp-chip warning";
  }
  return "rp-chip";
}

function severityChipClass(severity: string): string {
  if (severity === "red") {
    return "rp-chip danger";
  }
  if (severity === "green") {
    return "rp-chip success";
  }
  return "rp-chip warning";
}

function reviewSyncChipClass(status: ReviewSyncStatus["status"]): string {
  if (status === "succeeded") {
    return "rp-chip success";
  }
  if (status === "failed") {
    return "rp-chip danger";
  }
  if (status === "running") {
    return "rp-chip selected";
  }
  if (status === "disabled") {
    return "rp-chip";
  }
  return "rp-chip warning";
}

function syncSummary(status: ReviewSyncStatus | null): string {
  if (!status) {
    return "Waiting for the worker to report its first hourly scan.";
  }
  if (!status.enabled || status.status === "disabled") {
    return "Scheduled Google review sync is disabled.";
  }
  if (status.status === "running") {
    return "Checking enabled Google locations now.";
  }
  if (status.status === "failed") {
    return "The last Google review scan failed. Check the error before relying on the queue.";
  }
  if (status.status === "succeeded") {
    return `Enabled locations are checked every ${status.intervalMinutes} minutes.`;
  }
  return `Google reviews are checked every ${status.intervalMinutes} minutes.`;
}

function formatSyncStatus(status: ReviewSyncStatus["status"]): string {
  return status
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatDate(value: string | null, empty = "none"): string {
  if (!value) {
    return empty;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function csrfHeader(): Record<string, string> {
  const token = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("rp_csrf="))
    ?.slice("rp_csrf=".length);
  return token ? { "X-CSRF-Token": decodeURIComponent(token) } : {};
}
