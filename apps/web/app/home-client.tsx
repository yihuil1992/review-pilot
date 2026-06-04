"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bell, Clock, FileText, PenLine, ShieldAlert, Star } from "lucide-react";

import { demoNotificationTasks, demoReviews } from "@/lib/demo-data";
import { demoMode } from "@/lib/demo-mode";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

type ReviewDto = {
  id: string;
  business: string;
  author: string;
  rating: number;
  text: string;
  status: string;
  reviewCreatedAt: string | null;
  analysis: null | {
    severity: "green" | "yellow" | "red";
    publishRisk: { requiresHumanReview: boolean; reasons: string[] };
  };
  draft: null | { body: string; version: number; instruction: string | null };
};

type NotificationTask = {
  reviewId: string;
  business: string;
  author: string;
  rating: number;
  reviewStatus: string;
  notificationStatus: string;
  notifyAt: string | null;
  notificationSentAt: string | null;
  severity: string | null;
};

type ReviewsPayload = { items?: ReviewDto[]; total?: number; limit?: number };

type LoadState = {
  reviews: ReviewDto[];
  reviewTotal: number;
  tasks: NotificationTask[];
  error: string | null;
  loading: boolean;
};

export function HomeClient() {
  const [state, setState] = useState<LoadState>({
    reviews: [],
    reviewTotal: 0,
    tasks: [],
    error: null,
    loading: true
  });

  useEffect(() => {
    let canceled = false;

    async function loadOverview() {
      if (demoMode) {
        setState({
          reviews: demoReviews as unknown as ReviewDto[],
          reviewTotal: demoReviews.length,
          tasks: demoNotificationTasks as unknown as NotificationTask[],
          error: null,
          loading: false
        });
        return;
      }

      try {
        const [reviewsResponse, tasksResponse] = await Promise.all([
          fetch(`${apiBase}/reviews`, { credentials: "include" }),
          fetch(`${apiBase}/notifications/tasks`, { credentials: "include" })
        ]);
        const reviewsData: unknown = await reviewsResponse.json().catch(() => []);
        const tasksData = await tasksResponse.json().catch(() => []);

        if (canceled) {
          return;
        }

        if (!reviewsResponse.ok || !tasksResponse.ok) {
          setState({
            reviews: [],
            reviewTotal: 0,
            tasks: [],
            error: responseMessage(reviewsData) ?? responseMessage(tasksData) ?? "Overview data failed to load",
            loading: false
          });
          return;
        }

        const reviewsPayload = normalizeReviewsPayload(reviewsData);
        setState({
          reviews: reviewsPayload.items,
          reviewTotal: reviewsPayload.total,
          tasks: Array.isArray(tasksData) ? tasksData : Array.isArray(tasksData.tasks) ? tasksData.tasks : [],
          error: null,
          loading: false
        });
      } catch {
        if (!canceled) {
          setState({ reviews: [], reviewTotal: 0, tasks: [], error: "Overview data failed to load", loading: false });
        }
      }
    }

    void loadOverview();
    return () => {
      canceled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const highRisk = state.reviews.filter(isHighRisk).length;
    const drafts = state.reviews.filter((review) => review.draft).length;
    const dueNow = state.tasks.filter((task) => task.notificationStatus === "pending").length;
    return [
      { label: "Unhandled reviews", value: state.reviewTotal, icon: FileText, tone: "neutral" },
      { label: "Due tasks", value: dueNow, icon: Clock, tone: "warning" },
      { label: "High risk", value: highRisk, icon: ShieldAlert, tone: "danger" },
      { label: "Drafts ready", value: drafts, icon: PenLine, tone: "primary" }
    ];
  }, [state.reviews, state.reviewTotal, state.tasks]);

  const dueReviews = useMemo(
    () =>
      [...state.reviews]
        .sort((a, b) => Number(isHighRisk(b)) - Number(isHighRisk(a)))
        .slice(0, 3),
    [state.reviews]
  );
  const recentTasks = state.tasks.slice(0, 3);

  return (
    <section className="home-grid">
      {state.error ? <div className="notice error">{state.error}</div> : null}

      <section className="home-stats" aria-label="Review status">
        {stats.map((card) => {
          const Icon = card.icon;
          return (
            <div className="rp-card home-stat" data-tone={card.tone} key={card.label}>
              <Icon aria-hidden="true" />
              <strong>{state.loading ? "0" : card.value}</strong>
              <span>{card.label}</span>
            </div>
          );
        })}
      </section>

      <section className="rp-card home-panel">
        <div className="home-panel-head">
          <div>
            <h2>Due now</h2>
            <p>{state.loading ? "Loading reviews" : `${dueReviews.length} review${dueReviews.length === 1 ? "" : "s"} shown`}</p>
          </div>
          <Link href="/reviews">View queue</Link>
        </div>
        <div className="home-review-list">
          {!state.loading && dueReviews.length === 0 ? <div className="notice">No unhandled reviews in the queue.</div> : null}
          {dueReviews.map((review) => (
            <Link href={`/reviews?review=${review.id}`} className="home-review-row" key={review.id}>
              <span className="rp-avatar">{initials(review.author)}</span>
              <span className="home-review-main">
                <span>
                  <strong>{review.author}</strong>
                  <span className="star-row" aria-label={`${review.rating} stars`}>
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={index} aria-hidden="true" className={index < review.rating ? "filled" : ""} />
                    ))}
                  </span>
                </span>
                <small>{review.text || "No review text provided."}</small>
              </span>
              <span className={riskChipClass(review)}>{riskLabel(review)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rp-card home-panel">
        <div className="home-panel-head">
          <div>
            <h2>Notification tasks</h2>
            <p>{state.loading ? "Loading tasks" : `${recentTasks.length} task${recentTasks.length === 1 ? "" : "s"} shown`}</p>
          </div>
          <Link href="/notifications">View tasks</Link>
        </div>
        <div className="activity-list">
          {!state.loading && recentTasks.length === 0 ? <div className="notice">No notification tasks in the queue.</div> : null}
          {recentTasks.map((task) => (
            <Link href="/notifications" className="activity-row" key={task.reviewId}>
              <Bell aria-hidden="true" />
              <span>
                <strong>{task.notificationStatus}</strong>
                <small>{task.business} · {task.author} · {task.rating}/5</small>
              </span>
              <time>{formatDate(task.notifyAt)}</time>
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "RP";
}

function isHighRisk(review: ReviewDto): boolean {
  return Boolean(review.analysis?.publishRisk.requiresHumanReview || review.analysis?.severity === "red");
}

function normalizeReviewsPayload(payload: unknown): { items: ReviewDto[]; total: number } {
  if (Array.isArray(payload)) {
    return { items: payload, total: payload.length };
  }
  const value = isRecord(payload) ? payload as ReviewsPayload : {};
  const items = Array.isArray(value.items) ? value.items : [];
  return {
    items,
    total: typeof value.total === "number" ? value.total : items.length
  };
}

function responseMessage(value: unknown): string | null {
  return isRecord(value) && typeof value.message === "string" ? value.message : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function riskLabel(review: ReviewDto): string {
  if (isHighRisk(review)) {
    return "High risk";
  }
  if (review.analysis?.severity === "green") {
    return "Low risk";
  }
  return review.draft ? "Draft ready" : "Needs reply";
}

function riskChipClass(review: ReviewDto): string {
  if (isHighRisk(review)) {
    return "rp-chip danger";
  }
  if (review.analysis?.severity === "green") {
    return "rp-chip success";
  }
  return "rp-chip warning";
}

function formatDate(value: string | null): string {
  if (!value) {
    return "not scheduled";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
