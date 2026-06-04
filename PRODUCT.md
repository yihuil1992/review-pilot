# Product

## Register

product

## Product Summary

Review Pilot is a mobile-first review operations tool for a single-owner local business. It helps the owner connect Google Business Profile locations, triage unhandled reviews, generate AI reply drafts, test or publish responses, mark reviews handled, and manage time-sensitive notification tasks.

The product is built for a practical owner workflow: open the app on a phone, see what needs attention, handle one review safely, and move on.

## Users

Primary users:

- Single-owner local business operators.
- Trusted operations assistants who handle reviews for the owner.

Typical usage context:

- Between customer work sessions.
- On a phone more often than a desktop.
- Under time pressure, with limited patience for admin clutter.
- With customer-facing replies that need enough context and caution before publishing.

## Product Purpose

Review Pilot reduces missed reviews and makes replies faster without removing owner judgment.

The product should:

- Pull reviews from connected Google Business Profile locations.
- Present a unified review queue by default instead of forcing location-by-location work.
- Allow optional location filtering inside review workflows.
- Generate reply drafts that can be reviewed and edited before any publish action.
- Make test mode explicit so owners know whether Google will be updated.
- Track handled state so old reviews do not keep resurfacing.
- Manage Twilio notification tasks for due sends, retries, cancellations, and operational follow-up.
- Keep sensitive credentials under the owner's control in a self-hosted setup.

Success means the owner can confidently clear review work from a phone in short sessions.

## Core Surfaces

### Home

Home is the command summary. It should show live operational counts and the most urgent work, not demo data or fake dashboard decoration.

Home should answer:

- How many reviews still need handling?
- What is due now?
- Are any notification tasks waiting?
- Where should I go next?

### Reviews

Reviews is the primary work surface.

Expected behavior:

- The default queue combines all active locations.
- Location filtering is available, but not the central model of the app.
- On mobile, tapping a review opens a detail modal.
- The detail view shows reviewer, location, age, rating, Google link, review text, risk notes, draft state, and publish/handled actions.
- Generate draft creates a new reply draft.
- Revise draft improves the current draft using user instructions.
- Test publish records the intended publish action without sending to Google when test mode is on.
- Publish actions must never feel ambiguous.

### Tasks

Tasks manages notification work such as scheduled Twilio links, due sends, retries, failed sends, and cancellations.

The page should feel like an operations queue. Controls must visibly reflect whether an action is available, running, successful, failed, or canceled.

### Settings

Settings is production configuration, not a demo fixture page.

It should:

- Show what is configured without exposing secrets.
- Use masked values or configured states for encrypted tokens.
- Keep connected accounts and locations compact.
- Explain Google OAuth callback configuration clearly.
- Explain Codex device-code login clearly: the owner opens the authorization link in their own browser, while the hosted server polls for completion.
- Avoid decorative taxonomy pills or long raw lists unless they serve a real task.

## Brand Personality

Calm, capable, precise, and mobile-native.

Review Pilot should feel like a dependable daily operations tool: quiet enough for repeated use, polished enough to trust with customer-facing replies, and direct enough that the next action is obvious.

Avoid metaphor-heavy product language. The product is a review operations queue.

## Design Principles

- Make the next action obvious on every screen.
- Prefer a unified operational view, with filters where they help.
- Optimize mobile review handling before desktop density.
- Keep setup, review triage, and notification tasks as distinct surfaces.
- Remove controls that do not perform real work.
- Use familiar product UI patterns so owners trust the tool quickly.
- Expose risk, test mode, and publish status before customer-facing actions.
- Treat generated AI text as a draft requiring owner review.
- Avoid fake filler data in production-facing screens.

## Product Non-goals

Review Pilot is not:

- A marketing website.
- A generic CRM.
- A multi-tenant agency dashboard.
- A social media inbox.
- A full Google Business Profile management suite.
- A place for decorative analytics that do not change owner action.

## Anti-references

Avoid marketing-site hero styling, decorative dashboards, oversized SaaS cards, dense desktop-only admin screens, fragile mobile layouts, nonfunctional icon buttons, fake search controls, and settings pages that look like seeded demo data.

## Accessibility & Inclusion

Aim for WCAG AA contrast, keyboard-accessible forms and actions, visible focus states, reduced-motion-safe transitions, and controls that remain large enough for mobile touch use.

Product copy should be plain and operational. Errors should appear in toasts or bounded messages that do not hide essential context.
