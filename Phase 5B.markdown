# Phase 5B — Globe Article Integration

_Requires Phase 5A to be complete. The globe scene, pins, detail panel, and all interaction states must be working before starting this phase._

_Read AGENTS.md before writing any Next.js code._

---

## Goal

Connect the globe's detail panel to article content. When a user taps an item in a globe pin's detail panel, they should be able to read the full article — with the experience differing significantly between desktop and mobile:

- **Desktop:** The globe shifts fully to the left edge, zooms into the selected pin, and article content fills the right ~70% of the screen. A connector line bridges the pin to the article title. The globe stays mounted.
- **Mobile:** The user navigates away from the globe entirely to a standalone article page. On return, the globe reloads from scratch (WebGL remount is acceptable).

---

## Table of Contents

1. [Desktop Article View](#1-desktop-article-view)
2. [Mobile Article View](#2-mobile-article-view)
3. [Route Structure](#3-route-structure)
4. [Globe-Specific ArticleReveal](#4-globe-specific-articlereveal)
5. [Pin-to-Title Connector](#5-pin-to-title-connector)
6. [Layout State Machine Update](#6-layout-state-machine-update)
7. [Globe State Persistence (Desktop)](#7-globe-state-persistence-desktop)
8. [Component Changes](#8-component-changes)
9. [File Inventory](#9-file-inventory)
10. [Implementation Order](#10-implementation-order)
11. [Documented Decisions & Nits](#11-documented-decisions--nits)

---

## 1. Desktop Article View

When the user clicks an item row in the detail panel on desktop:

### Transition sequence (~500ms total)

1. **Detail panel closes** — slides out to the right, same exit animation as normal panel close (~200ms)
2. **Globe shifts fully left** — from its current ~60% width (panel-open state) to ~25–30% width, pinned to the left edge of the viewport. Only a sliver of the globe is visible — enough to see the selected pin on the right edge of the globe.
3. **Globe zooms into the selected pin** — the camera smoothly zooms in so the pin's region fills the visible globe area. The pin should appear near the right edge of the visible globe sliver. OrbitControls disabled during this zoom.
4. **Article content fades in** on the right ~70% of the screen
5. **Pin-to-title connector draws** — thin black line from the selected pin to the article's title text (see Section 5)

### Visual layout (desktop article state)

```
┌──────────┬────────────────────────────────────────────────┐
│          │                                                │
│          │  × ─── (connector from pin to title) ───→      │
│  Globe   │                                                │
│  (sliver │   ARTICLE TITLE                                │
│   ~25%)  │   subtitle / metadata                          │
│          │                                                │
│   ● pin  │   Article body text flows here...              │
│   on     │   PortableText rendered content                │
│   right  │   Images, gallery, location timeline           │
│   edge   │                                                │
│          │              ↕ scrollable                       │
│          │                                                │
└──────────┴────────────────────────────────────────────────┘
```

### Key behaviors in article state

- **Globe is still mounted and live** — idle rotation continues (the pin drifts slowly; this is acceptable and even adds atmosphere)
- **Auto-rotate should be very slow or paused** while article is open — the user is reading, not exploring
- **Article area is independently scrollable** — scroll does not affect the globe
- **Only the article area scrolls** — the globe sliver is fixed, the article content scrolls vertically within its container
- **The pin remains selected and pulsing** on the globe surface
- **Globe interaction is disabled** while article is open — no drag-rotate, no zoom, no pin clicks. The globe is purely decorative in this state. Interaction resumes on article close.

### Exiting the article (desktop)

- **× button on the connector line** (same pattern as the click connector from 5A, but now bridging pin → article title)
- Alternatively, a close/back button in the article header area
- **Transition out:** Article fades out, connector retracts, globe zooms out and slides back to `panel-open` width (~60%), detail panel re-opens with the same pin selected
- This is the reverse of the entry transition

---

## 2. Mobile Article View

Mobile is simpler: **leave the globe entirely.**

When the user taps an item in the detail panel on mobile:
1. Navigate to `/[slug]` (the generic top-level article route, NOT `/globe/[slug]`)
2. The globe unmounts. WebGL context is destroyed.
3. The article page loads as a standard page (same as accessing it from the feed)
4. To return to the globe: browser back button or a nav link. The globe remounts from scratch — entrance animation plays, no state restoration. **This is acceptable.**

### Why not persist the globe on mobile?

- Mobile devices have tighter GPU/memory constraints — keeping a WebGL context alive in the background is wasteful
- The mobile globe interaction is already simpler (tap-only, no hover)
- The user's mental model on mobile is page-based navigation, not split-view
- The remount cost (~1–2s with the SVG fallback) is acceptable for a mobile-first MVP

---

## 3. Route Structure

### Desktop: nested route under globe layout

```
app/globe/
  layout.tsx         ← GlobeProvider (stays mounted)
  page.tsx           ← Returns null (globe index)
  [slug]/
    page.tsx         ← Article content (renders in the right 70%)
    loading.tsx      ← Loading skeleton while article fetches
```

**`app/globe/[slug]/page.tsx`** — Server Component:
- Fetches `contentBySlugQuery` (reuse existing query from `lib/queries.ts`)
- Returns article content wrapped in a globe-specific layout (not the wardrobe `ArticleReveal`)
- Passes `globe={true}` to `ArticleContent` (new prop, similar to existing `wardrobe` prop)

```tsx
import { client } from '@/lib/sanity'
import { contentBySlugQuery } from '@/lib/queries'
import type { ContentFull } from '@/lib/types'
import { notFound } from 'next/navigation'
import ArticleContent from '@/components/ArticleContent'
import GlobeArticleReveal from '@/components/globe/GlobeArticleReveal'

export default async function GlobeArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const item: ContentFull | null = await client.fetch(contentBySlugQuery, { slug })
  if (!item) return notFound()

  return (
    <GlobeArticleReveal>
      <ArticleContent item={item} globe />
    </GlobeArticleReveal>
  )
}
```

**`app/globe/[slug]/loading.tsx`** — Skeleton loading state:
```tsx
'use client'
import { Skeleton } from 'boneyard-js/react'

export default function Loading() {
  return (
    <div className="w-full">
      <Skeleton name="article-content" loading={true} animate="shimmer">{null}</Skeleton>
    </div>
  )
}
```

### Mobile: navigates to existing top-level route

Mobile navigates to `/[slug]` (already exists at `app/[slug]/page.tsx`). No new route needed.

### How the implementer distinguishes desktop vs mobile navigation

In `GlobeDetailItem.tsx`, the click handler checks `useIsMobile()`:

```typescript
const handleItemClick = (slug: string) => {
  if (isMobile) {
    router.push(`/${slug}`)       // leave globe entirely
  } else {
    router.push(`/globe/${slug}`, { scroll: false })  // nested route, globe stays mounted
  }
}
```

---

## 4. Globe-Specific ArticleReveal

**File:** `components/globe/GlobeArticleReveal.tsx`

A client component wrapper for article content when accessed from the globe. Different from the wardrobe's `ArticleReveal` because:

- No `motion.div` slide-up from below (the article fades in from the right, not below)
- The entrance animation is a **fade-in** (opacity 0→1, ~300ms) since the article area appears alongside the globe, not below a carousel
- No Skeleton wrapper needed (the globe's own loading state handles the transition)

```tsx
'use client'
import { motion } from 'framer-motion'

export default function GlobeArticleReveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full h-full overflow-y-auto"
    >
      {children}
    </motion.div>
  )
}
```

### ArticleContent changes

Add a `globe?: boolean` prop to `ArticleContent`:

```typescript
interface ArticleContentProps {
  item: ContentFull
  wardrobe?: boolean
  globe?: boolean
}
```

When `globe={true}`:
- **Show** cover image (unlike wardrobe mode which hides it)
- **Show** header metadata (title, date, tags)
- Possibly tighter `max-width` since the article area is ~70vw, not full width
- Adjust `max-w-2xl` → `max-w-xl` or similar for the narrower container

---

## 5. Pin-to-Title Connector

A thin black line from the selected pin (on the globe sliver) to the article's title text.

### Positioning

- **Start:** Selected pin's screen position — read from `pinPositionRef` (the same bridge from 5A)
- **End:** The left edge of the article title element. Use a ref on the title in `ArticleContent` (or `GlobeArticleReveal`) to get its bounding rect.
- The connector should be roughly horizontal (the pin is on the right edge of the globe sliver, the title is to the right of the globe)

### Visual

- Same style as the click connector from 5A: thin black SVG line, `pointer-events: none`
- **× dismiss button** at the midpoint of the line — tapping it closes the article and returns to panel-open state

### Animation

- **Draw-in:** After the article content has faded in, the connector draws from pin → title (~200ms)
- **Retract:** On article close, connector retracts toward the pin (~150ms), then article fades out

### Implementation

**File:** `components/globe/GlobeArticleConnector.tsx`

This is a **third connector component**, distinct from `GlobeHoverConnector` and `GlobeClickConnector`. It has a unique lifecycle (only exists in `article-open` state) and a unique endpoint (article title, not panel edge or tooltip).

The × button is identical in behavior to the click connector's × button — it's the primary close affordance.

### Start-point updates

The pin's screen position will drift slightly with idle rotation. The connector start point should update per frame (same RAF pattern as the other connectors, reading `pinPositionRef`). The end point (article title) is static unless the user scrolls the article — in which case the title may scroll off-screen. When the title is off-screen, the connector end should clamp to the top of the article area (so the line still has a visible endpoint).

---

## 6. Layout State Machine Update

Phase 5A defined two states (`default`, `panel-open`). This phase adds a third:

### State: `article-open` (desktop only)

| Property | Desktop |
|---|---|
| Globe container | Shrinks to ~25–30% width, pinned left |
| Globe camera | Zoomed into selected pin region |
| Globe interaction | Disabled (no drag, zoom, or pin clicks) |
| Globe auto-rotate | Very slow or paused |
| Detail panel | Not visible (exited) |
| Click connector | Not visible (exited) |
| Article area | ~70% width, right side, independently scrollable |
| Article connector | Visible (pin → title), with × dismiss |

### Transitions

```
default ←→ panel-open ←→ article-open
                              ↓
                          (mobile only: navigate away entirely)
```

**`panel-open` → `article-open`:**
1. Panel exit animation (~200ms)
2. Globe shrinks from ~60% → ~25% + camera zooms to pin (~400ms, spring)
3. Article content renders (Next.js navigation to `/globe/[slug]`)
4. `GlobeArticleReveal` fades in (~300ms)
5. Article connector draws (~200ms)

**`article-open` → `panel-open`:**
1. Article connector retracts (~150ms)
2. Article content fades out (~200ms)
3. Globe zooms out + expands from ~25% → ~60% (~400ms, spring)
4. Detail panel re-opens with same pin selected
5. Click connector redraws

**`article-open` → `default`:** (user closes article AND panel)
Unlikely but possible — chain through: `article-open` → `panel-open` → `default`.

### GlobeContext additions

```typescript
interface GlobeContextValue {
  // ... existing from 5A ...

  layoutState: 'default' | 'panel-open' | 'article-open'

  // Article-specific
  activeArticleSlug: string | null   // set when navigating to /globe/[slug]
  articleTitleRef: RefObject<HTMLHeadingElement | null>  // for connector endpoint
  closeArticle: () => void           // triggers reverse transition
}
```

### How GlobeProvider detects the article state

Use `usePathname()` — if the path matches `/globe/[something]` (not just `/globe`), set `layoutState = 'article-open'`. When pathname changes back to `/globe`, transition to `panel-open`.

```typescript
const pathname = usePathname()
const isArticleRoute = pathname.startsWith('/globe/') && pathname !== '/globe'
```

---

## 7. Globe State Persistence (Desktop)

On desktop, the globe stays mounted via the nested route architecture. State persistence is automatic:

- **Camera position:** The OrbitControls maintain their state (the camera stays zoomed into the pin region while the article is open, then zooms back out on close)
- **Selected pin:** `selectedPin` in context persists across the pathname change (the provider doesn't unmount)
- **Globe mesh / borders:** Already rendered, no re-computation needed

**No serialization or sessionStorage needed on desktop.** The nested route under `app/globe/layout.tsx` keeps `GlobeProvider` alive across `/globe` ↔ `/globe/[slug]` transitions.

### Mobile: no persistence

On mobile, navigating to `/[slug]` unmounts the globe. On return (browser back to `/globe`), the globe starts fresh:
- Entrance animation plays
- No pin pre-selected
- Camera targets most-recent-travel pin (same as first visit)

This is explicitly acceptable per requirements.

---

## 8. Component Changes

### Modified components (from 5A)

| Component | Change |
|---|---|
| `GlobeProvider.tsx` | Add `article-open` state, `activeArticleSlug`, `articleTitleRef`, `closeArticle()`. Detect article route via `usePathname()`. |
| `GlobeContext.tsx` | Add new state/ref types to `GlobeContextValue` |
| `GlobeDetailItem.tsx` | Replace `console.log(slug)` stub with actual navigation (desktop: `/globe/${slug}`, mobile: `/${slug}`) |
| `GlobeViewport.tsx` | Add article area container + `AnimatePresence` for article-open state. Update flex layout for 3-state machine. Disable canvas interaction when `article-open`. |
| `GlobeScene.tsx` | Add zoom-to-pin animation for article-open state. Disable OrbitControls during zoom. Slow/pause auto-rotate in article state. |
| `ArticleContent.tsx` | Add `globe?: boolean` prop. Adjust layout for narrower container when `globe={true}`. |

### New components

| Component | Responsibility |
|---|---|
| `GlobeArticleReveal.tsx` | Client wrapper: fade-in animation for article content in globe context |
| `GlobeArticleConnector.tsx` | SVG overlay: pin → article title connector with × dismiss button |

### New route files

| File | Responsibility |
|---|---|
| `app/globe/[slug]/page.tsx` | Server Component: fetches article, renders with `GlobeArticleReveal` + `ArticleContent` |
| `app/globe/[slug]/loading.tsx` | Skeleton loading state during article fetch |

---

## 9. File Inventory

### New files

```
components/globe/
  GlobeArticleReveal.tsx
  GlobeArticleConnector.tsx

app/globe/
  [slug]/
    page.tsx
    loading.tsx
```

### Modified files

```
components/globe/GlobeProvider.tsx      ← article-open state, pathname detection
components/globe/GlobeContext.tsx        ← new types
components/globe/GlobeDetailItem.tsx     ← real navigation (was stub)
components/globe/GlobeViewport.tsx       ← 3-state flex layout, article area
components/globe/GlobeScene.tsx          ← zoom-to-pin, disable controls in article state
components/ArticleContent.tsx            ← add globe prop
```

---

## 10. Implementation Order

Each step requires the previous to be complete.

### Step 1: Route setup + article rendering

1. Create `app/globe/[slug]/page.tsx` — fetch article, render with `ArticleContent` (no special animation yet)
2. Create `app/globe/[slug]/loading.tsx` — skeleton loading
3. Add `globe?: boolean` prop to `ArticleContent.tsx` — adjust `max-width`, show cover image + metadata
4. In `GlobeDetailItem.tsx`, replace stub with real navigation:
   - Desktop: `router.push('/globe/${slug}', { scroll: false })`
   - Mobile: `router.push('/${slug}')`
5. **Verify:** Click item in panel → article loads. Desktop: URL is `/globe/[slug]`, globe provider stays mounted (check with React DevTools). Mobile: URL is `/[slug]`, full page navigation.

### Step 2: Desktop layout state — article-open

1. Add `'article-open'` to layout state enum in `GlobeContext.tsx`
2. In `GlobeProvider.tsx`, detect article route via `usePathname()`. When path matches `/globe/[slug]`, transition to `article-open`.
3. In `GlobeViewport.tsx`, update flex layout:
   - `article-open`: globe container → ~25–30% width, article area → ~70% width
   - Article area wraps `{children}` (which is the page.tsx content)
   - Use `AnimatePresence` for article area entrance/exit
4. **Verify:** Click item → globe shrinks to sliver, article fills right side. Article is scrollable independently.

### Step 3: Globe zoom-to-pin in article state

1. In `GlobeScene.tsx`, when `layoutState === 'article-open'`:
   - Disable OrbitControls
   - Animate camera to zoom into the selected pin's coordinates (the pin should appear near the right edge of the visible globe sliver)
   - Slow or pause auto-rotate
2. When transitioning back to `panel-open`:
   - Animate camera back to previous zoom/position
   - Re-enable OrbitControls
3. **Verify:** Article open → globe zooms to pin region. Close article → globe zooms back out.

### Step 4: GlobeArticleReveal

1. Create `GlobeArticleReveal.tsx` — fade-in wrapper
2. Update `app/globe/[slug]/page.tsx` to wrap content in `GlobeArticleReveal`
3. **Verify:** Article content fades in smoothly on navigation

### Step 5: Article connector

1. Create `GlobeArticleConnector.tsx`:
   - SVG overlay from pin screen position → article title left edge
   - × dismiss button at connector midpoint
   - Draw-in animation after article fade-in completes
   - Retract animation on close
2. Add `articleTitleRef` to `GlobeContext` — ref attached to the `<h1>` in `ArticleContent` when `globe={true}`
3. Wire × button to `closeArticle()` in context
4. **Verify:** Connector draws from pin to title after article appears. × button closes article and triggers reverse transition. Connector retracts.

### Step 6: Close article → restore panel-open

1. Implement `closeArticle()` in `GlobeProvider`:
   - `router.push('/globe', { scroll: false })` (navigate back to globe index)
   - Pathname change triggers state back to `panel-open`
   - Same pin remains selected → panel re-opens
   - Click connector redraws after globe expands
2. **Verify:** Full round-trip: pin click → panel open → item click → article open → × close → panel open with same pin. No state loss.

### Step 7: Mobile cleanup + landing page

1. Verify mobile flow: item tap → `/[slug]` → browser back → `/globe` remounts fresh
2. Verify no mobile-specific regressions (panel dismiss, swipe, tap targets still work)
3. Add `/globe` link on `app/page.tsx` (landing page)
4. **Verify:** Landing page links to globe. Full desktop and mobile flows work end-to-end.

---

## 11. Documented Decisions & Nits

### Decisions made

| Decision | Choice | Why |
|---|---|---|
| Desktop article view | Globe stays mounted, shifts left to ~25% | Fastest return — no remount, no state loss |
| Mobile article view | Navigate away entirely (`/[slug]`) | Simpler, saves GPU, remount is acceptable |
| Globe interaction in article state | Disabled entirely | User is reading — globe is decorative only |
| Article connector | Third connector component | Unique lifecycle (article-open state only), unique endpoint (title) |
| Close affordance | × on connector line | Spatially connects pin↔article, natural dismiss point |
| Auto-rotate in article state | Very slow or paused | User is reading, not exploring |
| State persistence (desktop) | Automatic via nested route (provider stays mounted) | No serialization needed |
| State persistence (mobile) | None (remount from scratch) | Acceptable tradeoff for GPU savings |
| ArticleContent reuse | Yes, with `globe` prop | Avoids duplicating article rendering; prop controls layout differences |
| ArticleReveal | Globe-specific variant (fade, not slide-up) | Different spatial context than wardrobe |

### Nits (not blocking)

1. **Auto-rotate speed in article state:** The spec says "selecting a pin does not stop idle rotation." In article-open state, the globe is mostly hidden (25% sliver) — fast rotation would be distracting. Suggest: `autoRotateSpeed: 0.05` or fully paused. The implementer should tune this visually.

2. **Article title scrolling off-screen:** When the user scrolls the article and the `<h1>` moves out of view, the connector end-point should clamp to the top of the article area. The connector doesn't "follow" the title upward — it stays anchored to the article container edge. This is a small detail the implementer should handle.

3. **Connector line angle:** Ideally the line is roughly horizontal (pin on right edge of globe → title on left edge of article area). If the pin drifts vertically with rotation, the line becomes diagonal. This is acceptable for 5A/5B. Phase 5C could pause rotation in article state to keep it perfectly horizontal.

4. **Duplicate URLs (SEO):** Articles are reachable at `/globe/[slug]`, `/wardrobe/[slug]`, and `/[slug]`. Add `<link rel="canonical" href="/[slug]" />` in article pages when SEO matters. Not blocking for MVP.

5. **Back button behavior (desktop):** If the user hits the browser back button while in article-open state, it should navigate to `/globe` (which triggers the `panel-open` restoration). Verify that `router.push('/globe/[slug]', { scroll: false })` creates a proper history entry so back works correctly.

6. **Loading state during article fetch:** The `loading.tsx` skeleton appears in the article area while the server component fetches. During this time, the globe has already shifted to 25% and zoomed. The zoom + skeleton should feel intentional, not broken. The implementer may want to delay the globe zoom until the article data arrives (wait for pathname change + a brief timeout), or accept the zoom-before-content timing.
