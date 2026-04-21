# 5C-A3 — Wire new data into `app/globe/layout.tsx` + timeline stub

**Epic**: A. Foundation · **Owner**: Dev A · **Can be run by agent?**: Yes · **Estimated size**: S

**Status**: ✅ Shipped (PR #31). See [Implementation notes (as shipped)](#implementation-notes-as-shipped) for deviations from the original sketch that downstream tickets should inherit.

## Dependencies

### Hard
- **A2** — imports `allTripsQuery`, `allVisitsQuery`, `aggregatePins`, and new types.

### Soft
- **A4** — fixtures populate real data; without them, layout renders but with empty pins/trips.

### Blocks
- **B4** (timeline needs `trips` prop on provider)
- **E1** (mobile layout consumes same provider)

---

## Goal

Swap `app/globe/layout.tsx` from the old query/groupPins flow to the new trips-and-visits flow. Pass both `trips` and `pins` into the provider. Handle fetch failures gracefully. Stub the `<Timeline />` component so the layout scaffolding is visible even before B2+ land.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §2 Desktop Layout
- §3 Mobile Layout
- §12.7 Data fetch failure

## Files to read first

- [`../../app/globe/layout.tsx`](../../app/globe/layout.tsx) — current layout, the diff target
- [`../../lib/queries.ts`](../../lib/queries.ts) (post-A2) — new queries
- [`../../lib/globe.ts`](../../lib/globe.ts) (post-A2) — `aggregatePins`
- [`../../lib/types.ts`](../../lib/types.ts) (post-A2) — new types
- [`../../components/globe/GlobeProvider.tsx`](../../components/globe/GlobeProvider.tsx) — provider props (pre-C1)

## Files to create

- `components/globe/Timeline.tsx` — **stub only**, body = `<div data-testid="timeline-stub" className="h-16 w-full bg-black/5 dark:bg-white/5" />`. B2 replaces with the real implementation.

## Files to modify

- `app/globe/layout.tsx` — new data flow + timeline placement

## Files to delete

- None.

---

## Implementation notes (as shipped)

The ticket shipped in PR #31 with several intentional deviations from the original sketch below. Downstream tickets (B4, C1, C3, C4, E1) should treat these as the current baseline.

### Timeline is the real B2 component, not a stub

B2 landed before A3 (PR #29). The original sketch here mandated overwriting `components/globe/Timeline.tsx` with a 16px gray stub; that non-goal is now obsolete. The layout imports the real Timeline and passes real trip data. **Do not reintroduce the stub.**

### Real trip-data wiring is done in A3 (not B4)

The original scope deferred "real trip data wiring" to B4. Since B2's Timeline already accepted a `trips` prop, A3 performs the basic mapping:

```tsx
const timelineTrips = validTrips.map((t) => ({
  id: t.slug.current,       // ← load-bearing — see below
  title: t.title,
  startDate: t.startDate,
  endDate: t.endDate,
}))
```

B4 still owns hover/click provider wiring, URL state (`?trip=<slug>`), zoom/pan integration, and the §12.7 inline fetch-error UI. A3 only does the prop-level plumbing.

**`id: slug.current` is load-bearing.** Timeline uses `id` as React key and segment identity. Once B4 maps segment click → `router.push('/globe?trip=' + id)`, the URL slug _is_ the Timeline id — don't change this mapping without coordinating with D2 (URL state).

### Timeline is not yet visually above the globe

`GlobeViewport` still renders its root with `fixed inset-0 w-screen h-screen` ([components/globe/GlobeViewport.tsx:117,218](../../components/globe/GlobeViewport.tsx)). The layout structure is:

```tsx
<GlobeProvider>
  <GlobeNavbar />
  <Timeline />       {/* normal flow — painted first */}
  <GlobeViewport/>   {/* fixed inset-0 — paints over Timeline */}
</GlobeProvider>
```

So the DOM order satisfies the acceptance criterion ("Timeline renders above GlobeViewport"), but the fixed viewport overpaints it visually. This was accepted as in-scope-for-C1/E1 rather than extending A3 into a layout-shell refactor:

- **C1** (provider refactor) should drop `fixed inset-0` off the viewport root and introduce the desktop layout shell (flex column: navbar → timeline → globe body).
- **E1** (mobile layout) follows with the mobile reshape (globe → timeline → content per spec §3).

Until one of those lands, the only way to see Timeline with real data is `/timeline-dev` (B2's mock route). `/globe` will also render blank on a fresh dataset — see Environment setup below.

### Minimal GlobeProvider adapter (not a full refactor)

Per the original sketch's adapter pattern, `GlobeProvider` and `GlobeContext` were changed minimally:

- `pins: PinWithVisits[]` (was `GlobePin[]`)
- Added props/context fields: `trips: TripSummary[]`, `fetchError: boolean`
- Both are threaded into the context value but **unused by provider state**.

Internal references to the old `pin.group` / `pin.items` inside `GlobeProvider.tsx` (the deep-link resolver effect at ~line 125) remain and still fail typecheck. C1 owns the fix. Do not attempt a partial rewrite — wait for C1's full provider state model (hoveredTrip, lockedTrip, playback reasons, etc.) so the deep-link effect and the trip state land consistently.

### Fetch-failure semantics

`Promise.allSettled` means partial failure is survivable:

| `tripsResult` | `visitsResult` | `trips` | `pins` | `fetchError` |
|---|---|---|---|---|
| fulfilled | fulfilled | populated | populated | `false` |
| fulfilled | rejected | populated | `[]` | `true` |
| rejected | fulfilled | `[]` | populated | `true` |
| rejected | rejected | `[]` | `[]` | `true` |

B4 should render §12.7's inline error when `fetchError` is true, regardless of whether the populated-but-mismatched cases (rows 2 and 3) actually happen in practice. Treat them as "data may be internally inconsistent — degrade gracefully."

The **empty-but-no-error** case (both fulfilled, both return `[]`) is §12.1's "Nothing yet" state, **not** a fetch error. Do not conflate.

### Zero-visit trip filter lives in the layout, not the query

`TripSummary.startDate` / `.endDate` are declared as `string` (non-nullable) in [`lib/types.ts`](../../lib/types.ts), but the `allTripsQuery` GROQ aggregate returns `null` when a trip has no visits. The filter is applied client-side:

```tsx
const validTrips = trips.filter((t) => t.startDate && t.endDate)
```

TypeScript believes the guard is redundant (because of the type declaration), but at runtime the values can be null. **This is a known type-soundness gap owned by A1/A2** — don't patch it locally in A3's file; let A1/A2 tighten the type (to `string | null` or a separate `TripSummaryRaw` + narrowed `TripSummary`). The reason the filter is in the layout and not the query: other views (e.g. an admin "empty trips" report) may legitimately want zero-visit trips.

### Environment setup for worktree-based development

`.env.local` lives in the main repo root, not inside worktrees. A fresh worktree can't resolve `NEXT_PUBLIC_SANITY_PROJECT_ID` and throws `Configuration must contain 'projectId'` at first request. Symlink from worktree root:

```
ln -s <repo-root>/.env.local .env.local
```

Also note the dev dataset is empty by default — [`scripts/seed-phase5c.mts`](../../scripts/seed-phase5c.mts) must be run to populate trips/visits/locations/content before `/globe` shows anything.

### Handoff checklist for C1

When C1 lands, it should:

1. Fix the `pin.group` / `pin.items` deep-link effect inside `GlobeProvider.tsx` (original lines ~121–135). The replacement uses `PinWithVisits.location._id` as the pin key and `visits[].items[]` for the article-slug lookup.
2. Replace fields that downstream files still read as `pin.group` → use `pin.location._id` (or an equivalent derived key — C1 decides).
3. Consume `trips` and `fetchError` from context to drive timeline hover/lock state and the §12.7 inline error banner.
4. Drop `fixed inset-0` off `GlobeViewport` root and introduce the desktop layout shell so the Timeline is visually above the globe.
5. Remove the `TODO(C1)` comments added in this ticket once the above is in place.

### Handoff checklist for E1

1. On mobile, reorder to `<GlobeViewport> <Timeline>` so Timeline sits below the globe (spec §3). The `TODO(E1)` comment in [app/globe/layout.tsx](../../app/globe/layout.tsx) marks the spot.

---

## Implementation guidance

### `components/globe/Timeline.tsx` (stub)

```tsx
'use client'

/**
 * Stub timeline — replaced in phase 5C-B2 by the real component.
 * Placed here in 5C-A3 so the layout can reference it and render.
 */
export default function Timeline() {
  return (
    <div
      data-testid="timeline-stub"
      className="h-16 w-full bg-black/5 dark:bg-white/5"
      aria-hidden
    />
  )
}
```

Add `'use client'` — A future B2 Timeline will use hooks. Keeping the stub a client component avoids a later compile break.

### `app/globe/layout.tsx` (full rewrite)

```tsx
export const dynamic = 'force-dynamic'

import { client } from '@/lib/sanity'
import { allTripsQuery, allVisitsQuery } from '@/lib/queries'
import { aggregatePins } from '@/lib/globe'
import type { TripSummary, VisitSummary, PinWithVisits } from '@/lib/types'
import GlobeProvider from '@/components/globe/GlobeProvider'
import GlobeNavbar from '@/components/globe/GlobeNavbar'
import GlobeViewport from '@/components/globe/GlobeViewport'
import Timeline from '@/components/globe/Timeline'

export default async function GlobeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Parallel fetch, settle-not-fail so a partial failure still renders.
  const [tripsResult, visitsResult] = await Promise.allSettled([
    client.fetch<TripSummary[]>(allTripsQuery),
    client.fetch<VisitSummary[]>(allVisitsQuery),
  ])

  const trips: TripSummary[] =
    tripsResult.status === 'fulfilled' ? tripsResult.value : []
  const visits: VisitSummary[] =
    visitsResult.status === 'fulfilled' ? visitsResult.value : []
  const fetchError =
    tripsResult.status === 'rejected' || visitsResult.status === 'rejected'

  const pins: PinWithVisits[] = aggregatePins(visits)

  // Filter out trips with no visits — their startDate/endDate will be null
  // (spec §1.4 treats zero-visit trips as invalid). Timeline must not render them.
  const validTrips = trips.filter((t) => t.startDate && t.endDate)

  return (
    <GlobeProvider trips={validTrips} pins={pins} fetchError={fetchError}>
      <GlobeNavbar />
      {/* Desktop: timeline above globe. Mobile restructure comes in E1.
          Until E1 lands, mobile renders the same order — acceptable because
          the mobile stub is a thin strip (16px) that just verifies layout. */}
      <Timeline />
      <GlobeViewport>{children}</GlobeViewport>
    </GlobeProvider>
  )
}
```

### Provider signature note

`GlobeProvider` currently takes `pins: GlobePin[]`. After A2, `GlobePin` is deleted. This ticket passes `pins: PinWithVisits[]`. The provider itself is broken until C1 refactors — that's expected.

**To unblock this ticket alone** (so a compile error doesn't block A4 merging), add a **minimal adapter** to `GlobeProvider.tsx`: change the prop type to `PinWithVisits[]` and add `trips: TripSummary[]` and `fetchError: boolean` — **without** implementing the new state fields yet. Downstream components that expected `pin.group` or `pin.items` will still break; that's C1's scope.

The adapter steps in `GlobeProvider.tsx`:

```tsx
// Before (A2 removed GlobePin; provider now compile-errors on the import):
// import type { GlobePin, GlobeScreenCircle } from '@/lib/globe'

// After (A3 minimal adapter):
import type { GlobeScreenCircle } from '@/lib/globe'
import type { PinWithVisits, TripSummary } from '@/lib/types'

export default function GlobeProvider({
  pins,
  trips,
  fetchError,
  children,
}: {
  pins: PinWithVisits[]
  trips: TripSummary[]
  fetchError: boolean
  children: React.ReactNode
}) {
  // ... rest of file unchanged; downstream refs to pin.group etc. still broken — C1 fixes.
}
```

Keep `fetchError` + `trips` unused for now (prefix with `_` if a linter complains). Document as TODO in a comment.

---

## Acceptance criteria

- [ ] `Timeline.tsx` exists as a stub, renders a 16px-tall placeholder.
- [ ] `app/globe/layout.tsx` fetches trips and visits in parallel via `Promise.allSettled`.
- [ ] Filters out trips whose `startDate` is null/undefined (zero-visit trips).
- [ ] Passes `{ trips, pins, fetchError }` to `<GlobeProvider>`.
- [ ] On fetch failure (force by stubbing `client.fetch` to reject): layout renders, empty arrays propagate, `fetchError` is true. Page does not 500.
- [ ] `<Timeline />` renders above `<GlobeViewport>` on desktop.
- [ ] `npm run build` compiles. Some downstream components may error; note those in PR description and confirm they are owned by C1 / C3 / C4.

## Non-goals

- **Do not implement a real timeline** — that's B2.
- **Do not fix downstream compile errors** caused by `GlobePin` removal — those are C1's scope. If the build fails entirely and blocks verification, apply the minimal-adapter pattern in the GlobeProvider above; do not refactor beyond that.
- **Do not restructure mobile layout** — E1.
- **Do not add timeline-data to `GlobeProvider` state** — C1.
- **Do not handle URL state for `?trip=<slug>`** — D2.

## Gotchas

- **`export const dynamic = 'force-dynamic'`** must stay at the top. Fixture changes need to show without rebuild.
- **`Promise.allSettled`** not `Promise.all` — one-failure-takes-down-all is wrong per spec §12.7.
- **Zero-visit trip filter**: GROQ returns `null` start/end dates. Filter client-side (`t.startDate && t.endDate`). Don't add the filter to the query — other queries may need zero-visit trips for other reasons in the future.
- **Import paths**: use `@/` alias (see existing code). Do not use relative imports for `lib/*` or `components/*`.

## Ambiguities requiring clarification before starting

1. **Timeline placement above vs below on mobile**: spec §3 says mobile is globe → timeline → content. But this ticket stub-renders the timeline and doesn't yet have mobile restructure (E1). Acceptable stance: render timeline above globe on both form factors temporarily. E1 fixes mobile.

   **Resolution**: render above for now. Document as TODO: "E1 moves timeline below globe on mobile."

2. **`GlobeProvider` props when C1 hasn't landed**: this ticket proposes a **minimal adapter** pattern — change the prop type but don't implement new state. A stricter alternative is "block A3 until C1 ships." I'm unblocking A3 because data-wiring + timeline placement is visible UX; waiting on C1 delays feedback. If a reviewer prefers strict sequencing, make A3 depend on C1 instead.

   **Resolution**: apply minimal adapter. Be explicit in the commit message.

## Handoff / outputs consumed by later tickets

- `Timeline.tsx` stub filename — B2 overwrites this file.
- `GlobeProvider` new props `trips` + `fetchError` — C1 uses these when expanding the provider state shape.

## How to verify

1. `npm run dev`, navigate to `/globe`.
2. Timeline stub visible above globe: a 16px-tall very-light-gray strip.
3. Globe still renders (although pins may be broken — depends on what else has shipped).
4. To force fetch failure: temporarily edit `lib/sanity.ts` to throw in `client.fetch`, reload — page still renders (globe empty, timeline stub visible).
5. `npm run build` — compiles (or errors only in expected downstream files noted in PR).

---

_Once this ticket merges, A4 can be verified end-to-end: seed fixtures, load `/globe`, see pins appear._
