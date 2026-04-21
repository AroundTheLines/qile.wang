# 5C-B2 — Timeline component prototype (isolated, mock data)

**Epic**: B. Timeline & Playback · **Owner**: Dev B · **Can be run by agent?**: Yes (feel-based styling calls benefit from human review) · **Estimated size**: M

**Status**: ✅ Shipped (PR #29). See [Implementation notes (as shipped)](#implementation-notes-as-shipped) for deviations from the original spec that downstream tickets should inherit.

## Dependencies

### Hard
- **B1** — imports `buildCompressedMap` and types.

### Soft
- None.

### Blocks
- B3 (extends this component with zoom/pan).

---

## Goal

Build the first real rendering of `<Timeline>` using **mock data** at a dev-only route `/timeline-dev`. The spec (§15) explicitly calls for isolated development before integration — UX-visible decisions (label placement, segment styling, tick density) are easier to iterate when detached from Sanity.

This ticket **replaces** the A3 stub `Timeline.tsx` with a real component. Wiring to real data happens in B4.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §4.1 Visual structure
- §4.4 Labels (basic placement — collision handling is B5)
- §4.5 Time axis (year + month labels, today marker)
- §17.1 Light mode visual defaults
- §17.2 Dark mode visual defaults
- §15 Implementation order — "timeline prototype first"

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §4, §17
- [`../../lib/timelineCompression.ts`](../../lib/timelineCompression.ts) (from B1)
- [`../../components/wardrobe/WardrobeCarousel.tsx`](../../components/wardrobe/WardrobeCarousel.tsx) — prior art for pointer-event-driven component patterns
- [`../../app/globals.css`](../../app/globals.css) — check for existing accent / theme variables

## Files to create

- `lib/timelineMocks.ts` — mock `TripRange[]` data for the prototype route
- `components/globe/TimelineSegment.tsx` — single trip segment renderer
- `components/globe/TimelineAxis.tsx` — year/month tick renderer + today marker
- `app/timeline-dev/page.tsx` — dev-only preview page

## Files to modify

- `components/globe/Timeline.tsx` — **replace the A3 stub** with real implementation (taking props so it works with both mock and real data)

## Files to delete

- None yet. Dev route retires in B8.

---

## Implementation notes (as shipped)

The ticket shipped in PR #29 with several intentional deviations from the original implementation sketch below. Downstream tickets (B3–B8) should treat these as the current baseline rather than the original spec literal reading.

### Layout reshape: axis above, labels stacked below

The spec (§4.1, §4.4) describes labels that "float above or below the segment, placed by density." The original sketch implemented this with alternating `row: i % 2` placement above/below the track. During mobile iteration this was replaced with:

- **Year axis and TODAY marker moved above the track** (not below). Reason: preserves the vertical region below the track as a dedicated lane for trip labels so they never compete with axis labels for the same pixel rows.
- **All trip labels stack below the track in packed rows.** Greedy first-fit row packing based on measured label widths; each row is `LABEL_ROW_HEIGHT = 14px`.
- **Each label has a thin vertical connector line** from the track down to the label's row. This is the "pin" that anchors the horizontal label back to its exact position on the timeline — needed because packed rows push labels sideways from their true anchor.
- **Timeline height is dynamic.** The wrapper's `minHeight` grows with `rowCount`. The original `h-16 md:h-20` fixed heights were dropped.

The §4.4 "rotate to 45° on collision" default was not implemented. The stacked-below-with-connectors pattern handles density natively without rotation. B5 should preserve this direction unless a reviewer asks to revisit.

### Short/long label mode

To keep stack height manageable when many short trips cluster in a narrow window, labels render in two forms:

- **Short form** (default): first whitespace-delimited token of the title (e.g. "Morocco '18" → "Morocco"). Packing uses short-form widths.
- **Full form** (on hover or click/tap): the full `trip.title`.

Between states the component cross-fades: width interpolates from short to full, background pill (white/black at 95% opacity, `rounded-sm`, `shadow-sm`, `ring-1`) fades in, and the two text spans cross-fade via opacity. All transitions are 150ms `ease-out`. See the Tap-target follow-up in the Known-debts section.

**Duplicate short-form collision is handled.** If two or more trips share the same short token (e.g. "Berlin '22" + "Berlin '24" both shortening to "Berlin"), `computeDisplayLabels()` falls back to the full title for those trips' short form — so the compact row stays disambiguated without requiring hover.

### Touch support

Each label exposes `onClick` in addition to `onMouseEnter`/`onMouseLeave`. Tapping a label toggles its active (expanded) state, so the short/full reveal is reachable on touch devices. Tapping the timeline background (non-label area) clears the active state. This is a stopgap for dev-only testing — the real mobile single-tap preview behavior (§10.3) lands in E3 and will likely supersede this click handler.

### Stability fixes worth carrying forward

Two subtle bugs were caught and fixed during review; B3 onward must not regress them:

1. **Subpixel measurement oscillation.** `getBoundingClientRect().width` returns fractional pixels, and strict equality (`===`) between floats makes the label-width state "change" every render, re-triggering the packer infinitely. Fix: `Math.ceil()` measured widths before storing.
2. **Hover-induced scrollbar feedback loop.** When a hovered label expanded past the wrapper's right edge, it pushed a horizontal scrollbar onto the page, which reduced the wrapper's content width, which re-packed labels, which potentially removed or added the overflow, which toggled the scrollbar, etc. Fix: `overflow-hidden` on the wrapper. This is now **load-bearing** — do not remove it without also adding a different boundary on expanded label width.

Additional hardening that B4 should be aware of:

- **Initial synchronous width measurement.** `useEffect` reads `wrapperRef.current.getBoundingClientRect().width` and calls `setWidth(...)` synchronously before starting the `ResizeObserver`. Without this, the first paint renders with `width = 0` and everything gated behind `width > 0` skips — producing a one-frame layout-less flash. Keep the sync measurement.
- **Effect dep uses a stable content key, not `trips`.** The measurement `useLayoutEffect` depends on a serialized `measureKey` derived from each trip's id + short + full label. This way it only re-measures when label content actually changes, not whenever a parent passes a fresh `trips` array reference. B4 should still memoize the Sanity query result, but this guard means a parent slip-up won't thrash the DOM.
- **Measurement layer is memoized** via `useMemo`. Re-renders driven by `width`/`activeId` changes don't re-render the ~2N hidden measurement spans.
- **`overflow-hidden` hides content clipped at the right edge.** An expanded label is clamped to `innerWidth - fullWidth - HOVER_HPAD * 2` on hover so clipping shouldn't happen in practice, but if B3 adds panning and the clamp fails on a pan edge, the overflow will silently cut off.

### Component API (as shipped)

```tsx
// components/globe/Timeline.tsx
export interface TimelineProps {
  /** If null or empty, renders "Nothing yet" (§12.1). */
  trips: (TripRange & { title?: string })[]
  /** Optional class name for the outer wrapper. */
  className?: string
  /** For dev-mode testing. Production passes undefined (uses actual now). */
  now?: string
}
```

The `trips` prop widens `TripRange` with an optional `title` field because the B1 `TripRange` type does not include `title`. B4 should narrow this back to a concrete `TripWithTitle` type once the Sanity shape is known.

### Known debts / handoff notes

- **Label collision handling is greedy first-fit.** Produces stable rows for the 9-trip mock set but can make room decisions that are visually suboptimal for hot-swap scenarios. B5 is the designated polish ticket — it can rework this if needed.
- **Tap targets are short-width-sized.** Each label's hit area equals its visible pill (often 25–60px). This is below the 44×44 iOS / 48×48 Material minimum. A follow-up chip was spawned ("Enlarge timeline tap targets for touch") — the fix belongs with E3 (mobile preview label) when touch gestures land.
- **No mobile hover equivalent built in yet beyond click-to-toggle.** On touch, the user taps to expand, taps again to collapse. The real single-tap preview UX (§10.3 — "expands inline to show trip name, dates, and 'View trip' button") is E3's scope; the current click handler will likely be replaced there.
- **Label clipping cue** (§4.4 "extends further" hint for trips outside the zoom window): not implemented. Belongs in B3 when zoom/pan lands.
- **Visit tick marks on highlight** (§4.6): not implemented. Belongs in B4/B5 once highlight state exists.

### Numeric constants (for reference)

```
TRACK_INSET_X = 16px        Left/right gutter around the track
LABEL_ROW_HEIGHT = 14px     Per-row vertical slot for stacked labels
LABEL_HORIZONTAL_GAP = 8px  Min gap between packed labels in the same row
HOVER_HPAD = 4px            Padding inside the expanded-label pill
YEAR_AXIS_Y = 16            Y of the year/month tick row (above track)
YEAR_AXIS_HEIGHT = 12
TRACK_Y = 32                (= YEAR_AXIS_Y + YEAR_AXIS_HEIGHT + 4)
FIRST_LABEL_Y = 42          (= TRACK_Y + TRACK_TO_LABELS)
BOTTOM_PADDING = 8
```

All transition durations are 150ms ease-out. These values are tunable — they're constants at the top of `Timeline.tsx`, not scattered magic numbers.

---

## Implementation guidance (original sketch, preserved for reference)

_The ticket was drafted with the sketch below. It was superseded by the shipped implementation (see above) in the following ways:_
- _`row: i % 2` alternating placement above/below the track → replaced with greedy row packing below only, with connectors._
- _Fixed `h-16 md:h-20` wrapper height → replaced with dynamic `minHeight` based on row count._
- _Labels as a child of `TimelineSegment` → labels moved to `Timeline.tsx` which has global view of all labels for collision avoidance._
- _`today` marker positioned at bottom-of-track → moved to top of wrapper (above axis)._

_The original sketch is kept here so future readers can see what changed._

### Component API (original)

```tsx
// components/globe/Timeline.tsx — ORIGINAL SKETCH (not shipped)
'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import { buildCompressedMap, type TripRange, type CompressedMap } from '@/lib/timelineCompression'
import TimelineSegment from './TimelineSegment'
import TimelineAxis from './TimelineAxis'

export interface TimelineProps {
  /** If null or empty, renders "Nothing yet" (§12.1). */
  trips: TripRange[]
  /** Optional class name for the outer wrapper. */
  className?: string
  /** For dev-mode testing. Production passes undefined. */
  now?: string
}

export default function Timeline({ trips, className, now }: TimelineProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const compressed = useMemo<CompressedMap>(
    () => buildCompressedMap(trips, { now }),
    [trips, now]
  )

  if (trips.length === 0) {
    return (
      <div
        ref={wrapperRef}
        className={`w-full h-16 md:h-20 flex items-center justify-center text-xs tracking-widest uppercase text-black/30 dark:text-white/30 ${className ?? ''}`}
      >
        Nothing yet
      </div>
    )
  }

  return (
    <div
      ref={wrapperRef}
      className={`w-full h-16 md:h-20 relative bg-black/5 dark:bg-white/5 ${className ?? ''}`}
    >
      {/* Track area */}
      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-1.5">
        {/* Actual track line */}
        <div className="absolute inset-0 bg-black/10 dark:bg-white/10" />

        {/* Segments */}
        {width > 0 && trips.map((trip, i) => (
          <TimelineSegment
            key={trip.id}
            trip={trip}
            compressed={compressed}
            containerWidth={width - 32} // minus inset-x-4 × 2
            row={i % 2}  // alternate above/below — crude collision avoidance; B5 polishes
          />
        ))}

        {/* Today marker */}
        <div
          data-no-skeleton
          className="absolute top-[-8px] bottom-[-8px] w-px bg-black/35 dark:bg-white/40 pointer-events-none"
          style={{ left: '100%' }}
        >
          <span className="absolute top-[-14px] -translate-x-1/2 text-[9px] tracking-widest uppercase text-black/35 dark:text-white/40">
            today
          </span>
        </div>
      </div>

      {/* Axis ticks */}
      <TimelineAxis
        compressed={compressed}
        containerWidth={width - 32}
        leftOffset={16}
      />
    </div>
  )
}
```

### `TimelineSegment.tsx` (original — included per-segment label rendering)

```tsx
'use client'

import type { CompressedMap, TripRange } from '@/lib/timelineCompression'

interface Props {
  trip: TripRange & { title?: string }  // title optional — mocks may include it; real data will
  compressed: CompressedMap
  containerWidth: number
  row: 0 | 1   // 0 = label above, 1 = label below
}

export default function TimelineSegment({ trip, compressed, containerWidth, row }: Props) {
  const x0 = compressed.dateToX(trip.startDate)
  const x1 = compressed.dateToX(trip.endDate)
  const leftPx = x0 * containerWidth
  const widthPx = Math.max(2, (x1 - x0) * containerWidth)

  const isDot = widthPx < 12
  // Dots render as circles; bars as rectangles. B5 refines.

  return (
    <div
      className="absolute inset-y-0"
      style={{ left: leftPx, width: widthPx }}
    >
      {/* Segment */}
      {isDot ? (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-black/20 dark:bg-white/[.18]"
          style={{ left: '50%', transform: 'translate(-50%, -50%)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/20 dark:bg-white/[.18]" />
      )}

      {/* Label (above for row 0, below for row 1) */}
      <span
        className={`absolute left-0 text-[10px] tracking-widest uppercase text-black/80 dark:text-white/80 whitespace-nowrap ${
          row === 0 ? 'bottom-[calc(100%+4px)]' : 'top-[calc(100%+4px)]'
        }`}
      >
        {trip.title ?? trip.id}
      </span>
    </div>
  )
}
```

### `TimelineAxis.tsx` (original)

```tsx
'use client'

import type { CompressedMap } from '@/lib/timelineCompression'

interface Props {
  compressed: CompressedMap
  containerWidth: number
  leftOffset: number  // px — matches Timeline's inset-x-4
}

export default function TimelineAxis({ compressed, containerWidth, leftOffset }: Props) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 h-4 pointer-events-none"
      style={{ paddingLeft: leftOffset, paddingRight: leftOffset }}
    >
      {compressed.tickMarks.map((tick) => (
        <span
          key={`${tick.kind}-${tick.date}`}
          className={`absolute top-0 -translate-x-1/2 ${
            tick.kind === 'year'
              ? 'text-[9px] tracking-widest uppercase text-black/40 dark:text-white/40'
              : 'text-[8px] text-black/25 dark:text-white/25'
          }`}
          style={{ left: tick.x * containerWidth }}
        >
          {tick.label}
        </span>
      ))}
    </div>
  )
}
```

### `lib/timelineMocks.ts`

```ts
import type { TripRange } from './timelineCompression'

export const MOCK_TRIPS: (TripRange & { title: string })[] = [
  { id: '1', title: "Morocco '18",         startDate: '2018-05-10', endDate: '2018-05-17' },
  { id: '2', title: "Tokyo 2019",           startDate: '2019-04-01', endDate: '2019-04-10' },
  { id: '3', title: "Japan Spring '22",     startDate: '2022-03-05', endDate: '2022-03-18' },
  { id: '4', title: "Berlin '22",           startDate: '2022-09-01', endDate: '2022-09-07' },
  { id: '5', title: "Weekend in Lisbon",   startDate: '2023-02-17', endDate: '2023-02-19' },
  { id: '6', title: "SF Q4 '23",            startDate: '2023-10-15', endDate: '2023-10-22' },
  { id: '7', title: "Seattle Q4 '23",       startDate: '2023-10-18', endDate: '2023-10-25' },
  { id: '8', title: "NYC Day Trip",         startDate: '2024-01-20', endDate: '2024-01-20' },
  { id: '9', title: "Berlin '24",           startDate: '2024-06-10', endDate: '2024-06-20' },
]
```

### `app/timeline-dev/page.tsx`

```tsx
import Timeline from '@/components/globe/Timeline'
import { MOCK_TRIPS } from '@/lib/timelineMocks'

export const metadata = { title: 'Timeline dev' }

export default function TimelineDevPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-black flex flex-col">
      <div className="flex-1" />
      <Timeline trips={MOCK_TRIPS} now="2024-04-15" />
      <div className="flex-1" />
    </main>
  )
}
```

---

## Acceptance criteria

- [x] `/timeline-dev` renders a full-width timeline with 9 mock segments.
- [x] Segments are horizontally positioned proportionally via the compression map.
- [x] Year labels render along the **top** of the wrapper (above the track) — changed from original "along the bottom."
- [x] "Today" marker visible at the right edge with a "today" text label at the top of the wrapper.
- [x] Labels stack in packed rows **below** the track with connector lines pointing to anchors — changed from original "alternate above/below."
- [x] Single-day trip (NYC Day Trip, `startDate === endDate`) renders as a dot, not a zero-width bar.
- [x] Empty trips array renders the "Nothing yet" state.
- [x] Dark mode (toggle via adding `.dark` class to `<html>` in dev tools): colors swap per §17.2.
- [x] Hover (desktop) or tap (touch) a label: crossfades from short to full with a readable background pill; clamped to wrapper bounds.
- [x] `npm run build` compiles; `/timeline-dev` loads without errors.

## Non-goals

- **No zoom/pan** — B3.
- **No hover/click interactions that affect the globe** — B4. (The local click-to-toggle for label expansion is a dev-only affordance; B4 replaces it with real interactions.)
- **No label collision handling beyond greedy row packing** — B5.
- **No playback playhead** — B6.
- **No Sanity integration** — B4.
- **No mobile stickiness / squeeze** — E1.
- **No tap-target sizing for real touch UX** — deferred with follow-up chip; see E3.

## Gotchas (hardened in shipped version)

- **`use client`** required — uses hooks (`useRef`, `useEffect`, `useState`, `useMemo`, `useLayoutEffect`).
- **`ResizeObserver` SSR safety**: wrap in `useEffect` so it only runs on client. Also do a synchronous `setWidth(rect.width)` before `obs.observe(el)` to avoid a `width === 0` first paint.
- **Subpixel measurement oscillation**: always `Math.ceil()` `getBoundingClientRect().width` before storing in state. Strict equality on raw floats creates a re-render loop.
- **Overflow scrollbar feedback loop**: keep `overflow-hidden` on the wrapper. Expanded labels clamp inside `innerWidth` on hover but `overflow-hidden` is the safety net.
- **Effect-dep thrash**: if future callers pass a fresh `trips` array reference every render, the measurement effect must still not thrash the DOM. The shipped version uses a stable serialized `measureKey` dep derived from id + short + full strings.
- **Tick label x-position**: apply the same horizontal inset (`TRACK_INSET_X = 16px`) used for segments; otherwise ticks and segments won't line up.
- **`widthPx = Math.max(2, ...)` for visibility**: a zero-width rect doesn't render. The `isDot` branch (< 12px) renders a circle instead — avoid two competing visibility hacks.

## Ambiguities requiring clarification before starting (resolved)

1. **Segment colors**: Resolved — Tailwind `bg-black/20` / `bg-white/[.18]` match §17.1 / §17.2 defaults exactly.
2. **Timeline height**: Resolved — fixed `h-16 md:h-20` was dropped entirely. Height is dynamic based on packed row count. Mobile squeeze logic (§3) is E1's scope.
3. **Label text for mock data**: Resolved — both mock and production data use `trip.title`.
4. **Short/long label behavior**: added during implementation after mobile review — see [Short/long label mode](#shortlong-label-mode) above.

## Handoff / outputs consumed by later tickets

- **`Timeline.tsx`** with `TimelineProps` signature: `{ trips: (TripRange & { title?: string })[], className?, now? }`. B3–B7 modify in place; B4 changes the `trips` source from mock to real data and should narrow the `title` type.
- **`TimelineSegment.tsx`**: reused by B4, B5. No longer renders labels — just the segment body (bar/dot).
- **`TimelineAxis.tsx`**: reused by B3 (zoom-driven tick recomputation). Positioned by parent via top/height, not by internal `bottom-0`.
- **`lib/timelineMocks.ts`**: dev-only, removed in B8.
- **`/timeline-dev`**: deleted in B8.
- **Layout constants** (see [Numeric constants](#numeric-constants-for-reference)): reused across B3–B7. Single source of truth is the top of `Timeline.tsx`.
- **Follow-up chip** spawned: "Enlarge timeline tap targets for touch" — should land with E3.

## How to verify

1. `npm run dev`
2. Open `http://localhost:3000/timeline-dev`.
3. See 9 segments, years across **top**, "today" marker at **top-right**.
4. Resize window — segments and ticks reposition proportionally; label rows re-pack.
5. Hover a label — short crossfades to full with pill background over 150ms. Right-edge labels (e.g. "NYC") don't overflow the wrapper.
6. Click a label — expands to full (same effect as hover); click again to collapse.
7. Toggle dark mode: add `class="dark"` to `<html>` in devtools. Colors flip correctly.
8. Open `/globe` — timeline still renders (with real data via A3/A4), though interactions aren't wired yet (B4).
