"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CheckCircle2, ChevronDown, ExternalLink, Loader2, MapPin, MessageSquareText, RefreshCw, ShieldAlert, Sparkles, Star, X } from "lucide-react";
import { toast } from "sonner";

import { demoDraft, demoLocations, demoReviews } from "@/lib/demo-data";
import { demoMode } from "@/lib/demo-mode";
import { assessReplyPublishRisk } from "@/lib/reply-risk";

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
  draft: null | {
    id?: string;
    aiBody?: string;
    body: string;
    version: number;
    instruction: string | null;
    userEdited?: boolean;
    editedAt?: string | null;
  };
  semanticJob?: null | {
    id: string;
    type: string;
    status: string;
    errorCode: string | null;
    errorMessage: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  };
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
type DraftEdit = { version: number; body: string };
type ReviewsPayload = { items?: ReviewDto[]; total?: number; limit?: number };

export function ReviewsClient() {
  const searchParams = useSearchParams();
  const signedReviewId = searchParams.get("review");
  const signedLink = searchParams.get("link");
  const locationMenuRef = useRef<HTMLDivElement | null>(null);
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [signedReview, setSignedReview] = useState<ReviewDto | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [publishTestMode, setPublishTestMode] = useState(false);
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [locationId, setLocationId] = useState("all");
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [draftEdits, setDraftEdits] = useState<Record<string, DraftEdit>>({});

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

  useEffect(() => {
    if (!mobileDetailOpen || signedReview) {
      return;
    }

    const scrollY = window.scrollY;
    const previousBodyStyle = {
      position: document.body.style.position,
      top: document.body.style.top,
      right: document.body.style.right,
      left: document.body.style.left,
      width: document.body.style.width,
      overflow: document.body.style.overflow
    };

    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.right = "0";
    document.body.style.left = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.position = previousBodyStyle.position;
      document.body.style.top = previousBodyStyle.top;
      document.body.style.right = previousBodyStyle.right;
      document.body.style.left = previousBodyStyle.left;
      document.body.style.width = previousBodyStyle.width;
      document.body.style.overflow = previousBodyStyle.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [mobileDetailOpen, signedReview]);

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
  const selectedReadOnly = Boolean(selected && isReviewComplete(selected));
  const selectedDraftPending = Boolean(selected && isSemanticPending(selected));
  const selectedDraftEdited = Boolean(selected && isDraftEdited(selected));
  const locationOptions = useMemo(
    () => [{ id: "all", businessName: "All locations" }, ...locations],
    [locations]
  );
  const selectedLocationLabel = locationOptions.find((location) => location.id === locationId)?.businessName ?? "All locations";

  useEffect(() => {
    if (!selected || !isSemanticPending(selected)) {
      return;
    }

    const interval = window.setInterval(() => {
      if (signedReviewId && signedLink) {
        void loadSignedReview(signedReviewId, signedLink);
      } else {
        void loadReviews();
      }
    }, 2500);

    return () => window.clearInterval(interval);
  }, [selected?.id, selected?.status, signedReviewId, signedLink, locationId]);

  async function loadSignedReview(reviewId: string, link: string) {
    if (demoMode) {
      const review = (demoReviews as unknown as ReviewDto[]).find((item) => item.id === reviewId) ?? (demoReviews[0] as unknown as ReviewDto);
      setPublishTestMode(true);
      setSignedReview(review);
      return;
    }

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
    if (demoMode) {
      const data = locationId === "all"
        ? (demoReviews as unknown as ReviewDto[])
        : (demoReviews as unknown as ReviewDto[]).filter((review) => review.businessLocationId === locationId);
      setReviews(data);
      setReviewTotal(data.length);
      setSelectedId((current) => {
        if (current && data.some((review) => review.id === current)) {
          return current;
        }
        return data[0]?.id ?? null;
      });
      return;
    }

    const query = locationId === "all" ? "" : `?locationId=${encodeURIComponent(locationId)}`;
    const response = await fetch(`${apiBase}/reviews${query}`, { credentials: "include" });
    const data: unknown = await response.json().catch(() => []);
    if (!response.ok) {
      toast.error(responseMessage(data) ?? "Login required or reviews failed to load");
      return;
    }
    const payload = normalizeReviewsPayload(data);
    setReviews(payload.items);
    setReviewTotal(payload.total);
    setSelectedId((current) => {
      if (current && payload.items.some((review: ReviewDto) => review.id === current)) {
        return current;
      }
      return payload.items.find((review: ReviewDto) => review.id === signedReviewId)?.id ?? payload.items[0]?.id ?? null;
    });
  }

  async function loadLocations() {
    if (demoMode) {
      setLocations((demoLocations as unknown as BusinessLocation[]).filter((location) => location.googleOpenStatus !== "CLOSED_PERMANENTLY"));
      return;
    }

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
    if (demoMode) {
      setPublishTestMode(true);
      return;
    }

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
      if (demoMode) {
        await sleep(240);
        applyDemoReviewAction(path, body);
        toast.success(success);
        return true;
      }

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

  function applyDemoReviewAction(path: string, body: Record<string, unknown>) {
    const match = path.match(/\/reviews\/([^/]+)\/(?:signed\/)?(generate|regenerate|publish|manual-handled)/);
    const reviewId = match?.[1];
    const action = match?.[2];
    if (!reviewId || !action) {
      return;
    }

    const updateReview = (review: ReviewDto): ReviewDto => {
      if (review.id !== reviewId) {
        return review;
      }
      if (action === "publish") {
        return {
          ...review,
          status: "published",
          publishedReply: String(body.body ?? review.draft?.body ?? ""),
          publishTestMode: true
        };
      }
      if (action === "manual-handled") {
        return { ...review, status: "manual_handled" };
      }

      const instruction = action === "regenerate" ? String(body.instruction ?? "") : "";
      const nextVersion = (review.draft?.version ?? 0) + 1;
      return {
        ...review,
        draft: {
          aiBody: demoDraft(review.author, review.business, instruction),
          body: demoDraft(review.author, review.business, instruction),
          version: nextVersion,
          instruction: instruction || null,
          userEdited: false,
          editedAt: null
        }
      };
    };

    setReviews((current) => current.map(updateReview));
    setSignedReview((current) => (current ? updateReview(current) : current));
  }

  function findReview(reviewId: string) {
    return signedReview?.id === reviewId
      ? signedReview
      : reviews.find((review) => review.id === reviewId) ?? null;
  }

  function draftEditValue(review: ReviewDto): string {
    const edit = draftEdits[review.id];
    if (review.draft && edit?.version === review.draft.version) {
      return edit.body;
    }
    return review.draft?.body ?? "";
  }

  function setDraftEdit(review: ReviewDto, body: string) {
    const draft = review.draft;
    if (!draft) {
      return;
    }
    setDraftEdits((current) => ({
      ...current,
      [review.id]: { version: draft.version, body }
    }));
  }

  function clearDraftEdit(reviewId: string) {
    setDraftEdits((current) => {
      const next = { ...current };
      delete next[reviewId];
      return next;
    });
  }

  function isDraftEdited(review: ReviewDto): boolean {
    if (!review.draft) {
      return false;
    }
    return normalizeDraftBody(draftEditValue(review)) !== normalizeDraftBody(review.draft.aiBody ?? review.draft.body);
  }

  function publishBody(review: ReviewDto): string {
    return draftEditValue(review).trim();
  }

  function publishActionLabel(review: ReviewDto, testMode: boolean): string {
    if (testMode) {
      return isDraftEdited(review) ? "Test edited reply" : "Test publish";
    }
    return isDraftEdited(review) ? "Publish edited reply" : "Publish AI draft";
  }

  function publishSuccessLabel(review: ReviewDto): string {
    return isDraftEdited(review) ? "Edited reply published" : "AI draft published";
  }

  async function generate(reviewId: string) {
    const review = findReview(reviewId);
    if (review?.draft && isDraftEdited(review)) {
      const confirmed = window.confirm("Generate a new AI draft? Your edited text will be saved, then replaced when the new draft is ready.");
      if (!confirmed) {
        return;
      }
    }
    markReviewSemanticPending(reviewId, "analysis_pending");
    const completed = await post(
      signedActionPath(reviewId, "generate"),
      review?.draft ? { currentDraftBody: draftEditValue(review) } : {},
      "AI draft queued"
    );
    if (!completed) {
      await refreshCurrentReviews();
    }
  }

  async function manualHandled(reviewId: string) {
    const completed = await post(signedActionPath(reviewId, "manual-handled"), {}, "Review marked as handled");
    if (completed) {
      setMobileDetailOpen(false);
    }
  }

  async function publish(review: ReviewDto) {
    const body = publishBody(review);
    if (!body) {
      toast.error("No AI draft is available to publish");
      return;
    }
    const manualRisk = assessReplyPublishRisk({
      rating: review.rating,
      reviewText: review.text,
      replyBody: body,
      aiBody: review.draft?.aiBody ?? review.draft?.body ?? null
    });
    if (manualRisk.requiresHumanReview) {
      const confirmed = window.confirm(`Review this edited reply before publishing:\n\n${manualRisk.reasons.join("\n")}`);
      if (!confirmed) {
        return;
      }
    }
    const completed = await post(
      signedActionPath(review.id, "publish"),
      { body },
      publishTestMode ? "Test publish recorded. No Google reply was sent." : publishSuccessLabel(review)
    );
    if (completed) {
      clearDraftEdit(review.id);
      setMobileDetailOpen(false);
    }
  }

  async function regenerate(event: FormEvent<HTMLFormElement>, reviewId: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const instruction = String(form.get("instruction") ?? "");
    const review = findReview(reviewId);
    markReviewSemanticPending(reviewId, "regeneration_pending");
    const completed = await post(
      signedActionPath(reviewId, "regenerate"),
      { instruction, ...(review?.draft ? { currentDraftBody: draftEditValue(review) } : {}) },
      "AI draft regeneration queued"
    );
    if (completed) {
      formElement.reset();
    } else {
      await refreshCurrentReviews();
    }
  }

  async function refreshCurrentReviews() {
    if (signedReviewId && signedLink) {
      await loadSignedReview(signedReviewId, signedLink);
      return;
    }
    await loadReviews();
  }

  function markReviewSemanticPending(reviewId: string, status: "analysis_pending" | "regeneration_pending") {
    const updateReview = (review: ReviewDto): ReviewDto => review.id === reviewId ? { ...review, status } : review;
    setReviews((current) => current.map(updateReview));
    setSignedReview((current) => current ? updateReview(current) : current);
  }

  function signedActionPath(reviewId: string, action: "generate" | "regenerate" | "publish" | "manual-handled") {
    if (signedReviewId && signedLink) {
      return `/reviews/${reviewId}/signed/${action}?link=${encodeURIComponent(signedLink)}`;
    }
    return `/reviews/${reviewId}/${action}`;
  }

  return (
    <>
      <section className={`reviews-workspace ${signedReview ? "signed-workspace" : ""} ${signedReview && selectedReadOnly ? "signed-readonly" : ""}`}>
        {!signedReview ? (
          <aside className="review-queue-panel rp-card" aria-label="Review queue">
            <div className="panel-head">
              <div>
                <h2>Queue</h2>
                <p>{reviewQueueSummary(reviews.length, reviewTotal)}</p>
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

            {selectedReadOnly ? (
              <div className="notice success">{readOnlyNotice(selected)}</div>
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
                  <p>{draftStatusText(selected)}</p>
                </div>
                {!selectedReadOnly ? (
                  <button className="button" disabled={Boolean(busy) || selectedDraftPending} type="button" onClick={() => generate(selected.id)}>
                    {selectedDraftPending ? <Loader2 className="button-spinner" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                    {selectedDraftPending ? draftActionLabel(selected) : selected.draft ? "Generate new draft" : "Generate reply draft"}
                  </button>
                ) : null}
              </div>
              {selectedDraftPending ? (
                <div className="draft-pending-notice" role="status">
                  <Loader2 aria-hidden="true" />
                  <span>{draftPendingNotice(selected)}</span>
                </div>
              ) : null}
              {isSemanticFailed(selected) ? (
                <div className="draft-failed-notice" role="status">
                  <ShieldAlert aria-hidden="true" />
                  <span>{semanticFailureMessage(selected)}</span>
                </div>
              ) : null}
              {selectedDraftEdited ? (
                <div className="draft-edit-notice" role="status">
                  <CheckCircle2 aria-hidden="true" />
                  <span>Edited reply will be used for publish and draft revision.</span>
                </div>
              ) : null}
              <textarea
                readOnly={!canEditDraft(selected, selectedReadOnly)}
                value={selected.draft ? draftEditValue(selected) : draftTextareaValue(selected)}
                aria-label="Reply draft editor"
                onChange={(event) => setDraftEdit(selected, event.target.value)}
              />
              {selected.draft && !selectedReadOnly ? (
                <form className="regenerate-row" onSubmit={(event) => regenerate(event, selected.id)}>
                  <input name="instruction" placeholder="Ask for changes, e.g. shorter or warmer" disabled={selectedDraftPending} required />
                  <button className="button" disabled={Boolean(busy) || selectedDraftPending} type="submit">
                    {selected.status === "regeneration_pending" ? <Loader2 className="button-spinner" aria-hidden="true" /> : null}
                    {selected.status === "regeneration_pending" ? "Revising" : "Revise draft"}
                  </button>
                </form>
              ) : null}
            </section>

            {!selectedReadOnly ? (
              <div className="desktop-action-row">
                <button className="button primary" disabled={Boolean(busy) || selectedDraftPending} type="button" onClick={() => publish(selected)}>
                  <MessageSquareText aria-hidden="true" />
                  {publishActionLabel(selected, publishTestMode)}
                </button>
                <button className="button" disabled={Boolean(busy) || selectedDraftPending} type="button" onClick={() => manualHandled(selected.id)}>
                  <CheckCircle2 aria-hidden="true" />
                  Mark as handled
                </button>
              </div>
            ) : null}
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
                    <p>{draftStatusText(selected)}</p>
                  </div>
                  <button className="button" disabled={Boolean(busy) || selectedDraftPending} type="button" onClick={() => generate(selected.id)}>
                    {selectedDraftPending ? <Loader2 className="button-spinner" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                    {selectedDraftPending ? draftActionLabel(selected) : selected.draft ? "Generate new draft" : "Generate reply draft"}
                  </button>
                </div>
                {selectedDraftPending ? (
                  <div className="draft-pending-notice" role="status">
                    <Loader2 aria-hidden="true" />
                    <span>{draftPendingNotice(selected)}</span>
                  </div>
                ) : null}
                {isSemanticFailed(selected) ? (
                  <div className="draft-failed-notice" role="status">
                    <ShieldAlert aria-hidden="true" />
                    <span>{semanticFailureMessage(selected)}</span>
                  </div>
                ) : null}
                {selectedDraftEdited ? (
                  <div className="draft-edit-notice" role="status">
                    <CheckCircle2 aria-hidden="true" />
                    <span>Edited reply will be used for publish and draft revision.</span>
                  </div>
                ) : null}
                <textarea
                  readOnly={!canEditDraft(selected, selectedReadOnly)}
                  value={selected.draft ? draftEditValue(selected) : draftTextareaValue(selected)}
                  aria-label="Reply draft editor"
                  onChange={(event) => setDraftEdit(selected, event.target.value)}
                />
                {selected.draft ? (
                  <form className="regenerate-row" onSubmit={(event) => regenerate(event, selected.id)}>
                    <input name="instruction" placeholder="Ask for changes, e.g. shorter or warmer" disabled={selectedDraftPending} required />
                    <button className="button" disabled={Boolean(busy) || selectedDraftPending} type="submit">
                      {selected.status === "regeneration_pending" ? <Loader2 className="button-spinner" aria-hidden="true" /> : null}
                      {selected.status === "regeneration_pending" ? "Revising" : "Revise draft"}
                    </button>
                  </form>
                ) : null}
              </section>
            </div>

            <div className="review-modal-actions">
              <button className="button primary" disabled={Boolean(busy) || selectedDraftPending} type="button" onClick={() => publish(selected)}>
                <MessageSquareText aria-hidden="true" />
                {publishActionLabel(selected, publishTestMode)}
              </button>
              <button className="button" disabled={Boolean(busy) || selectedDraftPending} type="button" onClick={() => manualHandled(selected.id)}>
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

function normalizeReviewsPayload(payload: unknown): { items: ReviewDto[]; total: number; limit: number | null } {
  if (Array.isArray(payload)) {
    return { items: payload, total: payload.length, limit: null };
  }
  const value = isRecord(payload) ? payload as ReviewsPayload : {};
  const items = Array.isArray(value.items) ? value.items : [];
  return {
    items,
    total: typeof value.total === "number" ? value.total : items.length,
    limit: typeof value.limit === "number" ? value.limit : null
  };
}

function reviewQueueSummary(loaded: number, total: number): string {
  if (total > loaded) {
    return `Showing ${loaded} of ${total} unhandled`;
  }
  return `Showing ${loaded} unhandled`;
}

function riskLabel(review: ReviewDto): string {
  if (review.status === "analysis_pending") {
    return "Generating";
  }
  if (review.status === "regeneration_pending") {
    return "Revising";
  }
  if (isSemanticFailed(review)) {
    return "Generation failed";
  }
  if (review.status === "failed") {
    return "Failed";
  }
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
  if (isSemanticPending(review)) {
    return "rp-chip pending";
  }
  if (isSemanticFailed(review) || review.status === "failed") {
    return "rp-chip danger";
  }
  if (review.analysis?.publishRisk.requiresHumanReview || review.analysis?.severity === "red") {
    return "rp-chip danger";
  }
  if (review.analysis?.severity === "green") {
    return "rp-chip success";
  }
  return "rp-chip warning";
}

function isReviewComplete(review: ReviewDto): boolean {
  return review.status === "published" || review.status === "manual_handled";
}

function isSemanticPending(review: ReviewDto): boolean {
  return review.status === "analysis_pending" || review.status === "regeneration_pending";
}

function isSemanticFailed(review: ReviewDto): boolean {
  return review.status === "failed" && review.semanticJob?.status === "failed";
}

function canEditDraft(review: ReviewDto, readOnly: boolean): boolean {
  return Boolean(review.draft && !readOnly && !isSemanticPending(review) && !isSemanticFailed(review));
}

function draftStatusText(review: ReviewDto): string {
  if (review.status === "analysis_pending") {
    return review.draft ? `Generating new draft after version ${review.draft.version}` : "Generating draft";
  }
  if (review.status === "regeneration_pending") {
    return review.draft ? `Revising version ${review.draft.version}` : "Revising draft";
  }
  if (isSemanticFailed(review)) {
    return review.draft ? `Generation failed after version ${review.draft.version}` : "Generation failed";
  }
  if (review.draft?.userEdited) {
    return `Version ${review.draft.version}, edited`;
  }
  return review.draft ? `Version ${review.draft.version}` : "No draft yet";
}

function draftActionLabel(review: ReviewDto): string {
  return review.status === "regeneration_pending" ? "Revising" : "Generating";
}

function draftPendingNotice(review: ReviewDto): string {
  return review.status === "regeneration_pending"
    ? "Codex is revising this draft. The current text stays visible while the new version is prepared."
    : "Codex is generating a reply draft. This review will refresh automatically when it is ready.";
}

function draftTextareaValue(review: ReviewDto): string {
  if (review.draft?.body) {
    return review.draft.body;
  }
  if (isSemanticPending(review)) {
    return "Draft generation is running...";
  }
  if (isSemanticFailed(review)) {
    return "Draft generation failed. Check Codex in Settings, then try again.";
  }
  return "No draft yet.";
}

function readOnlyNotice(review: ReviewDto): string {
  if (review.status === "published") {
    return "This review has already been published. The signed link is now read-only.";
  }
  return "This review has already been marked as handled. The signed link is now read-only.";
}

function defaultReasons(review: ReviewDto): string[] {
  if (isSemanticFailed(review)) {
    return ["Codex could not finish the draft.", "Test the Codex runtime in Settings, then retry generation."];
  }
  if (review.rating <= 2) {
    return ["Low rating needs careful owner review.", "Reply will be public on Google."];
  }
  if (!review.draft) {
    return ["No draft exists yet.", "Generate and review before publishing."];
  }
  return ["Public reply action.", "Review tone before sending to Google."];
}

function semanticFailureMessage(review: ReviewDto): string {
  const error = review.semanticJob?.errorMessage ?? "";
  if (/not logged in|login|authorization|authentication/i.test(error)) {
    return "Codex is not authorized on this runtime. Complete Codex authorization in Settings, then retry generation.";
  }
  if (/spawn|ENOENT|not found|not recognized|command failed/i.test(error)) {
    return "Codex CLI is not available to the worker runtime. Test Codex in Settings, then retry generation.";
  }
  return "Codex could not finish this draft. Test the runtime in Settings, then retry generation.";
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function responseMessage(value: unknown): string | null {
  return isRecord(value) && typeof value.message === "string" ? value.message : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeDraftBody(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
