# Personal Site — Product Spec

_Synthesized from founding conversation. This is the canonical reference for what is being built and why._

---

## Vision

A personal site built around a collection of items — clothing, artifacts, souvenirs — each tied to memories, places, and a specific era of life. The product is not a blog. It is a **memory palace** with a fashion-forward interface: items are the primary unit of content, and every view is a different lens on the same collection.

The aesthetic is **clinical luxury** — Rick Owens showroom meets the Matrix loading room. Pure white void. No decoration. No chrome. The items carry all the visual weight.

---

## Design Principles

- **Mobile is the primary target.** Every layout, interaction, and animation decision is designed for a phone screen first. Desktop is an enhancement.
- **No scroll hijacking. Ever.** Vertical page scroll is never intercepted. Horizontal wardrobe navigation uses click-drag (desktop) and swipe (mobile), not the scroll wheel.
- **Minimum 48px tap targets** on all interactive elements.
- **Items are the primary unit.** Blog posts exist but are secondary. The schema is designed around items, extended to accommodate posts.

---

## Content Model

One unified Sanity document type: `content`. Views are lenses, not separate data types.

### Content

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | `string` | yes | |
| `body` | `PortableText` | yes | Rich text, the main article body |
| `slug` | `slug` | yes | URL path |
| `content_type` | `'item' \| 'post'` | yes | Extensible enum |
| `item_type` | `'clothing' \| 'artifact' \| 'souvenir'` | if item | |
| `cover_image` | `SanityImage` | no | Used in wardrobe sleeve and article header |
| `gallery` | `SanityImage[]` | no | Inline photos for the article |
| `tags` | `string[]` | no | Filterable; shared across wardrobe and feed |
| `locations` | `Location[]` | no | Ordered by `sort_date`; first = acquisition |

App logic derives:
- `acquired_at` → earliest location `sort_date`
- `retired_at` → latest location `sort_date` (if item has left rotation)
- `show_in_wardrobe` → `true` when `content_type === 'item'`

### Location (embedded type)

| Field | Type | Required | Notes |
|---|---|---|---|
| `label` | `string` | yes | City, venue, etc. |
| `coordinates` | `{ lat, lng }` | yes | Used for globe view |
| `sort_date` | `date` | no | Machine-readable, used for ordering |
| `date_label` | `string` | no | Display override: "around April 2023", "April 1–30" |
| `body` | `PortableText` | no | Memory/story for that specific place |
| `images` | `SanityImage[]` | no | Photos from that location |

If `date_label` is set, show it. If not, format `sort_date`. Ordering always uses `sort_date`.

---

## Routes

```
/              Landing — minimal, two paths ("choose your own adventure")
/wardrobe      Wardrobe view (primary entry point)
/globe         Globe view (geographic lens on the collection)
/feed          Feed / library view
/[slug]        Article — shallow-routed from any view without reload
```

The landing page is intentionally minimal at this stage.

---

## Views

### 1. Wardrobe View `/wardrobe` ★ Primary

The centerpiece of the product. A 3D arc carousel of item sleeves floating in a white void.

**Visual spec:**
- Pure white infinite background — no rail, no hooks, no chrome
- Items float in space, each encased in a **glossy transparent acrylic sleeve** (like a shrink-wrapped magazine or a collectible sneaker in an acrylic box)
- The acrylic plastic catches light: subtle top rim highlight, diagonal gloss sweep, rotation-coupled refraction streak
- Items have a **soft rectangular drop shadow** beneath them — every item, not just the center. Shadow shape is blocky (matches the item's rectangular form), light source is above and slightly behind
- Approximately 5 items visible simultaneously

**Arc geometry (two decoupled angles):**
1. **Card face rotation** (`rotAngle`): how much the card face is angled away from the viewer. Center = 0°. ±1 items ≈ 45°. ±2 items ≈ 70–80° (edge-on slivers). Fast-saturating function.
2. **Arc position** (`posAngle`): the gentle circular arc that determines X/Z world position. Controls lateral spread and depth falloff. Looser than the face rotation — items have clear physical separation.

These two angles are intentionally decoupled so each can be tuned independently.

**Interaction:**
- Swipe (mobile) or click-drag (desktop) navigates the carousel
- No scroll wheel hijacking
- Centered item's title + minimal metadata fades in below it (museum-label style). Text dimensions are pre-computed with `pretext` (`prepare` + `layout`) so the fade container is sized before paint — no layout shift or reflow during the animation.
- Side items are silent — no visible text
- Items snap to nearest whole position on release

**Selection:**
- Tap/click the centered item → URL updates shallowly, full article content fades and rises up from below the wardrobe
- No page reload, wardrobe stays mounted

### 2. Globe View `/globe` *(Phase 5a/5b — next)*

A visual storytelling interface — not a dashboard. The globe is an alternative lens on the same collection, organized by geography instead of wardrobe order. Editorial, minimal, intentional. Same clinical-luxury aesthetic as the rest of the site.

**Globe design:**
- True 3D wireframe sphere (WebGL via Three.js / R3F)
- Black wireframe with medium-density grid lines
- **Country border outlines** rendered on the surface — no fill, no surface labels, no satellite imagery
- Pure white background — same void as the wardrobe
- Soft shadow beneath the globe grounding it in space

**Globe interaction:**
- **Drag** to rotate (click-drag on desktop, touch-drag on mobile)
- **Zoom** allowed (scroll wheel on desktop, pinch on mobile) — constrained to continent-level max, no street-level
- **Slow idle rotation** when no interaction — resumes after a few seconds of inactivity
- Selecting a pin does **not** stop idle rotation
- No scroll hijacking — globe interaction is contained within the globe viewport

**Entrance animation:**
- Every navigation to `/globe` triggers a **0.75s zoom-in** — the globe starts small/distant and scales up to its resting size
- Quick and purposeful, not dramatic

#### Pins (Points of Interest)

- Solid red dots anchored to the globe surface, rotating with it
- Each pin represents a **manually curated location group** (e.g., "Tokyo, Japan" may contain items from Shibuya, Harajuku, Shimokitazawa) — grouping is editorial, not proximity-based
- A location must have **one or more items** to appear as a pin
- **Selected state:** pin pulses gently and gains an outline ring to indicate it is active

#### Interaction Model

**Desktop — two-tier interaction:**

1. **Hover (preview state):**
   - A thin black connector line animates outward from the pin
   - A lightweight **tooltip** appears at the end of the line: location name + item count only
   - Globe does **not** shift position
   - Tooltip disappears when hover ends (unless clicked)

2. **Click (locked state):**
   - Globe **slides left and shrinks slightly** to ~50–65% viewport width
   - Full **detail panel** appears to the right with the connector line linking pin → panel
   - Panel remains until user clicks elsewhere, clicks another pin, or clicks the close button
   - Clicking empty globe space closes the panel and returns the globe to center

**Mobile — single-tier interaction:**

1. **Tap a pin:**
   - Globe **slides left and shrinks slightly**
   - Detail panel **slides in from the right** as a partial overlay (does not cover the full screen — globe remains partially visible in the shadowed left area)
   - No connector line on mobile (spatial relationship is clear from the layout)
   - Panel dismissed by tapping outside, swiping it away, or tapping the close button

2. **Tap empty space:** rotates globe slightly, closes any open panel

No hover state exists on mobile.

#### Connector Line (Desktop Only)

- Thin, black, straight line from the selected pin to the detail panel
- Animates outward (grows from pin toward panel) on interaction
- No curvature, no glow — clean and editorial
- Present in both hover-tooltip and click-panel states

#### Detail Panel

**Positioning:**
- **Desktop:** Anchored to the right side of the viewport when globe shifts left. Connector line bridges the gap. Panel can shift slightly vertically based on pin position but always stays within readable bounds (no edge clipping).
- **Mobile:** Slides in from the right edge as a partial-screen overlay. Globe remains partially visible behind it on the left.
- Only **one panel open at a time** — tapping a new pin closes the current panel and opens the new one.

**Visual design:**
- Hard-edge card — **no border radius**
- Thin border or very subtle shadow — minimal chrome
- Clean editorial spacing, modern sans-serif typography
- Close button (×) in the top-right corner

**Panel content:**

| Section | Content |
|---|---|
| Header | Location name in caps (e.g., "TOKYO, JAPAN"), optional item count |
| Item list | Vertical scroll list showing ~3.5 items (partial item visible at bottom as scroll affordance) |
| Each item | Framed thumbnail image (not full-bleed) + title (caps) + sub-location label + year |

- Scroll is **vertical, inside the panel only** — completely independent from globe rotation/zoom
- Scroll does not affect the globe in any way

**Item tap behavior:**
- **Phase 5a/5b:** Desktop: globe shifts to left sliver, article fills right 70%. Mobile: navigates to `/[slug]`
- **Phase 5c (future):** Camera zooms in closely onto that pin's location on the globe, then the article page fades in over the zoomed view — cinematic transition

#### Globe Layout States

| State | Desktop | Mobile |
|---|---|---|
| Default (no selection) | Globe centered, full width | Globe centered, full width |
| Pin hovered | Globe stays centered, tooltip appears near pin | N/A |
| Pin selected / panel open | Globe slides left + shrinks (~50–65% width), panel on right | Globe slides left + shrinks, panel slides in from right |
| Panel closed | Globe animates back to center, full width | Globe animates back to center |

#### Interaction Priority

When interactions overlap, priority is:
1. **Panel interaction** (scroll list, tap item) — highest
2. **Pin interaction** (hover/tap)
3. **Globe interaction** (drag to rotate, zoom) — lowest

#### Motion Principles

All animation is subtle and purposeful:
- Globe idle rotation: slow, constant
- Connector line: grows outward from pin
- Panel: fades and slides in lightly
- Globe position shift: smooth spring animation
- **No** bounce, overshoot, or flashy transitions

#### Data Requirements

Pin grouping is manual. A `globe_group` string field on the Location embedded type declares which globe pin a location belongs to (e.g., `"Tokyo, Japan"`). All locations sharing the same `globe_group` string cluster under one pin. Locations without `globe_group` are excluded from the globe. Pin coordinates are the centroid of grouped locations. See `Phase 5A.markdown` for full implementation details.

#### Future Extensions (Out of Scope — Phase 5c and beyond)

- **Travel traces:** Animated lines on the globe showing where an item has traveled over time (item A: Seoul → Tokyo → New York). Belongs to the Timeline view, not the globe MVP.
- **Camera-zoom article transition:** Tapping an item in the panel triggers a cinematic zoom into the pin location before the article fades in (Phase 5c).
- **Pin color encoding** by item category (clothing vs. artifact vs. souvenir)
- **Time-based filtering** — slider or timeline integration to show pins from a specific era
- **Cluster expansion** — zooming into a dense region auto-expands grouped pins into individual sub-locations

#### Non-Goals (Phase 5a/5b)

- No 3D realism, satellite imagery, or terrain
- No glowing sci-fi effects — the wireframe aesthetic is editorial, not cyberpunk
- No cluttered legends, filters, or search (v1)
- No complex zoom system beyond continent-level constraint

### 3. Feed View *(Phase 6 — future)*

Standard fallback. Every item and post is reachable here. Deferred because the feed's design will likely be influenced by the globe view.

- Card list: cover image, title, date, tags
- Filterable and sortable by tag system (same tags as wardrobe)
- The RSS/shareable version of the site
- Currently minimal — a simple vertical list

---

## Article / Item Detail Page `/[slug]`

Reached by tapping the centered wardrobe item or a feed card.

**Layout:**
- Full cover image at the top
- `body` rendered as rich text (PortableText → React components). Use `pretext` (`prepareRichInline` + `layoutWithLines`) for any text that animates in — e.g. staggered line reveals, typewriter effects, or height-driven transitions — to get accurate line boundaries without DOM measurement.
- Photo gallery: `gallery` images inline with the story
- Location / travel timeline: ordered list of `locations[]`, each with label, `date_label` or formatted `sort_date`, and optional `body` text and images
- Time context: when item entered life, "still in rotation" or when it left

**Routing behavior:**
- URL updates silently with `router.push('/[slug]', { scroll: false })` — no reload, no scroll jump
- Content fades/slides up from below the wardrobe
- The wardrobe naturally scrolls off the top as the user reads

---

## Hero-to-Navbar Transition *(Phase 4 — ✅ complete)*

As the user scrolls the wardrobe off the top of the page while reading an article:

1. The centered acrylic sleeve (gloss, rim highlight, drop shadow — the full visual) **shrinks and migrates into the top-right of the navbar** as a miniature sleeve-shaped icon
2. A wardrobe-scoped `WardrobeNavbar` shows a home/back button on the left; the right side hosts an invisible measurement anchor where the transit element lands
3. The transit element is a single fixed-position `motion.div` rendered outside the 3D perspective context, driven by `useScroll` → `useTransform` over `scrollYProgress`, using `transform: translate() scale()` (no layout-affecting properties)

The transit element **is** the navbar icon at `progress = 1` — there is no swap, no handoff, no second mounted icon.

On return (tap navbar icon):
- `scrollToShell()` triggers `scrollIntoView({ behavior: 'smooth' })`
- Scroll reversal drives the same spring-wrapped `transitProgress` back to 0
- The icon **expands and transforms back** into the full wardrobe sleeve at its carousel position
- Wardrobe is alive again, same item selected

**Architecture:** `WardrobeProvider` (Client Component) owns all shared state via `WardrobeContext` — `activeIndex`, source/target rect measurements, `transitProgress`, and `scrollToShell`. `WardrobeCarousel`, `WardrobeNavbar`, and `WardrobeTransit` are siblings under the provider and communicate exclusively through context. See `phase4.md` for full implementation details.

---

## Technical Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js (App Router) | Shallow routing, SSG, mobile-optimized, Vercel-native |
| Language | TypeScript | Sanity schema types flow into component props |
| Styling | Tailwind CSS | Mobile-first utility classes |
| Animation | Framer Motion | Gesture handling, scroll-driven transforms, spring-wrapped transit animation |
| Text measurement | `@chenglou/pretext` | DOM-free text layout for animation — measures line count, height, and per-line ranges without triggering reflow |
| Wardrobe 3D | CSS 3D transforms | No canvas required; GPU-composited; performant on mobile |
| Globe (next) | Three.js / R3F | Phase 5a/5b |
| CMS | Sanity | MCP-driven updates, image CDN, GROQ queries, hosted Studio at `/studio` |
| Hosting | Vercel | Zero-config Next.js, edge CDN |

### Wardrobe 3D — How the Arc Works

Each item sits on an invisible circle in 3D space. For an item at arc angle `θ`:

```
position:  translateX(R · sin θ)  translateZ(-R · (1 - cos θ))
facing:    rotateY(-rotAngle)     ← separate function, faster saturation
```

Drag/swipe adjusts a single `offset` MotionValue. All item angles derive from `offset` via `useTransform`. No React re-renders during animation.

### Text Rendering & Animation — pretext

All text that is measured, animated, or rendered outside the normal document flow uses [`@chenglou/pretext`](https://github.com/chenglou/pretext). This includes:

- **Wardrobe label fade-in** — `prepare(title, font)` + `layout(prepared, maxWidth, lineHeight)` gives the container's final height before the fade starts. No `getBoundingClientRect`, no layout shift.
- **Article animated reveals** — if lines stagger in or a height transition plays, `layoutWithLines` provides per-line character ranges. Feed these directly into Framer Motion keyframes.
- **Any virtualized or overflow-checked text** — use `walkLineRanges` for streaming line iteration without materializing a large array.

The font string passed to `pretext` must exactly match the CSS `font` shorthand applied to the element (family, size, weight, style). Rich inline content (mixed weights or sizes) uses `prepareRichInline` with an array of `{ text, font }` segments.

### Sanity + MCP Update Flow

Sanity's MCP server allows AI-driven content updates. The intended workflow:

> "Add a new item — my black MA-1 bomber, picked up in Seoul in October 2023, tag it clothing"

→ Claude pushes structured content directly to Sanity via the MCP server, no manual Studio editing required for routine updates.

---

## Build Phases

| Phase | Status | Description |
|---|---|---|
| 1 | ✅ Done | Scaffolding — Next.js, Sanity schema, routing, seed data |
| 2 | ✅ Done | Wardrobe carousel — 3D arc, acrylic sleeve aesthetic, drag interaction, shadows |
| 3 | ✅ Done | Article detail — PortableText body, photo gallery, location timeline |
| 3b | ✅ Done | Wardrobe → article content reveal (scroll down to read) |
| 4 | ✅ Done | Hero-to-navbar transition — scroll-driven transit element, WardrobeProvider/Context, WardrobeNavbar |
| 5a | 🔲 Next | Globe scene & interaction — wireframe globe, country borders, pins, detail panel, drag/zoom, hover/click connectors |
| 5b | 🔲 Next | Globe article integration — desktop split-view (globe sliver + article), mobile navigation, pin-to-title connector, globe persistence |
| 5c | 🔲 Future | Globe polish — panel position tracking during rotation, camera-zoom article transition, travel traces |
| 6 | 🔲 Future | Feed view polish — filtering, sorting, tag UI |
| — | 🔲 Ongoing | Deploy to Vercel |
| — | 🔲 Ongoing | Real product images with transparent backgrounds |

---

## Open Questions / Decisions Not Yet Made

- Landing page `/` design — currently a stub; eventual "choose your own adventure" between wardrobe and feed
- Exact PortableText component set — which block types are supported in body content
- Tag taxonomy — currently free-form strings; whether to constrain to a fixed set
