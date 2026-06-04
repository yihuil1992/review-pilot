---
name: Review Pilot
description: Mobile-first review operations for a single-owner local business.
colors:
  primary: "#0B6F8F"
  primary-hover: "#085D78"
  background: "#F4F8FA"
  surface: "#FFFFFF"
  surface-raised: "#FBFDFE"
  ink: "#16202A"
  muted: "#53626F"
  border: "#D8E2E8"
  focus: "#0B6F8F33"
  success: "#147A51"
  warning: "#B7791F"
  danger: "#B42318"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.214
    letterSpacing: "0"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.385
    letterSpacing: "0"
  metadata:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.333
    letterSpacing: "0"
rounded:
  card: "12px"
  control: "10px"
  chip: "999px"
  modal: "14px"
spacing:
  unit: "4px"
  row: "8px"
  mobile-page: "16px"
  desktop-page: "24px"
  mobile-card: "16px"
  desktop-card: "20px"
  section: "20px"
motion:
  fast: "120ms"
  base: "180ms"
  slow: "240ms"
  modal: "260ms"
  ease-out-quart: "cubic-bezier(0.25, 1, 0.5, 1)"
  ease-out-quint: "cubic-bezier(0.22, 1, 0.36, 1)"
  ease-out-expo: "cubic-bezier(0.16, 1, 0.3, 1)"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  card-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  chip-status:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
    padding: "4px 10px"
  input-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
---

# Design System: Review Pilot

## 1. Product Posture

Review Pilot is a mobile-first review operations tool for an owner-operator. It is not a marketing dashboard and not a generic admin console. The product should feel like a calm daily work queue: open the app, see what needs attention, handle one review safely, move on.

The interface favors clarity over decoration. Every screen should answer three questions quickly:

- What needs attention right now?
- Is this action safe to send or only a test?
- What is the next useful tap?

The design language is crisp, bright, and operational: ice-blue canvas, porcelain surfaces, graphite type, disciplined teal actions, and compact status language. It should feel polished enough to trust, but simple enough to use with one hand.

## 2. Brand

The mark combines a review conversation shape with a forward cursor. It communicates "reply, review, send" without looking like a chat app or a video app. The favicon uses the compact cursor mark so browser tabs stay legible at small sizes.

Brand usage rules:

- Use the image logo asset in the app shell instead of rebuilding the mark with inline SVG.
- Keep the mark inside its native square crop; do not add another visible outer frame.
- Pair the mark with `Review Pilot` and the subtitle `Mobile review ops`.
- Avoid metaphor-heavy subtitles. The product is a review operations queue.

## 3. Color System

The palette is deliberately narrow. Teal identifies action and selection; green, amber, and red identify operational state.

Primary:

- **Command Teal** `#0B6F8F`: primary actions, selected navigation, selected filters, active rows.
- **Deep Command Teal** `#085D78`: hover and pressed state for primary actions.

Neutrals:

- **Ice Canvas** `#F4F8FA`: page background.
- **Porcelain Surface** `#FFFFFF`: cards, sheets, modals, forms, popovers.
- **Raised Porcelain** `#FBFDFE`: subtle grouped controls and secondary panels.
- **Graphite Ink** `#16202A`: primary text and icons.
- **Slate Metadata** `#53626F`: helper text, timestamps, descriptions.
- **Cool Border** `#D8E2E8`: dividers, strokes, input borders.

Status:

- **Handled Green** `#147A51`: connected, logged in, sent, saved, healthy.
- **Setup Amber** `#B7791F`: needs reply, due, warning, test mode.
- **Risk Red** `#B42318`: errors, failed sends, destructive actions, blockers.

Rules:

- Teal is rare and functional. Do not use it as decoration.
- Status colors must describe real state, not visual variety.
- Do not introduce purple gradients, beige themes, glass panels, or marketing-style color washes.

## 4. Typography

Use Inter with system fallbacks everywhere. Product screens need fixed, predictable type sizes. Do not scale font sizes with viewport width and do not use negative letter spacing.

- **Display**: 32px / 40px / 700. Desktop page titles only.
- **Headline**: 28px / 34px / 700. Mobile page titles and major views.
- **Title**: 20px / 28px / 700. Panel headings, review names, settings groups.
- **Body**: 15px / 24px / 400. Review text, form help, task descriptions.
- **Label**: 13px / 18px / 600. Buttons, filters, field labels, status labels.
- **Metadata**: 12px / 16px / 400. Timestamps, source labels, compact secondary details.
- **Mono**: ui-monospace only for command output, codes, IDs, and logs.

## 5. Layout

Mobile is the primary product surface. Desktop should feel like a wider version of the same workflow, not a separate enterprise dashboard.

Mobile app shell:

- Sticky top bar with logo, product name, and short subtitle.
- No hamburger button unless there is an actual menu.
- Fixed bottom navigation with Home, Reviews, Tasks, Settings.
- Minimum touch target: 44px.
- Primary action bars are fixed to the bottom of modals or task surfaces when the action must remain available.

Desktop app shell:

- Left navigation rail with product identity and four clear sections.
- Content uses constrained operational panels, not nested decorative cards.
- Desktop may place queue and detail side by side, but mobile interaction patterns remain the source of truth.

Content density:

- Cards are for repeated rows, modals, or genuinely framed tools.
- Do not put cards inside cards.
- Long lists should be scannable, with visible status and compact metadata.
- Empty or demo data should not be shown unless it reflects a real unavailable state.

## 6. Core Screens

Home:

- Summarize live operational counts and urgent work.
- Do not show a random location as the main identity if the product is operating across all locations.
- Remove search and notification controls unless they perform a real function.

Reviews:

- On mobile, tapping a review opens a detail modal.
- The list should not keep a desktop selected-row affordance on mobile.
- The modal header stays fixed so the reviewer name, location, age, and close action remain available.
- Review text, risk assessment, AI draft, and publish actions are vertically ordered by decision flow.
- Google links should point to the relevant listing or review surface when available. If only listing-level linking is possible, label it clearly as `Open Google listing`.

Tasks:

- Treat notification tasks as an operational queue, not a demo status board.
- Remove menu icons that do not open anything.
- Action buttons should make state visible immediately: running, sent, failed, canceled, or unavailable.

Settings:

- Settings should feel like production configuration, not a fixture browser.
- Show configured-but-secret values with masked placeholders, such as `set` or a masked suffix.
- Keep account and location lists compact. Use summaries first, details on demand.
- Avoid taxonomy pills such as owner/domain/codex/google/twilio unless they are actionable filters.
- Codex browser login copy should explain device-code authorization clearly: the user opens the link in their own browser, then the server session becomes authorized after polling or refresh.

## 7. Components

Buttons:

- Primary buttons use Command Teal with white text.
- Secondary buttons are white with Cool Border and Graphite Ink.
- Disabled buttons keep their shape and become lower contrast.
- Active press may move down by 1px; do not use exaggerated bounce.

Inputs and selects:

- 44px minimum height.
- 10px radius.
- Cool Border at rest, teal border plus focus ring on focus.
- Custom selects should match the location/model dropdown style: compact trigger, floating porcelain menu, teal selected row, readable hover states.

Chips:

- Filter chips are compact and pill-shaped.
- Selected filters use teal.
- Status chips use semantic tints only.

Review rows:

- Avatar, name, rating, age, short text, and reply state should fit without awkward wrapping.
- Mobile rows open details; they should not require selecting, scrolling up, and scrolling back down.
- Active styling is desktop-only unless it clarifies a current modal origin.

Modals:

- Mobile review detail modals use a sticky header and sticky action footer.
- Body content scrolls independently between header and footer.
- Backdrop should dim the app without hiding context completely.
- Close buttons use the same rounded control language as other buttons.

Toasts:

- Use Sonner for transient success and error messages.
- Do not place long errors inside the modal body if they can push important context out of view.
- Toast close buttons must be visible, compact, and aligned with the toast style.

## 8. Motion

Motion should make the interface feel responsive, not animated for its own sake.

- Fast: 120ms for press and micro feedback.
- Base: 180ms for hover, focus, color, and border changes.
- Slow: 240ms for popovers, toasts, and row entrance.
- Modal: 260ms for overlay entrance.
- Respect reduced-motion preferences.

Use motion for:

- Button press feedback.
- Row hover and active states.
- Popover and dropdown entrance.
- Modal and toast entrance.
- Switch/thumb movement.

Avoid:

- Decorative background movement.
- Large page transitions.
- Motion that changes layout or causes text reflow.

## 9. Accessibility And UX Rules

- All controls need visible keyboard focus.
- Buttons, rows, and bottom nav items should meet 44px touch targets on mobile.
- Text must never overflow or collide with neighboring controls.
- Color cannot be the only signal for status.
- Long generated text and logs must scroll inside bounded areas.
- Publish test mode must be visible before any publish action.
- Destructive or public-facing actions must be explicit and reversible where possible.

## 10. Implementation Notes

The current implementation uses Next.js, Tailwind CSS, shadcn/ui primitives, lucide-react icons, and Sonner toasts. Prefer those building blocks before adding new UI dependencies.

Primary files:

- `apps/web/app/globals.css`: design tokens, layout, motion, dropdowns, modals, toasts.
- `apps/web/components/app-shell.tsx`: app shell, navigation, brand placement.
- `apps/web/components/logo-mark.tsx`: brand asset mount.
- `apps/web/app/reviews/reviews-client.tsx`: review queue, detail modal, draft actions.
- `apps/web/app/settings/settings-client.tsx`: production settings UI.

When extending the app, preserve the current product posture: mobile review operations first, decorative dashboard patterns last.
