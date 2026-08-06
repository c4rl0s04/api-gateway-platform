---
name: Gateway Control
description: A route-led control plane for gateway operations and trust.
colors:
  route-red: "#b4232f"
  route-red-deep: "#941b26"
  canvas: "#f5f1ee"
  surface: "#fcfaf8"
  surface-raised: "#fffdfa"
  surface-subtle: "#eee9e6"
  ink: "#282122"
  ink-soft: "#63595a"
  ink-faint: "#6e6364"
  line: "#d9d1cd"
  line-strong: "#b9ada8"
typography:
  display:
    fontFamily: "Geist Sans, sans-serif"
    fontSize: "clamp(3rem, 6vw, 5.25rem)"
    fontWeight: 590
    lineHeight: 0.96
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Geist Sans, sans-serif"
    fontSize: "clamp(1.875rem, 3.6vw, 3rem)"
    fontWeight: 590
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Geist Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Geist Sans, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 650
    lineHeight: 1.4
  metadata:
    fontFamily: "Geist Mono, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  control: "4px"
  surface: "8px"
  status: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "80px"
components:
  button-primary:
    backgroundColor: "{colors.route-red}"
    textColor: "{colors.surface-raised}"
    rounded: "{rounded.control}"
    height: "52px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.route-red-deep}"
    textColor: "{colors.surface-raised}"
    rounded: "{rounded.control}"
  navigation-active:
    backgroundColor: "#f8e7e8"
    textColor: "{colors.route-red}"
    rounded: "{rounded.control}"
    height: "44px"
  field:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "8px 12px"
---

# Design System: Gateway Control

## Overview

**Creative North Star: "The Request Path"**

Gateway Control uses the request lifecycle as its organizing structure. A thin vermilion rail connects identity, routing, policy, and upstream trust; controls attach to the stage they affect. The visual system is operational, low-density, and matte rather than promotional or card-driven.

Light mode uses warm paper-like neutrals; dark mode shifts to aubergine-charcoal surfaces rather than pure black. Red is reserved for the active path, primary actions, focus, and current navigation.

**Key Characteristics:**

- Flat warm surfaces separated by 1px rules
- One continuous red route as the signature geometry
- Strong Geist Sans hierarchy with mono reserved for real metadata
- Large intentional whitespace and a strict 4px/8px rhythm
- Authored technical line icons with consistent 1.75px strokes

## Colors

The palette is restrained: warm neutrals carry the interface and deep vermilion communicates active routing and action.

### Primary

- **Route Vermilion** (#b4232f): Primary actions, active navigation, route rails, focus, and selected geometry.
- **Deep Route Vermilion** (#941b26): Hover state for light-mode primary actions.

### Neutral

- **Warm Canvas** (#f5f1ee): Light-mode page ground.
- **Control Surface** (#fcfaf8): Sidebar and authentication surface.
- **Raised Paper** (#fffdfa): Inputs and secondary controls.
- **Warm Ink** (#282122): Primary copy; never replace with pure black.
- **Soft Ink** (#63595a): Body and supporting copy.
- **Faint Ink** (#6e6364): Small metadata; this is the lightest permitted small-text neutral.
- **Warm Rule** (#d9d1cd): Default divider and container line.

Dark mode uses #181516 canvas, #1e1a1b surface, #252021 raised surface, #f2ece9 ink, #bdb2af soft ink, and #a89d99 faint ink. The primary dark action uses #b8323d with #fff8f6 text; brighter #f15b65 is reserved for lines and non-body accents.

**The Red Route Rule.** Red identifies the current route or decisive action; it does not fill large sections or decorate passive content.

## Typography

**Display Font:** Geist Sans (sans-serif fallback)
**Body Font:** Geist Sans (sans-serif fallback)
**Label/Mono Font:** Geist Mono (monospace fallback)

**Character:** Geist Sans is compact and professional at operational sizes, while its large, tightly tracked display setting gives the portal a clear point of view. Geist Mono appears only for roles, protocol names, measurements, and other technical metadata.

### Hierarchy

- **Display** (590, clamp(48px, 6vw, 84px), 0.96): Home and authentication thesis statements; maximum tracking is -0.04em.
- **Headline** (590, clamp(30px, 3.6vw, 48px), 1.02): Major architectural sections.
- **Title** (620–650, 18–32px): Page, route-stage, and component titles.
- **Body** (400, 13–16px, 1.55–1.65): Explanatory copy kept to roughly 44–58 characters per line in focal regions.
- **Label** (650, 10–14px): Navigation, buttons, and operational labels.
- **Metadata** (400–540, 10–22px): Protocol and tabular data only, with tabular numerals for metrics.

**The Mono Evidence Rule.** Use Geist Mono only when the content is code, protocol, role, state, or measurement—not as a generic technical costume.

## Layout

All spacing follows a 4px base and favors 8px multiples. Desktop application layout uses a 208px sticky navigation rail and a fluid workspace capped at 1240px. Major sections use 64–80px separation; closely related controls use 8–16px gaps.

The Home request path is horizontal across four equal stages on wide screens, becomes two columns below 980px, and becomes a single vertical rail below 760px. Login uses a two-field split with context on the left and action on the right, stacking context above authentication on compact screens. Mobile navigation becomes a two- or three-column top matrix, and no surface may create horizontal document overflow.

Proxy inventory uses a flat six-column operational row on wide screens, collapses lower-value counts at tablet widths, and becomes labeled stacked data below 760px. Proxy detail preserves the same visual order at every breakpoint: identity and runtime state, deployment path, immutable revision evidence, deployment history, then product exposure.

## Elevation & Depth

The system is flat by default. Depth comes from tonal surface changes, 1px dividers, and whitespace. Content sections and navigation do not use shadows. The only shadow is the modal elevation, a broad low-opacity warm-ink shadow used to preserve focus during an interruptive task.

**The Flat Control Plane Rule.** Operational content stays flat; do not wrap sections in floating cards or combine a border with a decorative shadow.

## Shapes

Controls use crisp 4px corners, modals use 8px corners, and small status labels may use fully rounded ends. The signature request nodes are circles connected by 1px rails. Borders are always 1px. Authored icons use a 24px coordinate system, rounded line caps, and consistent 1.75px strokes; the Gateway mark alone uses square caps and a heavier 3px route stroke.

## Components

### Buttons

- **Shape:** Crisp 4px corners; standard height 40px and primary authentication height 52px.
- **Primary:** Route Vermilion with #fff8f6 text, 16px horizontal padding, and 650 weight.
- **Hover / Focus:** Hover deepens the red; focus uses a 2px red outline and tinted 3px ring. Press scales to 0.97 over 140ms with exponential ease-out.
- **Secondary:** Raised Paper background, Warm Ink text, and a Strong Warm Rule border.

### Cards / Containers

Operational sections are not cards. Use flat surfaces and dividers. A route link is a compact 44px bordered control with a 4px corner; it may tint pale red on hover but never lifts.

### Inputs / Fields

Fields use Raised Paper, Warm Ink, a 1px Strong Warm Rule, 4px corners, and 8px × 12px padding. Focus uses the global red outline/ring. Disabled controls reduce opacity but preserve legible labels.

### Navigation

Desktop navigation is a fixed-width warm surface with 44px rows. The active route uses pale red fill, red text, and a 2px edge marker. Mobile navigation becomes a compact top matrix and moves the active marker to the top edge.

### Request Path

Four circular nodes and a continuous 1px vermilion rail organize Home. Destinations attach below the stage they control. On compact screens the path rotates vertically without changing its semantic order.

### Authentication Trust Rail

Identity, Session, and Control plane form a three-node rail. OIDC is the only active method. JWT and mTLS are non-interactive rows with explicit “Coming soon” labels. The form enters once over 280ms with cubic-bezier(0.23, 1, 0.32, 1), already visible at 0.72 opacity, moving 8px along the horizontal route and revealing its clip edge. Reduced motion replaces this with a near-instant fade.

### Proxy Inventory

The inventory is a ruled operational register, not a table inside a card. Each row leads with proxy and organization identity, then route evidence, compact environment markers, revision/product counts, and state. Search and filters occupy one shallow control rail. Country and Stage are independent multi-select facets; Organization and State are single-select facets. Applied values remain visible as removable 4px-corner chips, and committed filter state is encoded in the URL. Runtime synchronization is shown above the register as a single live status line.

Desktop facets open focused anchored overlays with draft-and-apply behavior for multi-selection. On compact screens, one Filters control reveals a flat inline sheet containing the same four facets; active chips remain outside the sheet so the current result context never disappears.

### Deployment Path

Environments are grouped by region and ordered QUAL → PPROD → PROD. Circular nodes and a red rule communicate promotion direction; deployed nodes expose the exact revision and public origin. Deployment forms disable invalid promotions before submission while preserving Management API errors as explicit remediation guidance.

### Revision Workspace

Immutable revisions form a two-pane evidence workspace separated only by rules. The index identifies revision, base path, operation count, and deployment count. The selected revision exposes content hash, source downloads, and expandable operation-policy pipelines. On compact screens the index becomes a horizontal strip above the evidence pane.

## Do's and Don'ts

### Do:

- **Do** attach gateway controls to the request stage they affect.
- **Do** keep red contrast at WCAG AA or better for normal text and actions.
- **Do** use 4px/8px spacing increments and more space above sections than below headings.
- **Do** preserve clear loading, zero, error, disabled, focus, and reduced-motion states.
- **Do** let dark mode use warm aubergine-charcoal surfaces so red remains controlled.

### Don't:

- **Don't** build equal icon-heading-text card grids or nest cards inside cards.
- **Don't** use pure black, neutral gray, gradients, glass effects, or heavy default shadows.
- **Don't** use red as a large section background or as decoration without state meaning.
- **Don't** substitute a system default font, generic thin icon library, or emoji for the authored visual language.
- **Don't** present planned authentication methods as enabled controls.
