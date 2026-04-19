# 5C-D1 — `/trip/<slug>` route + sliver integration

**Epic**: D. Routing & URL state · **Owner**: Dev A · **Can be run by agent?**: Yes · **Estimated size**: M

## Dependencies

### Hard
- **A2** — `tripBySlugQuery`, `TripWithVisits` type.
- **C4** — trip panel has "View trip article" button that triggers this route.

### Soft
- None.

### Blocks
- **D2** (URL state uses trip route).

---

## Goal

New Next.js App Router route `/trip/<slug>` that displays a trip's article body inside the existing article sliver (the 30/70 split with globe on left). Mirrors `/globe/[slug]` item article behavior. Trip panel stays open behind the sliver. Globe pans to the first visit's pin.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §8.1 Opening
- §8.2 Dismissing
- §8.3 Empty article body
- §8.8 SEO considerations

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §8
- [`../../app/globe/[slug]/page.tsx`](../../app/globe/%5Bslug%5D/page.tsx) — existing item article route; mirror
- [`../../app/globe/[slug]/loading.tsx`](../../app/globe/%5Bslug%5D/loading.tsx) — loading skeleton pattern
- [`../../components/globe/GlobeArticleReveal.tsx`](../../components/globe/GlobeArticleReveal.tsx) — sliver reveal wrapper
- [`../../components/globe/GlobeViewport.tsx`](../../components/globe/GlobeViewport.tsx) — article sliver rendering
- [`../../components/ArticleContent.tsx`](../../components/ArticleContent.tsx) — item article render for reference

## Files to create

- `app/trip/[slug]/page.tsx` — server component (SSR the article body)
- `app/trip/[slug]/loading.tsx` — loading skeleton
- `app/trip/[slug]/not-found.tsx` — 404 boundary (D3 wires the redirect)
- `components/globe/TripArticleContent.tsx` — renders trip header + PortableText
- `components/globe/TripArticleReveal.tsx` — client wrapper mirroring `GlobeArticleReveal`

## Files to modify

- `components/globe/GlobeProvider.tsx` — `activeTripSlug` derivation already added in C1; camera pan on trip article open (see below)
- `components/globe/GlobeScene.tsx` — extend article-zoom to also fire when `activeTripSlug` is set
- `components/globe/GlobeViewport.tsx` — sliver article-open branch must render on either `activeArticleSlug` or `activeTripSlug`

## Files to delete

- None.

---

## Implementation guidance

### `app/trip/[slug]/page.tsx`

```tsx
export const dynamic = 'force-dynamic'

import { client } from '@/lib/sanity'
import { tripBySlugQuery } from '@/lib/queries'
import type { TripWithVisits } from '@/lib/types'
import { notFound } from 'next/navigation'
import TripArticleContent from '@/components/globe/TripArticleContent'
import TripArticleReveal from '@/components/globe/TripArticleReveal'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function TripArticlePage({ params }: Props) {
  const { slug } = await params
  const trip: TripWithVisits | null = await client.fetch(tripBySlugQuery, { slug })
  if (!trip) return notFound()

  return (
    <TripArticleReveal tripSlug={slug} tripId={trip._id}>
      <TripArticleContent trip={trip} />
    </TripArticleReveal>
  )
}
```

The route returns nothing visible directly — the sliver layout (from `app/globe/layout.tsx`) renders around this page's output. The `<GlobeLayout>` already wraps `/globe/*` — does it wrap `/trip/*`?

**Critical detail**: Next.js layouts cascade by route segment. `app/globe/layout.tsx` wraps `app/globe/*` only. The `/trip/*` route doesn't inherit it.

Options:
- **(a)** Create `app/trip/layout.tsx` that imports and reuses `GlobeLayout`'s data fetching + provider + navbar + timeline + viewport. Code duplication.
- **(b)** Promote `GlobeLayout` to a shared parent, e.g., use a route group `(globe-and-trip)` that wraps both. Refactor.
- **(c)** Put the globe layout logic in `app/layout.tsx` gated on pathname (ugly).

**Recommendation**: (b). Create a route group `app/(globe)/layout.tsx`, move all globe layout content there, move `app/globe/` and `app/trip/` inside the group. Route paths stay the same (`/globe`, `/trip/<slug>`) because route groups don't affect URLs.

Refactor steps:
1. `mkdir -p app/(globe)`
2. `git mv app/globe app/(globe)/globe`
3. `git mv app/globe/layout.tsx app/(globe)/layout.tsx` (from within the moved dir)
4. Create `app/(globe)/trip/[slug]/page.tsx` etc.

Verify routes: `http://localhost:3000/globe` still works; `http://localhost:3000/trip/slug` works; neither shows `(globe)` in URL.

**Alternative**: skip the route group; duplicate the layout in `app/trip/layout.tsx`. Simpler but duplicates. For this phase, prefer the route group.

### `components/globe/TripArticleReveal.tsx`

```tsx
'use client'

import { useEffect } from 'react'
import { useGlobe } from './GlobeContext'

interface Props {
  tripSlug: string
  tripId: string
  children: React.ReactNode
}

/**
 * Syncs route-provided trip slug/id into the GlobeProvider so the sliver
 * animation triggers with the right target pin. Mirrors GlobeArticleReveal.
 */
export default function TripArticleReveal({ tripSlug, tripId, children }: Props) {
  const { setLockedTrip, lockedTrip } = useGlobe()

  // Ensure trip is locked so panel shows behind the sliver (spec §8.1).
  useEffect(() => {
    if (lockedTrip !== tripId) setLockedTrip(tripId)
  }, [tripId, lockedTrip, setLockedTrip])

  return <>{children}</>
}
```

### `components/globe/TripArticleContent.tsx`

```tsx
import { PortableText } from '@portabletext/react'
import type { TripWithVisits } from '@/lib/types'
import { portableTextComponents } from '@/lib/portableTextComponents'
import { formatDateRange } from '@/lib/formatDates'

interface Props {
  trip: TripWithVisits
}

export default function TripArticleContent({ trip }: Props) {
  const hasBody = trip.articleBody && trip.articleBody.length > 0

  return (
    <div className="w-full px-6 pt-0 pb-16 max-w-xl mx-auto">
      {/* Header */}
      <p className="text-xs tracking-widest uppercase text-gray-400 dark:text-gray-500">
        {formatDateRange(trip.startDate, trip.endDate)} · {trip.visitCount} {trip.visitCount === 1 ? 'visit' : 'visits'}
      </p>
      <h1 className="text-3xl font-light text-black dark:text-white mt-2 mb-8">
        {trip.title}
      </h1>

      {/* Body */}
      {hasBody ? (
        <div>
          <PortableText value={trip.articleBody!} components={portableTextComponents} />
        </div>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No content yet for this trip.
        </p>
      )}

      {/* Optional: visit list at bottom — spec doesn't mandate. Keep minimal. */}
    </div>
  )
}
```

### `app/trip/[slug]/loading.tsx`

```tsx
import { Skeleton } from 'boneyard-js/react'

export default function TripLoading() {
  return (
    <div className="w-full px-6 pt-20 pb-16 max-w-xl mx-auto">
      <Skeleton name="trip-article-loading" loading fixture={
        <div>
          <div className="h-3 w-64 bg-black/10 dark:bg-white/10 mb-4" />
          <div className="h-10 w-80 bg-black/10 dark:bg-white/10 mb-8" />
          <div className="h-4 w-full bg-black/10 dark:bg-white/10 mb-3" />
          <div className="h-4 w-5/6 bg-black/10 dark:bg-white/10 mb-3" />
          <div className="h-4 w-3/4 bg-black/10 dark:bg-white/10 mb-3" />
        </div>
      } />
    </div>
  )
}
```

### `app/trip/[slug]/not-found.tsx`

```tsx
import TripNotFoundRedirect from '@/components/globe/TripNotFoundRedirect'

export default function TripNotFound() {
  return <TripNotFoundRedirect />
}
```

(`TripNotFoundRedirect` component is D3's scope. Stub it here as a simple "Trip not found" message; D3 adds the 1.5s redirect.)

### GlobeProvider: camera pan on trip article open

Camera should pan to the first visit's pin when article opens. Extend GlobeScene's article-zoom logic:

```tsx
// GlobeScene.tsx
const { ..., activeTripSlug, trips, tripsWithVisits } = useGlobe()

// When article opens with a trip slug, target first visit's pin.
useEffect(() => {
  if (!activeTripSlug) return
  const trip = tripsWithVisits.find((t) => t.slug.current === activeTripSlug)
  if (!trip || trip.visits.length === 0) return
  const firstVisit = trip.visits[0]  // ascending order — earliest
  const pinGroup = firstVisit.location._id
  // Trigger the existing pin-based article zoom with this pin id.
  // (Reuse startArticleZoom function — it takes a pin group id.)
  startArticleZoom(pinGroup)
}, [activeTripSlug, tripsWithVisits])
```

The `startArticleZoom` function (already in GlobeScene) takes a pin id and animates camera to it. Pass the first visit's `location._id`.

### GlobeViewport: sliver renders on either slug

Existing code:
```tsx
const isArticle = layoutState === 'article-open'
```

Provider derives `layoutState = 'article-open'` when either `activeArticleSlug` or `activeTripSlug` is non-null. Confirm C1 did this; if not, update.

---

## Acceptance criteria

- [ ] Route group or layout duplication in place — `/trip/<slug>` renders inside `GlobeLayout`'s chrome (navbar, timeline, provider).
- [ ] `/trip/berlin-2022` loads — article sliver opens (globe shifts left to 30% width, article fills 70%).
- [ ] Trip panel remains visible behind the sliver (not closed).
- [ ] Camera pans to the first visit's pin of the trip.
- [ ] Article body (PortableText) renders server-side (verify via `curl` that HTML contains the body text — SEO requirement §8.8).
- [ ] `/trip/non-existent-slug` returns 404 (D3 adds redirect).
- [ ] Clicking the globe sliver (Phase 5B back-button pattern) closes the article: routes to `/globe?trip=<slug>` via the provider's `closeArticle`.
- [ ] Empty article body: renders "No content yet for this trip."
- [ ] `View trip article` button in TripPanel (C4) navigates to `/trip/<slug>` successfully.

## Non-goals

- **No URL state sync** — D2.
- **No 404 redirect animation** — D3.
- **No escape key handling** — D3.
- **No history-push behavior** (fine-tuning) — D2.

## Gotchas

- **Layout inheritance with route groups**: `app/(globe)/layout.tsx` cascades to `app/(globe)/globe/` and `app/(globe)/trip/`. Paths `/globe` and `/trip/<slug>` — the `(globe)` group doesn't appear in URL.
- **Layout refactor may break existing `/globe/*` paths**: test thoroughly. Check that `/globe/[item-slug]` still loads item articles.
- **Server vs client**: page.tsx is async server component (Sanity fetch). TripArticleReveal is client (uses `useGlobe`). Composition: server passes data to client wrapper. Standard pattern.
- **`tripBySlugQuery` returns `null` for missing slugs** — use `notFound()` from `next/navigation` which throws `NEXT_NOT_FOUND` and triggers `not-found.tsx`.
- **`startArticleZoom` already exists** in GlobeScene as of Phase 5B. Use it; don't reimplement.
- **Camera on cold-load `/trip/<slug>`**: the page loads before `tripsWithVisits` hydrates (it's a layout-level fetch). The useEffect that pans the camera waits for trips to arrive. During the gap, entrance animation plays. After trips arrive + entrance done, camera pans. Smooth transition.
- **Article sliver HTML for SEO**: the sliver visually overlays the globe, but the underlying `children` is rendered by `TripArticleContent` as static HTML. Search engines index it regardless of the overlay. Verify with `curl http://localhost:3000/trip/berlin-2022 | grep "first visit"` — text should appear.

## Ambiguities requiring clarification before starting

1. **Route group vs layout duplication**: I'm recommending route group `app/(globe)`. Big refactor — moves many files. Alternative is duplicating layout.tsx under `app/trip/`. Duplication tempts drift.

   **Action**: use route group. Document the move in PR.

2. **`TripArticleContent` visual design**: spec doesn't give specific layout. Using the same width + padding as item articles. Reviewer may want a different typographic treatment (larger hero, date ticker, etc.).

   **Action**: minimal header + body. Iterate per reviewer feedback.

3. **Close behavior**: spec §8.2 says "same as item article sliver." Currently item close re-routes to `/globe` (not `/globe?trip=<slug>`). For trips, must route to `/globe?trip=<slug>` per §8.4. C1's `closeArticle` handles this branching. Verify.

4. **Does trip article need a visible list of visits within the body**: spec doesn't mandate. Skip for now. If a reviewer wants it, add a "Visits on this trip" section below the body.

## Handoff / outputs consumed by later tickets

- `/trip/<slug>` route — consumed by TripPanel's "View trip article" button (C4), by D2 for URL sync, by D3 for 404 redirect.
- `TripArticleContent`, `TripArticleReveal` — D2 may trigger these via router.push.

## How to verify

1. Navigate to `/trip/berlin-2022` directly. Sliver opens, article visible.
2. Open Chrome devtools → Network → Disable cache. Curl the URL: `curl http://localhost:3000/trip/berlin-2022 | grep -i "first time"`. Article body text appears in raw HTML.
3. Navigate `/` → `/globe` → click trip label → click "View trip article." Smooth. URL updates to `/trip/<slug>`. Sliver slides in.
4. Click the globe sliver — article closes, returns to `/globe?trip=<slug>`.
5. Navigate `/trip/does-not-exist` — 404 page renders (redirect added by D3).
6. Navigate `/trip/weekend-in-lisbon` (no article body) — shows "No content yet for this trip."
7. Verify `/globe` and `/globe/<item-slug>` still work post-route-group refactor.
