---
name: Review Pilot
description: Mobile-first review operations with a Hoshikuzu atlas design language.
colors:
  night:
    background: "#02040a"
    surface: "#05070dcc"
    raised: "#101827cc"
    ink: "#f8fafc"
    muted: "#aeb8c7"
    hairline: "#ffffff24"
    signal: "#aad7dc"
    lamp: "#f5f0dc"
  archive:
    background: "#f7f8f3"
    surface: "#fffffce0"
    raised: "#edf0eacc"
    ink: "#172033"
    muted: "#66727f"
    hairline: "rgba(36, 48, 64, 0.18)"
    signal: "#477c86"
    lamp: "#91652c"
typography:
  display:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "32px"
    fontWeight: 300
    lineHeight: 1.05
    letterSpacing: "0"
  title:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 550
    lineHeight: 1.35
    letterSpacing: "0.02em"
  body:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0"
  label:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  panel: "2px"
  control: "2px"
  chip: "999px"
motion:
  fast: "120ms"
  base: "180ms"
  slow: "240ms"
  ease-out-quart: "cubic-bezier(0.25, 1, 0.5, 1)"
  ease-out-quint: "cubic-bezier(0.22, 1, 0.36, 1)"
  ease-out-expo: "cubic-bezier(0.16, 1, 0.3, 1)"
---

# Design System: Review Pilot

## 1. Product Posture

Review Pilot is still a mobile-first review operations tool for an owner-operator. The interface now uses the Hoshikuzu visual language: a quiet archival star atlas translated into a practical work queue.

The product should feel like an instrument panel filed into a private atlas. It is precise, dim in night mode, clean in archive mode, and restrained enough for repeated daily use.

Every screen should answer:

- What needs attention right now?
- Is this action safe to send or only a test?
- What is the next useful tap?

## 2. Theme System

Review Pilot supports two local presentation themes:

- `night`: default deep-space atlas mode.
- `archive`: light archive sheet mode for brighter environments.

Implementation contract:

- HTML attribute: `data-atlas-mode="night" | "archive"`.
- Night mode also applies the `dark` class for shadcn dark variants.
- Browser storage key: `review-pilot-atlas-mode`.
- Initial theme is written by `apps/web/app/layout.tsx` before hydration.
- Toggle UI lives in `apps/web/components/theme-toggle.tsx` and is mounted in `apps/web/components/app-shell.tsx`.

Theme state is client-local. It does not affect API, database, queue, or owner settings contracts.

## 3. Color

The palette comes from Hoshikuzu.

Night mode:

- Deep Space `#02040a`: page canvas.
- Ink Night `#05070dcc`: panels, dialogs, popovers.
- Observatory Panel `#101827cc`: secondary rows and controls.
- Starlight `#f8fafc`: primary text.
- Muted Starlight `#aeb8c7`: secondary text.
- Hairline `#ffffff24`: borders and rules.
- Pale Cyan `#aad7dc`: focus, selected signals, active markers.
- Soft Amber `#f5f0dc`: decisive primary actions.

Archive mode:

- Archive Sheet `#f7f8f3`: page canvas.
- Archive Surface `#fffffce0`: panels, dialogs, popovers.
- Archive Raised `#edf0eacc`: secondary rows and controls.
- Archive Ink `#172033`: primary text and primary actions.
- Archive Muted `#66727f`: secondary text.
- Archive Hairline `rgba(36, 48, 64, 0.18)`: borders and rules.
- Archive Signal `#477c86`: focus and selection.

Status colors remain semantic, but their surfaces are quiet alpha tints. Success, warning, danger, and pending must describe real operational state.

## 4. Typography

Use Geist with system fallbacks. The new hierarchy follows the Hoshikuzu index voice:

- Page titles use light-weight display type, 32px on mobile and 26px in desktop command bars.
- Panel titles use compact medium weight.
- Body copy stays normal case, readable, and practical.
- Labels, nav items, chips, and compact controls may use uppercase with tracking.

Do not use display-scale text inside cards, dialogs, forms, or task rows.

## 5. Layout

Mobile remains the primary surface.

Mobile app shell:

- Sticky atlas top bar with brand and theme toggle.
- Fixed bottom navigation with compact uppercase labels.
- Minimum touch target remains 44px for product actions.

Desktop app shell:

- Left rail uses a translucent atlas surface with hairline border.
- Navigation uses text, icons, and a one-pixel active marker instead of filled teal slabs.
- The command strip is compact and translucent.

Content surfaces:

- Panels use 2px corners, one-pixel borders, and no default drop shadow.
- Elevation appears only for dialogs, toasts, popovers, or focused controls.
- Rows rely on hairline borders, subtle raised fills, and active markers.

## 6. Components

Buttons:

- Primary buttons use starlight/ink contrast in night mode and ink/archive contrast in archive mode.
- Secondary and icon buttons are transparent or low-opacity controls with hairline borders.
- Button labels may be uppercase and tracked because they are atlas controls.

Chips:

- Chips are metadata tags, not saturated SaaS pills.
- Selected chips brighten with the primary action color.
- Semantic chips use quiet status tints.

Cards and panels:

- Static panels are flat by default.
- Hover and active states may brighten the border and raised fill.
- Avoid nested card styling. Use rows, separators, and grouped panels.

Forms:

- Inputs use transparent or low-opacity fills with one-pixel borders.
- Focus uses the theme signal ring.
- Disabled states reduce opacity without changing layout.

Modals and toasts:

- Modals use the atlas panel shadow and preserve sticky mobile headers and footers.
- Toasts use Hoshikuzu panel styling, not Sonner rich colors.

## 7. Core Screens

Home:

- Summary counters read like atlas measurements: light-weight numerals, small tracked labels, and rare signal color.

Reviews:

- The queue and detail panel use row-based atlas surfaces.
- Risk, draft, and publish sections keep the decision order intact.
- Publish test mode remains visibly warning-toned before any public-facing action.

Tasks:

- The sync card and due queue feel like operational instruments.
- Running, sent, failed, pending, and canceled states must be visible in both themes.

Settings:

- Settings remains production configuration.
- Account and location rows use compact archive-panel structure.
- Masked secrets and configured states stay readable without exposing values.

## 8. Motion

Motion is short and stateful:

- 120ms for press feedback.
- 180ms for hover, border, color, and focus changes.
- 240ms for popovers, toasts, and modal entrance.

Reduced motion must remain supported. No decorative page choreography.

## 9. Accessibility And UX Rules

- Text must meet AA contrast in both themes.
- Theme toggle needs an accessible label that names the next theme.
- Color cannot be the only status signal.
- Mobile rows, nav, and action buttons must remain large enough for touch.
- Public publish actions must remain explicit.

## 10. Implementation Notes

Primary files:

- `apps/web/app/globals.css`: Hoshikuzu tokens, night/archive variables, shell styling, component overrides, motion.
- `apps/web/app/layout.tsx`: initial theme script and root HTML attributes.
- `apps/web/components/theme-toggle.tsx`: client theme toggle and local persistence.
- `apps/web/components/app-shell.tsx`: app shell placement for the toggle.
- `apps/web/components/product-ui.tsx`: semantic status badge and alert classes.

Prefer shadcn components and semantic tokens. Do not add new UI dependencies for the theme.
