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

The ticket shipped in PR #31. A3's surface changes were then **superseded by C1** when C1 merged to `phase-5c/integration` ahead of A3. The merge-conflict resolution on A3's PR took C1's version of all three code files wholesale. The notes below are the state of the world **after** that merge — what A3 actually accomplished and what downstream tickets should know.

### Timeline is the real B2 component, not a stub

B2 landed before A3 (PR #29). The original sketch here mandated overwriting `components/globe/Timeline.tsx` with a 16px gray stub; that non-goal is obsolete. `/timeline-dev` still exercises the real component with mock data. **Do not reintroduce the stub.**

### Timeline is not currently rendered in `app/globe/layout.tsx`

A3's original merge included `<Timeline trips={…} />` in the layout. C1's version of `layout.tsx` **removed that render** — Timeline now has no production consumer. The B4 ticket owns placing Timeline into the real UI (with hover/click/URL wiring and the §12.7 fetch-error banner). Until then, the only way to exercise Timeline with non-mock data is to wire it up locally.

When B4 reinstates the render, the prop mapping A3 used is worth carrying forward:

```tsx
trips.map((t) => ({
  id: t.slug.current,       // ← load-bearing — see below
  title: t.title,
  startDate: t.startDate,
  endDate: t.endDate,
}))
```

**`id: slug.current` is load-bearing.** Timeline uses `id` as React key and segment identity. B4 maps segment click → `router.push('/globe?trip=' + id)`, so the URL slug _is_ the Timeline id. Don't change this mapping without coordinating with D2 (URL state).

### Layout shell (fixed-inset-0 viewport) is still outstanding

`GlobeViewport` still renders its root as `fixed inset-0 w-screen h-screen` ([components/globe/GlobeViewport.tsx:117,218](../../components/globe/GlobeViewport.tsx)). Even after C1, no production layout shell exists, so any element A3/B4 places in normal flow next to `<GlobeViewport>` will be overpainted. Two possible owners:

- **C1 (post-merge follow-up)** — or whichever ticket actually introduces the desktop flex column (navbar → timeline → globe body). C1 as merged focuses on provider state, not layout geometry.
- **E1** — mobile reshape to globe → timeline → content (spec §3) will have to address this anyway.

Calling this out here because it was the single biggest A3 concern flagged in review and it remains unresolved on `phase-5c/integration`.

### GlobeProvider / GlobeContext: A3's minimal adapter was replaced by C1's full state model

A3 originally added the minimum viable fields (`pins: PinWithVisits[]`, `trips`, `fetchError`) and threaded them through context without new state. C1 replaced that in full with:

- `hoveredTrip`, `lockedTrip`, `previewTrip`, `setLockedTrip` (the trip lock wrapper also clears `selectedPin`)
- `pinSubregionHighlight` (for C2)
- `playbackHighlightedTripIds`, `playbackActive`, `addPauseReason` / `removePauseReason`, `isPaused` (B6/B7 coordination)
- `panelVariant: 'pin' | 'trip' | null` (shared panel region per spec §7.3.2)
- `activeTripSlug` and URL-aware `closeArticle`

The A3 `TODO(C1)` comments were dropped along with the adapter. Consumers reading this ticket for provider surface area should go straight to [`components/globe/GlobeContext.tsx`](../../components/globe/GlobeContext.tsx) — the list above is just a pointer, not authoritative.

### Fetch-failure semantics (updated to match C1's `try/catch`)

C1's version of `app/globe/layout.tsx` replaced A3's `Promise.allSettled` with a single `try/catch` around `Promise.all`:

```tsx
let trips: TripSummary[] = []
let visits: VisitSummary[] = []
let fetchError = false
try {
  ;[trips, visits] = await Promise.all([...])
} catch {
  fetchError = true
}
```

So the truth table collapses to all-or-nothing:

| Both queries | `trips` | `pins` | `fetchError` |
|---|---|---|---|
| resolved | populated | populated | `false` |
| either rejected | `[]` | `[]` | `true` |

B4 should still render §12.7's inline error when `fetchError` is true. The **empty-but-no-error** case (both resolve with `[]`) remains §12.1's "Nothing yet" state, **not** a fetch error.

A subtle change in behavior vs. A3's original: a partial Sanity outage that fails only one of the two queries now wipes **both** sides of the render (no pins, no trips) rather than the half that succeeded. If that turns out to matter in practice, flip back to `Promise.allSettled` — the call is reversible.

### Zero-visit trip filter is now unowned

A3 had a client-side filter (`trips.filter((t) => t.startDate && t.endDate)`) to drop zero-visit trips before handing them to Timeline — needed because `allTripsQuery` returns null `startDate`/`endDate` for trips with no visits, despite `TripSummary` declaring those fields as non-nullable. C1's merged layout dropped the filter.

**Consequence:** consumers of `context.trips` currently receive zero-visit trips with null dates. Anything that indexes `startDate.slice(…)` or passes them to `new Date(…)` without a guard will break at runtime once real data has a zero-visit trip.

Possible owners:

- **A1/A2** — tighten `TripSummary.startDate` to `string | null` (or split `TripSummaryRaw` / `TripSummary`) so the type system forces consumers to decide.
- **B4** — when Timeline is reinstated in the layout, re-add the filter at the point of use (preferred if A1/A2 chooses not to tighten the type — keeps the "admin view might want zero-visit trips" door open).

Flagging here rather than silently patching: I don't want to commit to a type change from A3's PR without A1/A2's input.

### Environment setup for worktree-based development

`.env.local` lives in the main repo root, not inside worktrees. A fresh worktree can't resolve `NEXT_PUBLIC_SANITY_PROJECT_ID` and throws `Configuration must contain 'projectId'` at first request. Symlink from worktree root:

```
ln -s <repo-root>/.env.local .env.local
```

Also note the dev dataset is empty by default — [`scripts/seed-phase5c.mts`](../../scripts/seed-phase5c.mts) must be run to populate trips/visits/locations/content before `/globe` shows anything.

### Handoff checklist (post-C1 merge)

The original C1 / E1 checklists shipped with A3 are now partially obsolete. Current state:

- ✅ **Provider deep-link effect** — rewritten by C1 against the new pin shape.
- ✅ **Provider consumes `trips` and `fetchError`** — C1 built the full state model on top.
- ⬜ **Downstream consumers still using `pin.group` / `pin.items`** — `GlobePins.tsx`, `GlobePositionBridge.tsx`, `GlobeScene.tsx`, `GlobeTooltip.tsx`, `GlobeViewport.tsx`, `GlobeDetailPanel.tsx`, `app/globe/[slug]/page.tsx` all still fail typecheck against the new pin shape. These map to C-series tickets (C2/C3/C4) per the phase-5c README.
- ⬜ **Layout shell** — `fixed inset-0` on `GlobeViewport` still overpaints any sibling element; no ticket currently owns introducing the desktop flex column.
- ⬜ **Timeline render in `app/globe/layout.tsx`** — B4 owns reinstating it plus hover/click/URL wiring.
- ⬜ **Zero-visit trip filter** — unowned; A1/A2 type fix or B4 point-of-use filter.

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
