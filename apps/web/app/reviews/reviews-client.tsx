"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CheckCircle2, ChevronDown, ExternalLink, MapPin, MessageSquareText, RefreshCw, ShieldAlert, Sparkles, Star, X } from "lucide-react";
import { toast } from "sonner";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

type ReviewDto = {
  id: string;
  business: string;
  businessLocationId: string;
  googleMapsUrl: string | null;
  author: string;
  rating: number;
  text: string;
  status: string;
  reviewCreatedAt: string | null;
  analysis: null | {
    severity: "green" | "yellow" | "red";
    priority: string;
    publishRisk: { requiresHumanReview: boolean; reasons: string[] };
  };
  draft: null | { body: string; version: number; instruction: string | null };
  publishedReply: string | null;
  publishTestMode?: boolean;
};

type BusinessLocation = {
  id: string;
  businessName: string;
  enabled: boolean;
  googleOpenStatus: string | null;
};

type ReviewFilter = "all" | "highRisk" | "needsReply" | "draftReady";

export function ReviewsClient() {
  const searchParams = useSearchParams();
  const signedReviewId = searchParams.get("review");
  const signedLink = searchParams.get("link");
  const locationMenuRef = useRef<HTMLDivElement | null>(null);
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [signedReview, setSignedReview] = useState<ReviewDto | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [publishTestMode, setPublishTestMode] = useState(false);
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [locationId, setLocationId] = useState("all");
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  useEffect(() => {
    if (signedReviewId && signedLink) {
      void loadSignedReview(signedReviewId, signedLink);
      return;
    }
    setSignedReview(null);
    void loadReviews();
    void loadPublishMode();
    void loadLocations();
  }, [signedReviewId, signedLink, locationId]);

  useEffect(() => {
    function closeLocationMenu(event: MouseEvent) {
      if (!locationMenuRef.current?.contains(event.target as Node)) {
        setLocationMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLocationMenuOpen(false);
        setMobileDetailOpen(false);
      }
    }

    document.addEventListener("mousedown", closeLocationMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeLocationMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const queueCounts = useMemo(() => {
    const highRisk = reviews.filter((review) => review.analysis?.publishRisk.requiresHumanReview || review.analysis?.severity === "red").length;
    const draftReady = reviews.filter((review) => review.draft).length;
    return {
      all: reviews.length,
      highRisk,
      draftReady,
      needsReply: reviews.filter((review) => !review.draft).length
    };
  }, [reviews]);

  const visibleReviews = useMemo(() => {
    if (reviewFilter === "highRisk") {
      return reviews.filter((review) => review.analysis?.publishRisk.requiresHumanReview || review.analysis?.severity === "red");
    }
    if (reviewFilter === "needsReply") {
      return reviews.filter((review) => !review.draft);
    }
    if (reviewFilter === "draftReady") {
      return reviews.filter((review) => review.draft);
    }
    return reviews;
  }, [reviews, reviewFilter]);

  const selected = useMemo(
    () => signedReview ?? visibleReviews.find((review) => review.id === selectedId) ?? visibleReviews[0] ?? null,
    [selectedId, signedReview, visibleReviews]
  );
  const locationOptions = useMemo(
    () => [{ id: "all", businessName: "All locations" }, ...locations],
    [locations]
  );
  const selectedLocationLabel = locationOptions.find((location) => location.id === locationId)?.businessName ?? "All locations";

  async function loadSignedReview(reviewId: string, link: string) {
    const response = await fetch(`${apiBase}/reviews/${reviewId}/signed?link=${encodeURIComponent(link)}`);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(data?.message ?? "Signed link is invalid or expired");
      return;
    }
    setPublishTestMode(Boolean(data.publishTestMode));
    setSignedReview(data);
  }

  async function loadReviews() {
    const query = locationId === "all" ? "" : `?locationId=${encodeURIComponent(locationId)}`;
    const response = await fetch(`${apiBase}/reviews${query}`, { credentials: "include" });
    const data = await response.json().catch(() => []);
    if (!response.ok) {
      toast.error(data?.message ?? "Login required or reviews failed to load");
      return;
    }
    setReviews(data);
    setSelectedId((current) => {
      if (current && data.some((review: ReviewDto) => review.id === current)) {
        return current;
      }
      return data.find((review: ReviewDto) => review.id === signedReviewId)?.id ?? data[0]?.id ?? null;
    });
  }

  async function loadLocations() {
    const response = await fetch(`${apiBase}/google/locations`, { credentials: "include" });
    if (!response.ok) {
      return;
    }
    const data = await response.json().catch(() => []);
    setLocations(
      Array.isArray(data)
        ? data.filter((location: BusinessLocation) => location.googleOpenStatus !== "CLOSED_PERMANENTLY")
        : []
    );
  }

  async function loadPublishMode() {
    const response = await fetch(`${apiBase}/settings/bootstrap`, { credentials: "include" });
    if (!response.ok) {
      return;
    }
    const data = await response.json().catch(() => ({}));
    setPublishTestMode(Boolean(data.publishTestMode));
  }

  async function post(path: string, body: Record<string, unknown> = {}, success: string): Promise<boolean> {
    setBusy(path);
    try {
      const signedMode = Boolean(signedReviewId && signedLink);
      const response = await fetch(`${apiBase}${path}`, {
        method: "POST",
        credentials: signedMode ? "omit" : "include",
        headers: { "Content-Type": "application/json", ...(signedMode ? {} : csrfHeader()) },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.message ?? "Request failed");
        return false;
      }
      if (signedReviewId && signedLink) {
        await loadSignedReview(signedReviewId, signedLink);
      } else {
        await loadReviews();
      }
      toast.success(success);
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function generate(reviewId: string) {
    await post(signedActionPath(reviewId, "generate"), {}, "AI draft generated");
  }

  async function manualHandled(reviewId: string) {
    const completed = await post(signedActionPath(reviewId, "manual-handled"), {}, "Review marked as handled");
    if (completed) {
      setMobileDetailOpen(false);
    }
  }

  async function publish(review: ReviewDto) {
    const body = review.draft?.body;
    if (!body) {
      toast.error("No AI draft is available to publish");
      return;
    }
    const completed = await post(
      signedActionPath(review.id, "publish"),
      { body },
      publishTestMode ? "Test publish recorded. No Google reply was sent." : "Reply published"
    );
    if (completed) {
      setMobileDetailOpen(false);
    }
  }

  async function regenerate(event: FormEvent<HTMLFormElement>, reviewId: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const instruction = String(form.get("instruction") ?? "");
    await post(signedActionPath(reviewId, "regenerate"), { instruction }, "AI draft regenerated");
    formElement.reset();
  }

  function signedActionPath(reviewId: string, action: "generate" | "regenerate" | "publish" | "manual-handled") {
    if (signedReviewId && signedLink) {
      return `/reviews/${reviewId}/signed/${action}?link=${encodeURIComponent(signedLink)}`;
    }
    return `/reviews/${reviewId}/${action}`;
  }

  return (
    <>
      <section className={`reviews-workspace ${signedReview ? "signed-workspace" : ""}`}>
        {!signedReview ? (
          <aside className="review-queue-panel rp-card" aria-label="Review queue">
            <div className="panel-head">
              <div>
                <h2>Queue</h2>
                <p>{`Showing ${reviews.length || 0} unhandled`}</p>
              </div>
              <button className="icon-button" type="button" onClick={loadReviews} aria-label="Refresh reviews">
                <RefreshCw aria-hidden="true" />
              </button>
            </div>

            <div className="review-filter-bar">
              <div className="review-location-filter" ref={locationMenuRef}>
                <button
                  className="review-location-button"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={locationMenuOpen}
                  onClick={() => setLocationMenuOpen((open) => !open)}
                >
                  <MapPin aria-hidden="true" />
                  <span>{selectedLocationLabel}</span>
                  <ChevronDown aria-hidden="true" />
                </button>
                {locationMenuOpen ? (
                  <div className="review-location-menu" role="listbox" aria-label="Filter reviews by location">
                    {locationOptions.map((location) => {
                      const selectedLocation = location.id === locationId;
                      return (
                        <button
                          className={`review-location-option ${selectedLocation ? "selected" : ""}`}
                          key={location.id}
                          type="button"
                          role="option"
                          aria-selected={selectedLocation}
                          onClick={() => {
                            setLocationId(location.id);
                            setLocationMenuOpen(false);
                          }}
                        >
                          <span>{location.businessName}</span>
                          {selectedLocation ? <Check aria-hidden="true" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <div className="filter-stack" aria-label="Review filters">
                <button className={`rp-chip ${reviewFilter === "all" ? "selected" : ""}`} type="button" onClick={() => setReviewFilter("all")}>All {queueCounts.all}</button>
                <button className={`rp-chip ${reviewFilter === "highRisk" ? "selected" : ""}`} type="button" onClick={() => setReviewFilter("highRisk")}>High risk {queueCounts.highRisk}</button>
                <button className={`rp-chip ${reviewFilter === "needsReply" ? "selected" : ""}`} type="button" onClick={() => setReviewFilter("needsReply")}>Needs reply {queueCounts.needsReply}</button>
                <button className={`rp-chip ${reviewFilter === "draftReady" ? "selected" : ""}`} type="button" onClick={() => setReviewFilter("draftReady")}>Draft ready {queueCounts.draftReady}</button>
              </div>
            </div>

            <div className="review-list">
              {visibleReviews.map((review) => (
                <button
                  className={`review-row ${review.id === selected?.id ? "active" : ""}`}
                  key={review.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(review.id);
                    setMobileDetailOpen(true);
                  }}
                >
                  <span className="rp-avatar">{initials(review.author)}</span>
                  <span className="review-row-main">
                    <span className="review-row-top">
                      <strong>{review.author}</strong>
                      <small>{formatAge(review.reviewCreatedAt)}</small>
                    </span>
                    <span className="star-row" aria-label={`${review.rating} stars`}>
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star key={index} aria-hidden="true" className={index < review.rating ? "filled" : ""} />
                      ))}
                    </span>
                    <span className="review-row-text">{review.text || "No review text provided."}</span>
                    <span className={riskChipClass(review)}>{riskLabel(review)}</span>
                  </span>
                </button>
              ))}
              {visibleReviews.length === 0 ? <div className="notice">No reviews match this filter.</div> : null}
            </div>
          </aside>
        ) : null}

        {selected ? (
          <article className="review-detail-panel rp-card">
            <div className="review-detail-head">
              <span className="rp-avatar large">{initials(selected.author)}</span>
              <div>
                <h2>{selected.author}</h2>
                <p>{selected.business} · {formatAge(selected.reviewCreatedAt)}</p>
              </div>
              <span className="google-mark" aria-label="Google">G</span>
            </div>

            <div className="review-rating-line">
              <span className="star-row large" aria-label={`${selected.rating} stars`}>
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star key={index} aria-hidden="true" className={index < selected.rating ? "filled" : ""} />
                ))}
              </span>
              <strong>{selected.rating}/5</strong>
              {selected.googleMapsUrl ? (
                <a href={selected.googleMapsUrl} target="_blank" rel="noreferrer">
                  Open Google listing
                  <ExternalLink aria-hidden="true" />
                </a>
              ) : (
                <button type="button" disabled title="Google place link is unavailable for this location">
                  Google link unavailable
                  <ExternalLink aria-hidden="true" />
                </button>
              )}
            </div>

            {publishTestMode ? (
              <div className="notice warning">Publish test mode is on. Publish actions update Review Pilot only and do not send replies to Google.</div>
            ) : null}

            <p className="review-body">{selected.text || "No review text was provided."}</p>

            <section className="risk-panel">
              <div className="panel-head compact">
                <h3>Risk assessment</h3>
                <span className={riskChipClass(selected)}>{riskLabel(selected)}</span>
              </div>
              <div className="risk-list">
                {(selected.analysis?.publishRisk.reasons.length ? selected.analysis.publishRisk.reasons : defaultReasons(selected)).map((reason) => (
                  <div className="risk-row" key={reason}>
                    <ShieldAlert aria-hidden="true" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="draft-panel">
              <div className="panel-head compact">
                <div>
                  <h3>AI draft</h3>
                  <p>{selected.draft ? `Version ${selected.draft.version}` : "No draft yet"}</p>
                </div>
                <button className="button" disabled={Boolean(busy)} type="button" onClick={() => generate(selected.id)}>
                  <Sparkles aria-hidden="true" />
                  {selected.draft ? "Generate new draft" : "Generate reply draft"}
                </button>
              </div>
              <textarea readOnly value={selected.draft?.body ?? "No draft yet."} aria-label="AI draft" />
              {selected.draft ? (
                <form className="regenerate-row" onSubmit={(event) => regenerate(event, selected.id)}>
                  <input name="instruction" placeholder="Ask for changes, e.g. shorter or warmer" required />
                  <button className="button" disabled={Boolean(busy)} type="submit">Revise draft</button>
                </form>
              ) : null}
            </section>

            <div className="desktop-action-row">
              <button className="button primary" disabled={Boolean(busy)} type="button" onClick={() => publish(selected)}>
                <MessageSquareText aria-hidden="true" />
                {publishTestMode ? "Test publish" : "Publish reply"}
              </button>
              <button className="button" disabled={Boolean(busy)} type="button" onClick={() => manualHandled(selected.id)}>
                <CheckCircle2 aria-hidden="true" />
                Mark as handled
              </button>
            </div>
          </article>
        ) : null}

      </section>

      {!signedReview && mobileDetailOpen && selected ? (
        <div className="review-modal-backdrop" role="presentation" onClick={() => setMobileDetailOpen(false)}>
          <section
            className="review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="review-modal-head">
              <div>
                <h2 id="review-modal-title">{selected.author}</h2>
                <p>{selected.business} · {formatAge(selected.reviewCreatedAt)}</p>
              </div>
              <button className="icon-button" type="button" aria-label="Close review detail" onClick={() => setMobileDetailOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </div>

            <div className="review-modal-body">
              <div className="review-rating-line">
                <span className="star-row large" aria-label={`${selected.rating} stars`}>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} aria-hidden="true" className={index < selected.rating ? "filled" : ""} />
                  ))}
                </span>
                <strong>{selected.rating}/5</strong>
                {selected.googleMapsUrl ? (
                  <a href={selected.googleMapsUrl} target="_blank" rel="noreferrer">
                    Open Google listing
                    <ExternalLink aria-hidden="true" />
                  </a>
                ) : (
                  <button type="button" disabled title="Google place link is unavailable for this location">
                    Google link unavailable
                    <ExternalLink aria-hidden="true" />
                  </button>
                )}
              </div>

              {publishTestMode ? (
                <div className="notice warning">Publish test mode is on. Publish actions update Review Pilot only and do not send replies to Google.</div>
              ) : null}

              <p className="review-body">{selected.text || "No review text was provided."}</p>

              <section className="risk-panel">
                <div className="panel-head compact">
                  <h3>Risk assessment</h3>
                  <span className={riskChipClass(selected)}>{riskLabel(selected)}</span>
                </div>
                <div className="risk-list">
                  {(selected.analysis?.publishRisk.reasons.length ? selected.analysis.publishRisk.reasons : defaultReasons(selected)).map((reason) => (
                    <div className="risk-row" key={reason}>
                      <ShieldAlert aria-hidden="true" />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="draft-panel">
                <div className="panel-head compact">
                  <div>
                    <h3>AI draft</h3>
                    <p>{selected.draft ? `Version ${selected.draft.version}` : "No draft yet"}</p>
                  </div>
                  <button className="button" disabled={Boolean(busy)} type="button" onClick={() => generate(selected.id)}>
                    <Sparkles aria-hidden="true" />
                    {selected.draft ? "Generate new draft" : "Generate reply draft"}
                  </button>
                </div>
                <textarea readOnly value={selected.draft?.body ?? "No draft yet."} aria-label="AI draft" />
                {selected.draft ? (
                  <form className="regenerate-row" onSubmit={(event) => regenerate(event, selected.id)}>
                    <input name="instruction" placeholder="Ask for changes, e.g. shorter or warmer" required />
                    <button className="button" disabled={Boolean(busy)} type="submit">Revise draft</button>
                  </form>
                ) : null}
              </section>
            </div>

            <div className="review-modal-actions">
              <button className="button primary" disabled={Boolean(busy)} type="button" onClick={() => publish(selected)}>
                <MessageSquareText aria-hidden="true" />
                {publishTestMode ? "Test publish" : "Publish reply"}
              </button>
              <button className="button" disabled={Boolean(busy)} type="button" onClick={() => manualHandled(selected.id)}>
                <CheckCircle2 aria-hidden="true" />
                Mark as handled
              </button>
            </div>
          </section>
        </div>
      ) : null}

    </>
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

function riskLabel(review: ReviewDto): string {
  if (review.analysis?.publishRisk.requiresHumanReview || review.analysis?.severity === "red") {
    return "High risk";
  }
  if (review.analysis?.severity === "yellow") {
    return "Needs reply";
  }
  if (review.analysis?.severity === "green") {
    return "Low risk";
  }
  return review.status === "new" ? "Needs reply" : review.status;
}

function riskChipClass(review: ReviewDto): string {
  if (review.analysis?.publishRisk.requiresHumanReview || review.analysis?.severity === "red") {
    return "rp-chip danger";
  }
  if (review.analysis?.severity === "green") {
    return "rp-chip success";
  }
  return "rp-chip warning";
}

function defaultReasons(review: ReviewDto): string[] {
  if (review.rating <= 2) {
    return ["Low rating needs careful owner review.", "Reply will be public on Google."];
  }
  if (!review.draft) {
    return ["No draft exists yet.", "Generate and review before publishing."];
  }
  return ["Public reply action.", "Review tone before sending to Google."];
}

function formatAge(value: string | null): string {
  if (!value) {
    return "2h ago";
  }
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.round(hours / 24)}d ago`;
}

function csrfHeader(): Record<string, string> {
  const token = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("rp_csrf="))
    ?.slice("rp_csrf=".length);
  return token ? { "X-CSRF-Token": decodeURIComponent(token) } : {};
}
