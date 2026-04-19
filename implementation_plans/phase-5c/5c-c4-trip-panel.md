# 5C-C4 — `TripPanel` variant + cross-fade between panel variants

**Epic**: C. Globe & Panels · **Owner**: Dev C · **Can be run by agent?**: Yes · **Estimated size**: M

## Dependencies

### Hard
- **C3** — shares `PanelChrome`, `VisitSection`, `lib/formatDates.ts`.

### Soft
- None.

### Blocks
- **C7** (cross-interactions), **D1** (trip article link target), **E1** (mobile layout), **F1** (boneyard target: `trip-panel`).

---

## Goal

Implement the `TripPanel` variant. Opens when a trip is locked (clicked timeline label). Shows visits in ascending chronological order (earliest first), a single global "View trip article" button at the top, and per-visit sections with items. Also implements the panel-variant cross-fade transition per §7.3.2.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §7.2 Trip panel
- §7.3 Item duplication inside trip panel
- §7.3.2 Panel variant transitions (cross-fade)
- §8.1 Trip article opening
- §13.6.1 Boneyard target: `trip-panel`

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §7.2, §7.3, §7.3.2, §8.1
- C3's output: `components/globe/panels/PanelChrome.tsx`, `components/globe/panels/VisitSection.tsx`
- [`../../lib/formatDates.ts`](../../lib/formatDates.ts) (from C3)
- [`../../components/globe/GlobeContext.tsx`](../../components/globe/GlobeContext.tsx) (post-C1)

## Files to create

- `components/globe/panels/TripPanel.tsx`

## Files to modify

- `components/globe/GlobeDetailPanel.tsx` — wire in `<TripPanel>` for `panelVariant === 'trip'`
- `components/globe/panels/PanelChrome.tsx` — no structural change, but may wrap in a variant-keyed `<AnimatePresence>` for cross-fade (see below)

## Files to delete

- None.

---

## Implementation guidance

### Trip panel data needs

`GlobeContext.trips` is `TripSummary[]` — lacks the per-visit details needed for the trip panel (visit sections need date ranges + items per visit). Decision: fetch on-demand.

Two approaches:
- **(a)** Layout fetches `allTripsWithVisitsQuery` (new query: like `allTripsQuery` but embeds visits) instead of `allTripsQuery`. Heavier initial fetch but all data available.
- **(b)** TripPanel fetches per-trip via `tripBySlugQuery` on mount. Lighter initial load but adds a network round-trip on every trip lock.

**Recommendation**: **(a)**. Spec §13.5.2 target capacity is 50 trips / 200 visits — that fits in one fetch. The round-trip pattern would also add a loading flash.

**But**: this changes `app/globe/layout.tsx` to fetch a different query. That's a modification to A3's scope. Options:
- Add a new query `allTripsWithVisitsQuery` in A2. Fetch both — `allTripsQuery` drives the timeline (lightweight), the new query drives the trip panel (heavy). That's one extra fetch in layout.
- Just include visits in `allTripsQuery`. Timeline only needs `startDate/endDate/visitCount/hasArticle`; visits array is ignored by timeline.

**Cleanest**: add a separate query to avoid bloating the timeline query. Fetch both in parallel in layout.

**Action for this ticket**:
1. Add `allTripsWithVisitsQuery` to `lib/queries.ts`.
2. Modify `app/globe/layout.tsx` to also fetch it and pass through provider as `tripsWithVisits: TripWithVisits[]`.
3. Update `GlobeContext` to expose `tripsWithVisits`.

This crosses into A2/A3/C1 territory. If those agents haven't shipped this expansion, this ticket does it. Document in PR.

**Alternative minimal path**: TripPanel fetches client-side via `fetch('/api/trips/<slug>')` — but that requires an API route (not in current repo pattern). Better to extend the server-side fetch.

### `allTripsWithVisitsQuery`

```groq
*[_type == "trip"] {
  _id,
  title,
  slug,
  "startDate": *[_type == "visit" && references(^._id)] | order(startDate asc)[0].startDate,
  "endDate":   *[_type == "visit" && references(^._id)] | order(endDate desc)[0].endDate,
  "visitCount": count(*[_type == "visit" && references(^._id)]),
  "hasArticle": defined(articleBody) && length(articleBody) > 0,
  "visits": *[_type == "visit" && references(^._id)] | order(startDate asc) {
    _id,
    startDate,
    endDate,
    "location": location->{ _id, name, coordinates },
    "items": items[]->{ _id, title, slug, content_type, cover_image }
  }
} | order(startDate desc)
```

Add to `lib/queries.ts`.

Add type in `lib/types.ts` (may already be there from A2 as `TripWithVisits[]`).

### Layout fetch update

```tsx
// app/globe/layout.tsx
const [tripsResult, visitsResult, tripsWithVisitsResult] = await Promise.allSettled([
  client.fetch<TripSummary[]>(allTripsQuery),
  client.fetch<VisitSummary[]>(allVisitsQuery),
  client.fetch<TripWithVisits[]>(allTripsWithVisitsQuery),
])

// ...
const tripsWithVisits = tripsWithVisitsResult.status === 'fulfilled' ? tripsWithVisitsResult.value : []
```

Pass `tripsWithVisits` to provider. Expose on context.

### `TripPanel.tsx`

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { Skeleton } from 'boneyard-js/react'
import PanelChrome from './PanelChrome'
import VisitSection from './VisitSection'
import { useGlobe } from '../GlobeContext'
import { formatDateRange } from '@/lib/formatDates'
import type { TripWithVisits } from '@/lib/types'

interface Props {
  trip: TripWithVisits
}

export default function TripPanel({ trip }: Props) {
  const router = useRouter()
  const { setLockedTrip } = useGlobe()

  const subtitle = `${formatDateRange(trip.startDate, trip.endDate)} · ${trip.visitCount} visits`

  const handleViewArticle = () => {
    if (!trip.hasArticle) return
    router.push(`/trip/${encodeURIComponent(trip.slug.current)}`, { scroll: false })
  }

  return (
    <Skeleton name="trip-panel" loading={false} fixture={/* F1 */ null}>
      <PanelChrome
        title={trip.title}
        subtitle={subtitle}
        onClose={() => {
          setLockedTrip(null)
          router.push('/globe', { scroll: false })
        }}
      >
        {/* Global "View trip article" button */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-900">
          <button
            onClick={handleViewArticle}
            disabled={!trip.hasArticle}
            aria-disabled={!trip.hasArticle}
            title={trip.hasArticle ? 'View trip article' : 'No content available for this trip.'}
            className={`w-full text-[11px] tracking-widest uppercase py-2 border transition-colors ${
              trip.hasArticle
                ? 'border-black dark:border-white text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black cursor-pointer'
                : 'border-gray-200 dark:border-gray-800 text-gray-300 dark:text-gray-700 cursor-not-allowed'
            }`}
          >
            View trip article
          </button>
        </div>

        {/* Visit sections, ascending order (§7.2) */}
        {trip.visits.map((visit) => (
          <VisitSection
            key={visit._id}
            // Adapt: TripPanel uses VisitInTrip (no trip ref embedded); VisitSection wants VisitSummary.
            // Shim with the known trip ref:
            visit={{
              ...visit,
              trip: { _id: trip._id, title: trip.title, slug: trip.slug },
            }}
            showViewTripArticleLink={false}  // single global button, no per-section dup
            sticky
          />
        ))}
      </PanelChrome>
    </Skeleton>
  )
}
```

### `GlobeDetailPanel.tsx` dispatcher — add trip branch

```tsx
'use client'

import { useGlobe } from './GlobeContext'
import PinPanel from './panels/PinPanel'
import TripPanel from './panels/TripPanel'

export default function GlobeDetailPanel() {
  const { panelVariant, pins, selectedPin, lockedTrip, tripsWithVisits } = useGlobe()

  if (panelVariant === 'pin' && selectedPin) {
    const pin = pins.find((p) => p.location._id === selectedPin)
    if (!pin) return null
    return <PinPanel pin={pin} />
  }

  if (panelVariant === 'trip' && lockedTrip) {
    const trip = tripsWithVisits.find((t) => t._id === lockedTrip)
    if (!trip) return null
    return <TripPanel trip={trip} />
  }

  return null
}
```

### Cross-fade between variants (§7.3.2)

Spec: "Cross-fade the panel contents over ~200ms. The panel container itself does not slide or resize — only the inner content transitions." Also: "Sticky headers and scroll position reset on variant switch... Item expansion state resets as well."

Implementation: wrap the variant rendering in `<AnimatePresence mode="wait">` keyed on `panelVariant`:

```tsx
// GlobeDetailPanel.tsx
import { AnimatePresence, motion } from 'framer-motion'

export default function GlobeDetailPanel() {
  const { panelVariant, pins, selectedPin, lockedTrip, tripsWithVisits } = useGlobe()

  return (
    <AnimatePresence mode="wait">
      {panelVariant === 'pin' && selectedPin && (() => {
        const pin = pins.find((p) => p.location._id === selectedPin)
        if (!pin) return null
        return (
          <motion.div
            key={`pin-${selectedPin}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            <PinPanel pin={pin} />
          </motion.div>
        )
      })()}

      {panelVariant === 'trip' && lockedTrip && (() => {
        const trip = tripsWithVisits.find((t) => t._id === lockedTrip)
        if (!trip) return null
        return (
          <motion.div
            key={`trip-${lockedTrip}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            <TripPanel trip={trip} />
          </motion.div>
        )
      })()}
    </AnimatePresence>
  )
}
```

**Key insight**: because PinPanel and TripPanel are new component instances on variant change (due to the keyed `motion.div`), scroll position and expansion state reset automatically — React unmounts the old tree.

The **outer container** (the motion.div in GlobeViewport that slides in from the right) doesn't slide or resize on variant change — only the inner content cross-fades. Verify with spec §7.3.2.

### Item duplication (§7.3)

Already handled implicitly: `VisitSection` renders its `visit.items` list. If the same item appears in two visits, it renders in both sections. No dedup logic needed.

---

## Acceptance criteria

- [ ] Clicking a trip label locks the trip and opens `TripPanel`.
- [ ] Panel header: `{trip.title}` + subtitle `{dateRange} · {N} visits`.
- [ ] "View trip article" button at top: active if trip has body, grayed otherwise.
- [ ] Clicking the button navigates to `/trip/<slug>` (route stub fine until D1 fully lands).
- [ ] Visits render in ascending date order.
- [ ] Per-section "View trip article" link is **absent** in trip panel (only the global button).
- [ ] Item duplication test: seed an item in 2 visits of one trip. Open that trip panel. Item renders in both visit sections.
- [ ] Panel close X unlocks trip and routes to `/globe`.
- [ ] Cross-fade: pin panel → click a trip label → panel inner content fades to empty then fades in trip panel. ~200ms. Container does not resize.
- [ ] Scroll position resets on variant switch (pin panel scrolled 100px down → switch to trip → trip starts at top).
- [ ] Item expansion state resets on variant switch.
- [ ] Boneyard name `trip-panel` wraps the component (fixture content pending F1).

## Non-goals

- **No cross-interaction (pin click within locked trip)** — C7.
- **No fixture JSX for boneyard** — F1.
- **No mobile layout** — E1.
- **No trip article route** — D1.
- **No camera rotation on trip lock** — C5.

## Gotchas

- **Data availability**: `tripsWithVisits` must be on context. If C1 didn't add it, this ticket adds it. Coordinate.
- **`VisitInTrip` vs `VisitSummary` mismatch**: the trip query embeds visits without the trip ref (since it's the parent). Adapt via the shim in TripPanel. Ugly but bounded.
- **`AnimatePresence mode="wait"`**: waits for exit animation before mounting the new component. Means panel is empty for ~200ms during switch. If that's jarring, use `mode="sync"` but accept overlap.
- **`ResizeObserver` inside panel**: if any child sets up a resize observer (e.g., auto-scroll region), the keyed remount on variant switch tears it down. Harmless; re-creates on mount.
- **Dispatcher inside motion.div** vs **motion.div inside dispatcher**: current design wraps each variant in a keyed motion.div. The outer `GlobeDetailPanel` is the dispatcher. GlobeViewport mounts it inside an already-animated slide-in container. Total: two layers of motion.div (slide + fade). OK because slide is on the container, fade is on the inner.
- **`lockedTrip` → setLockedTrip(null) in close handler**: check that this does not cause a URL mismatch. The `router.push('/globe')` + `setLockedTrip(null)` happen together; C1's URL-sync effect won't fire a redundant update.

## Ambiguities requiring clarification before starting

1. **Fetch strategy**: I proposed adding `allTripsWithVisitsQuery` to layout. Alternative is client-side fetching in TripPanel. Recommendation: layout-side. If a reviewer prefers lazy fetching (for the 200-visit-ceiling edge), refactor later.

   **Action**: layout-side bulk fetch.

2. **"View trip article" per visit in TripPanel**: spec §7.2 explicitly says "Per-visit sections do not duplicate this link." Implementation matches. Confirm.

3. **Item dedup**: spec §7.3 explicitly disables dedup. Implementation matches. Confirm.

4. **Cross-fade direction**: entering variant fades in; exiting variant fades out. No directional slide. Spec doesn't ask for directional. Simple crossfade.

5. **Panel container animation during cross-fade**: spec says "container itself does not slide or resize — only the inner content transitions." The outer slide-in is a one-time animation when the panel first opens. Staying open + switching variant → no container movement. Verified by putting the outer slide-in in GlobeViewport's AnimatePresence keyed on "any panel open" vs "no panel open" (not keyed on variant).

## Handoff / outputs consumed by later tickets

- `TripPanel.tsx` — C7 adds auto-scroll-to-visit via `onRef` callbacks; E1 renders inline on mobile.
- `allTripsWithVisitsQuery` — if added here, A2's query file now has 4 queries. Document.
- Cross-fade pattern — reused by E1 (mobile content region may need variant switching).

## How to verify

1. `/globe` — click "Japan Spring '22" label.
2. Trip panel opens: header "Japan Spring '22", subtitle "March 2022 · 3 visits".
3. Global "View trip article" button at top, active.
4. Three visit sections: Tokyo, Kyoto, Osaka (in ascending date order).
5. Scroll panel — headers sticky; Tokyo → Kyoto → Osaka as scroll proceeds.
6. No per-section "View trip article" links.
7. Berlin fixture where same item is in Tokyo + Osaka: item renders twice.
8. Now click a pin (Tokyo). Pin panel opens (cross-fade). Berlin-panel-style multi-section view for Tokyo.
9. Observe fade timing: ~200ms; container stays in place.
10. Scroll in pin panel, then click a trip label: variant switches, content scrolled back to top.
11. Click the "View trip article" in trip panel with body — goes to `/trip/...`.
12. Click "View trip article" for "Weekend in Lisbon" (no body) — grayed, hover shows tooltip.
