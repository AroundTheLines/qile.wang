# 5C-A3 — Wire new data into `app/globe/layout.tsx` + timeline stub

**Epic**: A. Foundation · **Owner**: Dev A · **Can be run by agent?**: Yes · **Estimated size**: S

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
