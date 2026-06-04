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
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.214
    letterSpacing: "0"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 600
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
    fontWeight: 500
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
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
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

## 1. Overview

**Creative North Star: "The Owner's Flight Deck"**

Review Pilot is a calm operations cockpit for a business owner who needs to handle public reviews quickly, often from a phone, without losing judgment or control. The system should feel precise and dependable: every screen makes the next action visible, every risk state is labeled plainly, and every customer-facing publish action has enough context around it to feel safe.

The visual language is restrained product UI, not a marketing site. It rejects decorative dashboards, oversized SaaS cards, dense desktop-only admin screens, and fragile mobile layouts where primary actions fall below the fold or compete with setup noise.

**Key Characteristics:**
- Mobile-first triage, with the current review and primary actions before long lists.
- A cool, porcelain work surface with graphite text and one disciplined teal-blue primary.
- Familiar navigation, buttons, forms, chips, and list rows.
- Semantic color used only for status, risk, and action clarity.
- Dense enough for operations, never cramped enough to feel like a database admin screen.

## 2. Colors

The palette is a restrained operations palette: ice-backed neutrals, graphite text, one saturated teal-blue command color, and clear semantic statuses.

### Primary
- **Command Teal**: The single primary action color. Use it for publish/generate actions, active navigation, selected queue states, and the most important control on the screen.
- **Deep Command Teal**: The hover and pressed state for primary actions.

### Secondary
- **Setup Amber**: Use for setup needed, due soon, needs reply, and non-blocking caution.
- **Handled Green**: Use for connected, handled, low risk, sent, and healthy state.
- **Risk Red**: Use for high risk, failed, destructive states, and publish blockers.

### Neutral
- **Ice Canvas**: The app background. It keeps the interface bright without becoming beige, cream, or paper-like.
- **Porcelain Surface**: Cards, panels, forms, and editor surfaces.
- **Raised Porcelain**: Soft grouped controls, hover rows, and secondary surfaces.
- **Graphite Ink**: Primary text.
- **Slate Metadata**: Secondary text, timestamps, helper text, and non-primary icons.
- **Cool Border**: Separators, input strokes, card outlines, and row boundaries.

### Named Rules

**The One Command Rule.** The primary teal must stay rare. It is for the next decisive action, active navigation, or selected state, not decoration.

**The Semantic Truth Rule.** Amber, red, and green must describe operational state. Never use semantic colors to make a screen more colorful.

## 3. Typography

**Display Font:** Inter, with system fallbacks.
**Body Font:** Inter, with system fallbacks.
**Label/Mono Font:** Inter for labels; ui-monospace only for logs, IDs, and generated output.

**Character:** The type system is quiet, utilitarian, and exact. It uses one sans family so labels, data, and controls feel native and trustworthy.

### Hierarchy
- **Display** (600, 32px, 40px): Used sparingly for the desktop workspace title.
- **Headline** (600, 28px, 34px): Mobile page titles and major app views.
- **Title** (600, 20px, 28px): Panel headings, selected review title, setup blocks.
- **Body** (400, 15px, 24px): Review text, draft body, settings help, task descriptions.
- **Label** (500, 13px, 18px): Field labels, button text, filter labels, compact rows.
- **Metadata** (400, 12px, 16px): Time, source, status metadata, secondary row details.

### Named Rules

**The Product Type Rule.** No fluid type, no display fonts in buttons or labels, and no negative letter spacing. Product screens use fixed, readable sizes.

## 4. Elevation

Depth is conveyed through tonal layering, borders, and very restrained shadows. Cards and rows are flat at rest. Elevation appears only where it clarifies hierarchy: active mobile bottom bars, overlays, popovers, and selected list rows.

### Shadow Vocabulary
- **Raised Panel** (`0 8px 20px rgba(22, 32, 42, 0.06)`): Use only for overlays, fixed mobile bars, and selected panels that need to sit above content.
- **Focus Ring** (`0 0 0 3px #0B6F8F33`): Required for keyboard focus on controls and actionable rows.

### Named Rules

**The Flat Work Surface Rule.** Surfaces are flat by default. If a card needs a large soft shadow to be legible, the layout hierarchy is wrong.

## 5. Components

### Buttons
- **Shape:** Tactile but restrained, with gently curved controls (10px radius).
- **Primary:** Command Teal background with white text, 44px tall on mobile and 40px tall on desktop.
- **Hover / Focus:** Hover shifts to Deep Command Teal; focus uses a 3px Command Teal ring.
- **Secondary:** Porcelain surface, Cool Border stroke, Graphite Ink text.
- **Disabled:** Same geometry, reduced opacity, no color shift.

### Chips
- **Style:** 999px radius, 4px vertical padding, explicit labels, semantic tint only when stateful.
- **State:** Filters can be neutral or selected in Command Teal. Status chips use green, amber, or red tints with readable text.

### Cards / Containers
- **Corner Style:** 12px radius. Cards must never exceed 16px.
- **Background:** Porcelain Surface on Ice Canvas.
- **Shadow Strategy:** Flat at rest; selected rows use border and tonal fill before shadow.
- **Border:** Cool Border at 1px.
- **Internal Padding:** 16px on mobile, 20px on desktop.

### Inputs / Fields
- **Style:** 44px minimum height, 10px radius, Porcelain Surface, Cool Border stroke.
- **Focus:** Command Teal border plus 3px translucent focus ring.
- **Error / Disabled:** Red semantic border for errors; disabled controls keep shape and reduce contrast without disappearing.

### Navigation
- **Desktop:** 232px dark rail with Review Pilot branding, primary sections, active rail item in Command Teal, account/location pinned near the bottom.
- **Top Command Strip:** 64px desktop strip for location, date/filter/search, primary generate action, and notifications.
- **Mobile:** 56-60px top app bar and fixed safe-area bottom nav. Bottom nav has four clear items and 44px minimum touch targets.

### Review Operations Workspace
- **Desktop:** Three-column workspace: queue filters/list, selected review/draft editor, setup health/task/activity column.
- **Mobile:** Current review detail comes before long queue lists. The publish/generate actions live in a fixed bottom action bar above navigation.

## 6. Do's and Don'ts

### Do:
- **Do** keep the next action obvious on every screen.
- **Do** place the current review, risk, draft, and publish/generate actions above long lists on mobile.
- **Do** use familiar product UI patterns so the owner trusts the tool quickly.
- **Do** expose risk and status plainly before publishing customer-facing replies.
- **Do** keep touch targets at least 44px tall.
- **Do** use the exact token palette from the frontmatter when implementing UI.

### Don't:
- **Don't** use marketing-site hero styling.
- **Don't** use decorative dashboards.
- **Don't** use oversized SaaS cards.
- **Don't** create dense desktop-only admin screens.
- **Don't** ship fragile mobile layouts where primary actions fall below the fold or compete with setup noise.
- **Don't** use purple gradients, beige paper themes, glassmorphism, gradient text, nested cards, or giant stats heroes.
- **Don't** invent non-standard controls for flavor. Familiarity is the product virtue.
