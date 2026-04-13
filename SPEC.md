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
/feed          Feed / library view
/[slug]        Article — shallow-routed from either view without reload
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

### 2. Feed View `/feed`

Standard fallback. Every item and post is reachable here.

- Card list: cover image, title, date, tags
- Filterable and sortable by tag system (same tags as wardrobe)
- The RSS/shareable version of the site
- Currently minimal — a simple vertical list

### 3. Globe View *(Phase 6 — future)*

Deferred, but the data model is globe-ready from day one.

- Wireframe globe: country borders only, no fill, no surface labels
- Pins at each item's acquisition location with a thumbnail
- Hover: animated lines trace where the item has traveled with the owner
- Click: goes to the item article
- Built with Three.js / R3F once wardrobe and article are solid

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
| Globe (future) | Three.js / R3F | Saved for Phase 6 |
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
| 5 | 🔲 Next | Feed view polish — filtering, sorting, tag UI |
| 6 | 🔲 Future | Globe view — Three.js wireframe globe with travel traces |
| — | 🔲 Ongoing | Deploy to Vercel |
| — | 🔲 Ongoing | Real product images with transparent backgrounds |

---

## Open Questions / Decisions Not Yet Made

- Landing page `/` design — currently a stub; eventual "choose your own adventure" between wardrobe and feed
- Exact PortableText component set — which block types are supported in body content
- Tag taxonomy — currently free-form strings; whether to constrain to a fixed set
- Globe aesthetic details — exact wireframe style, pin design, animation timing
