# 5C-C3 — `PinPanel` variant + shared panel chrome

**Epic**: C. Globe & Panels · **Owner**: Dev C · **Can be run by agent?**: Yes · **Estimated size**: M

## Dependencies

### Hard
- **C1** — `panelVariant`, `selectedPin` state.

### Soft
- None.

### Blocks
- **C4** (shares `PanelChrome` and `VisitSection`)
- **E1** (mobile layout renders the panel inline)
- **F1** (boneyard skeleton wraps this component)

---

## Goal

Split the existing `GlobeDetailPanel` into a dispatcher + `PinPanel` variant. Each pin panel shows one section per visit at that location, in chronological descending order (most recent first). Each section has a "View trip article" link and a collapsed items row. Introduces `PanelChrome` (shared header + close) and `VisitSection` (reused by C4's TripPanel).

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §7.1 Pin panel
- §7.3.1 Item click within any panel
- §7.3.3 Panel close behavior
- §8.3 Empty article body (grayed-out "View trip article")
- §13.6.1 Boneyard target: `pin-panel-multi`
- §17.3 Panel animation timings

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §7 in full
- [`../../components/globe/GlobeDetailPanel.tsx`](../../components/globe/GlobeDetailPanel.tsx) — current impl; refactor target
- [`../../components/globe/GlobeDetailItem.tsx`](../../components/globe/GlobeDetailItem.tsx) — item card (reuse inside VisitSection)
- [`../../components/globe/GlobeContext.tsx`](../../components/globe/GlobeContext.tsx) (post-C1)
- [`../../lib/types.ts`](../../lib/types.ts) — `VisitSummary`, `PinWithVisits`
- [README §5.2 Date formatting](./README.md#52-date-formatting)

## Files to create

- `components/globe/panels/PanelChrome.tsx` — shared header + close button
- `components/globe/panels/PinPanel.tsx` — pin variant
- `components/globe/panels/VisitSection.tsx` — per-visit section (reused by C4)
- `lib/formatDates.ts` — date formatters (shared utility)

## Files to modify

- `components/globe/GlobeDetailPanel.tsx` — becomes a thin dispatcher based on `panelVariant`
- `components/globe/GlobeViewport.tsx` — minor; uses the dispatcher

## Files to delete

- None.

---

## Implementation guidance

### `lib/formatDates.ts`

```ts
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function formatMonthYear(iso: string): string {
  const y = iso.slice(0, 4)
  const m = Number(iso.slice(5, 7)) - 1
  return `${MONTHS[m]} ${y}`
}

export function formatFullDate(iso: string): string {
  const y = iso.slice(0, 4)
  const m = Number(iso.slice(5, 7)) - 1
  const d = Number(iso.slice(8, 10))
  return `${MONTHS[m]} ${d}, ${y}`
}

export function formatDateRange(startIso: string, endIso: string): string {
  const startY = startIso.slice(0, 4)
  const endY = endIso.slice(0, 4)
  const startM = startIso.slice(5, 7)
  const endM = endIso.slice(5, 7)

  // Same month and year — "March 15–20, 2022"
  if (startY === endY && startM === endM) {
    const m = Number(startM) - 1
    const startD = Number(startIso.slice(8, 10))
    const endD = Number(endIso.slice(8, 10))
    if (startD === endD) return `${MONTHS[m]} ${startD}, ${startY}`  // single day
    return `${MONTHS[m]} ${startD}–${endD}, ${startY}`
  }

  // Different months — "March 2022 — April 2022" (or "March 2022 — April 2024")
  return `${formatMonthYear(startIso)} – ${formatMonthYear(endIso)}`
}
```

### `PanelChrome.tsx`

```tsx
'use client'

import { useGlobe } from '../GlobeContext'

interface Props {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}

export default function PanelChrome({ title, subtitle, onClose, children }: Props) {
  return (
    <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 h-full flex flex-col">
      <div className="flex items-start justify-between p-4 pb-2 border-b border-gray-100 dark:border-gray-900">
        <div className="min-w-0">
          <h2 className="text-sm tracking-widest uppercase font-light text-black dark:text-white truncate">
            {title}
          </h2>
          {subtitle && (
            <span className="text-[10px] tracking-widest uppercase text-gray-400 dark:text-gray-500 block mt-0.5">
              {subtitle}
            </span>
          )}
        </div>
        <button
          data-no-skeleton
          onClick={onClose}
          className="w-12 h-12 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white transition-colors text-lg cursor-pointer shrink-0"
          aria-label="Close panel"
        >
          &times;
        </button>
      </div>
      <div
        className="flex-1 overflow-y-auto"
        style={{ overscrollBehavior: 'contain' }}
      >
        {children}
      </div>
    </div>
  )
}
```

### `VisitSection.tsx`

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGlobe } from '../GlobeContext'
import GlobeDetailItem from '../GlobeDetailItem'
import { formatDateRange } from '@/lib/formatDates'
import type { VisitSummary } from '@/lib/types'

interface Props {
  visit: VisitSummary
  /** Show per-section "View trip article" link. Pin panels: true. Trip panels: false (global link at top). */
  showViewTripArticleLink: boolean
  /** Sticky header if this section lives in a scrollable list. */
  sticky?: boolean
  /** Callback exposed for C7 auto-scroll pattern. */
  onRef?: (el: HTMLElement | null, visitId: string) => void
  /** Is this section receiving a cross-interaction pulse? (C7) */
  pulsing?: boolean
}

export default function VisitSection({ visit, showViewTripArticleLink, sticky, onRef, pulsing }: Props) {
  const router = useRouter()
  const { trips } = useGlobe()
  const [expanded, setExpanded] = useState(false)

  const tripMeta = trips.find((t) => t._id === visit.trip._id)
  const hasArticle = tripMeta?.hasArticle ?? false

  const dateLabel = formatDateRange(visit.startDate, visit.endDate)

  const handleViewArticle = () => {
    if (!hasArticle) return
    router.push(`/trip/${encodeURIComponent(visit.trip.slug.current)}`, { scroll: false })
  }

  return (
    <section
      ref={(el) => onRef?.(el, visit._id)}
      className={`border-b border-gray-100 dark:border-gray-900 last:border-b-0 transition-colors duration-[600ms] ${
        pulsing ? 'bg-[var(--accent)]/10' : 'bg-transparent'
      }`}
    >
      <header
        className={`px-4 py-3 bg-white dark:bg-black ${sticky ? 'sticky top-0 z-10' : ''}`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs tracking-widest uppercase font-light text-black dark:text-white truncate">
              {dateLabel}
            </p>
            <p className="text-[10px] tracking-wide text-gray-400 dark:text-gray-500 truncate">
              {visit.trip.title}
            </p>
          </div>
          {showViewTripArticleLink && (
            <button
              onClick={handleViewArticle}
              disabled={!hasArticle}
              aria-disabled={!hasArticle}
              title={hasArticle ? 'View trip article' : 'No content available for this trip.'}
              className={`text-[10px] tracking-widest uppercase shrink-0 px-2 py-1 border transition-colors ${
                hasArticle
                  ? 'border-black dark:border-white text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black cursor-pointer'
                  : 'border-gray-200 dark:border-gray-800 text-gray-300 dark:text-gray-700 cursor-not-allowed'
              }`}
            >
              View trip article
            </button>
          )}
        </div>
      </header>

      {/* Collapsible items row */}
      {visit.items.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-full px-4 py-2 flex items-center justify-between text-left text-[10px] tracking-widest uppercase text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors cursor-pointer"
            aria-expanded={expanded}
          >
            <span>
              {visit.items.length} {visit.items.length === 1 ? 'item' : 'items'}
            </span>
            <span data-no-skeleton aria-hidden>{expanded ? '▴' : '▾'}</span>
          </button>
          {expanded && (
            <div>
              {visit.items.map((item) => (
                <GlobeDetailItem key={item._id} item={item} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
```

**Note**: `GlobeDetailItem` expects a `GlobePinItem` shape. After A2 that interface may have changed; verify it accepts a `ContentSummary` or adapt:

```tsx
// If needed, inline the item render here and skip GlobeDetailItem entirely,
// or adjust GlobeDetailItem's props to accept ContentSummary.
```

### `PinPanel.tsx`

```tsx
'use client'

import { Skeleton } from 'boneyard-js/react'
import PanelChrome from './PanelChrome'
import VisitSection from './VisitSection'
import { useGlobe } from '../GlobeContext'
import type { PinWithVisits } from '@/lib/types'

interface Props {
  pin: PinWithVisits
}

export default function PinPanel({ pin }: Props) {
  const { selectPin } = useGlobe()

  const subtitle = pin.visits.length === 1
    ? undefined
    : `${pin.visits.length} visits`

  return (
    <Skeleton name="pin-panel-multi" loading={false} fixture={/* see F1 */ null}>
      <PanelChrome
        title={pin.location.name}
        subtitle={subtitle}
        onClose={() => selectPin(null)}
      >
        {pin.visits.map((visit) => (
          <VisitSection
            key={visit._id}
            visit={visit}
            showViewTripArticleLink
            sticky
          />
        ))}
      </PanelChrome>
    </Skeleton>
  )
}
```

The `loading` + `fixture` props are for boneyard — F1 wires the fixture. Pass `loading={false}` here (pin data is always ready by the time PinPanel mounts).

### `GlobeDetailPanel.tsx` — dispatcher

```tsx
'use client'

import { useGlobe } from './GlobeContext'
import PinPanel from './panels/PinPanel'
// TripPanel imported once C4 lands
// import TripPanel from './panels/TripPanel'

export default function GlobeDetailPanel() {
  const { panelVariant, pins, selectedPin, lockedTrip, trips } = useGlobe()

  if (panelVariant === 'pin' && selectedPin) {
    const pin = pins.find((p) => p.location._id === selectedPin)
    if (!pin) return null
    return <PinPanel pin={pin} />
  }

  if (panelVariant === 'trip' && lockedTrip) {
    // TripPanel TBD in C4 — render nothing until then.
    return <div className="p-4 text-xs text-gray-400">Trip panel pending (C4)</div>
  }

  return null
}
```

Once C4 lands, swap the TBD block for `<TripPanel tripId={lockedTrip} />`.

### `GlobeViewport.tsx` — minor change

Current viewport passes `<GlobeDetailPanel pin={pin} />`. Now pass nothing — the dispatcher reads from context:

```tsx
// Replace
<GlobeDetailPanel pin={selectedPinData} />
// with
<GlobeDetailPanel />
```

And delete the prop usage on both sides.

---

## Acceptance criteria

- [ ] Clicking a pin opens a panel with one section per visit, descending date order (newest first).
- [ ] Header format: `{location.name}` (title) + `{N} visits` (subtitle, only when > 1).
- [ ] Each visit section shows `{dateRange}` + `{trip.title}` on top.
- [ ] Each visit section has a "View trip article" link — active if the trip has a body, grayed otherwise with tooltip "No content available for this trip."
- [ ] Items row is collapsed by default ("12 items ▾"). Click expands; click again collapses.
- [ ] Multi-visit fixture (Berlin 2022 + Berlin 2024) shows 2 sections; sticky headers swap correctly as user scrolls.
- [ ] Close X button clears `selectedPin` → panel unmounts → `pinSubregionHighlight` clears (via C1/C2 effect).
- [ ] Panel respects existing slide-in transition (handled by `GlobeViewport`'s `<motion.div>`).
- [ ] `GlobeDetailPanel.tsx` is a pure dispatcher — no pin/trip logic inside.
- [ ] Dark mode works (verify with `.dark` class on `<html>`).

## Non-goals

- **No trip panel** — C4.
- **No cross-interaction (pin-click-within-locked-trip scroll-to-visit)** — C7.
- **No cross-fade between pin and trip variants** — C4 (bundles with trip panel introduction).
- **No sliver article opening** — works already from Phase 5B; this ticket's "View trip article" button is net-new to C4's trip route (D1). In the interim, the button routes to `/trip/<slug>` which 404s until D1 lands. Document: graceful degradation.
- **No boneyard fixture** — F1 adds the fixture JSX.

## Gotchas

- **`GlobeDetailItem` prop shape**: current component takes a `GlobePinItem`. Post-A2, the `items` in a visit are `ContentSummary[]`. Two fixes:
  - **(a)** Update `GlobeDetailItem`'s prop to `ContentSummary` (change field names if needed).
  - **(b)** Adapt at the call site: map `ContentSummary` → `GlobePinItem`-shape.

  Recommend (a) — `GlobeDetailItem` is small; change the prop type. `locationLabel` and `year` fields don't exist on `ContentSummary` — either remove from render or compute from `visit.startDate`.

  **Action**: simplify `GlobeDetailItem` to take `ContentSummary`, remove `locationLabel` render (the visit section's header already conveys this). Keep `year` if derivable from something — or drop.

- **`router.push('/trip/<slug>')` before D1 lands**: the route 404s. Users clicking it before D1 get a 404 page. Acceptable in interim. Note in PR.

- **Sticky header stacking**: two sticky `top: 0` headers inside the same scroll container stack poorly — browser swaps them on scroll. Works correctly for the "most recent header at top" UX spec §7.1 expects. Test with 2+ visits.

- **Item rendering cost**: expanded items render `<GlobeDetailItem>` per item. With 20+ items in a visit, this could be a bit heavy. Acceptable per §13.5.2 target capacity.

- **Disabled button + click**: `disabled` attribute prevents onClick from firing in most browsers, so we don't need extra guard. `aria-disabled` and `title` give SR/tooltip support.

- **Tooltip on disabled link (§8.3)**: browser default title attribute suffices for desktop. Mobile users see a popover via touch-and-hold on iOS, which matches "tap on the grayed-out link shows the same message as a popover label" from §8.3. Acceptable minimal implementation.

## Ambiguities requiring clarification before starting

1. **`GlobeDetailItem` — full rewrite or adapter?**: recommendation is update its prop type to `ContentSummary`. Alternative is to inline item cards inside `VisitSection` and drop the shared component. Inlining is 30 lines; shared component pulls in dependencies. Small decision.

   **Action**: update `GlobeDetailItem` to take `ContentSummary`. Update field reads accordingly.

2. **Item "year" field**: `GlobeDetailItem` currently shows `item.year`. After refactor, derive from `visit.startDate.slice(0, 4)` at the call site, or drop year entirely.

   **Action**: derive from `visit.startDate`. Show year as a separate prop, or inline.

3. **Disabled-button styling**: using `cursor-not-allowed` + gray. If reviewer wants different affordance (e.g., `opacity-50`), adjust.

4. **Sticky header background**: uses `bg-white dark:bg-black`. Without this, scrolled content shows through. Verified in implementation.

## Handoff / outputs consumed by later tickets

- `PanelChrome.tsx` — reused by C4's TripPanel.
- `VisitSection.tsx` — reused by C4 (with `showViewTripArticleLink={false}`) and C7 (for `onRef` + `pulsing`).
- `lib/formatDates.ts` — reused by C4, E2 (mobile trip list rows).
- `GlobeDetailPanel.tsx` dispatcher — C4 adds the trip branch.

## How to verify

1. `/globe` — click a pin with 1 visit. Panel opens: title is location name, no subtitle (or subtitle with "1 visit" if you didn't gate), one section.
2. Click the Berlin pin: subtitle "2 visits"; two sections sorted newest-first.
3. Scroll the panel: sticky section headers swap. Berlin 2024 header visible first; scroll down → Berlin 2022 header replaces.
4. Click "12 items ▾" (any visit with items) — expands. Click again — collapses.
5. Click "View trip article" on a trip with body — navigates to `/trip/<slug>` (404s until D1).
6. Click "View trip article" on a trip without body (Weekend in Lisbon fixture) — button is grayed; hover shows tooltip.
7. Click X close — panel closes. `selectedPin` null. `pinSubregionHighlight` also null (via C1/C2 effect).
8. Dark mode: add `.dark` to `<html>`. Colors swap.

---

## Shipped implementation notes (2026-04-22, PR #36)

Decisions and deviations from the original plan, recorded so C4/C7/F1 don't have to re-derive them from the diff.

### Decisions taken

- **`GlobeDetailItem` prop: full migration to `VisitItemSummary`** (spec option (a)). Removed `locationLabel` and `year` render entirely — the visit section's sticky header conveys both, so item cards only show title + "Post" badge now. Consequence: item cards are visually leaner inside expanded sections than they were in the pre-C3 flat list.
- **`GlobePinItem` adapter type deleted** from `lib/globe.ts`. Nothing else consumed it; `GlobeDetailItem` now imports `VisitItemSummary` from `lib/types.ts` directly.
- **Trip variant of the dispatcher returns `null`** (not the `"Trip panel pending (C4)"` placeholder the spec draft showed). Rationale from review: B4 already wires trip-lock plumbing, and a visible placeholder can surface mid-integration. C4 will replace the `null` branch with `<TripPanel />`.
- **`Skeleton` wrapper is installed around `PinPanel`** with `name="pin-panel-multi"`, `loading={false}`, no `fixture` yet. F1 adds the fixture prop without needing to touch `PinPanel` structurally.
- **Sticky headers carry their own `border-b`** (not just the parent `<section>`'s bottom border). Without this the stuck header sits flush against scrolling content with no divider as the section's own bottom border scrolls away.
- **Pin visits are NOT re-sorted inside the component.** `aggregatePins` in `lib/globe.ts:~136` already sorts descending by `startDate`. `PinPanel` just maps in order. If the sort contract changes, update `aggregatePins`, not the panel.

### `VisitSection` API shape (for C4/C7)

Finalized props:
- `visit: VisitSummary | VisitInTrip` — either shape works. When `visit` has a `trip` ref (i.e. it's a `VisitSummary` from the pin panel), the "View trip article" button uses it. When it doesn't (a `VisitInTrip` from the trip panel), that button is omitted regardless of `showViewTripArticleLink`.
- `showViewTripArticleLink: boolean` — pin panels pass `true`, trip panels pass `false`.
- `sticky?: boolean` — pass `true` inside scrollable panel lists.
- `secondaryLabel?: string` — optional override for the line under the date. Pin panels leave this unset and let the component fall back to `visit.trip.title`. **Trip panels should pass `secondaryLabel={visit.location.name}`** since `VisitInTrip` has no trip back-ref.
- `onRef?: (el, visitId) => void` — set by C7 to register each section's DOM node for auto-scroll targeting. Not memoised inside the component; callers should wrap their handler in `useCallback` to avoid re-registration on every render.
- `pulsing?: boolean` — C7 sets this to trigger the background-tint pulse.

Known follow-up for C4/C7: the `VisitLike` union type inside `VisitSection.tsx` is intentionally loose (`VisitInTrip & { trip?: … }`) to keep the component agnostic today. If the union becomes awkward once C4 lands, promote `tripRef` to a separate optional prop and narrow `visit` to the base visit shape.

### Gotchas confirmed in implementation

- **`'trip' in visit` guard** — used instead of runtime tagging because both `VisitSummary` and `VisitInTrip` have distinct structural signatures. Works today; revisit if type surface grows.
- **`disabled` + `onClick`** — the browser really does suppress clicks on disabled buttons, so the `if (!hasArticle) return` guard in `handleViewArticle` is belt-and-braces and can be dropped if someone wants to lean on HTML semantics.
- **Sticky stacking order** — browser swaps sticky headers naturally as they scroll past each other. No explicit `z-index` arithmetic required; one `z-10` per header is enough.

### Tests added

- `lib/formatDates.test.ts` — covers all three `formatDateRange` branches (single day, same-month, cross-month) plus `formatMonthYear` and `formatFullDate`.

### Verification deferred

Interactive panel behavior (sticky-header swap on scroll, expand/collapse, disabled "View trip article" tooltip) was not auto-verified in CI — the R3F raycaster doesn't fire on synthesized pointer events from a headless harness. Human smoke test required on first `/globe` load with the multi-visit Berlin fixture.
