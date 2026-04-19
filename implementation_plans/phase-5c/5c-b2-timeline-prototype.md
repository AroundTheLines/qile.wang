# 5C-B2 — Timeline component prototype (isolated, mock data)

**Epic**: B. Timeline & Playback · **Owner**: Dev B · **Can be run by agent?**: Yes (feel-based styling calls benefit from human review) · **Estimated size**: M

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

## Implementation guidance

### Component API

```tsx
// components/globe/Timeline.tsx
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

### `TimelineSegment.tsx`

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

### `TimelineAxis.tsx`

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

- [ ] `/timeline-dev` renders a full-width timeline with 9 mock segments.
- [ ] Segments are horizontally positioned proportionally via the compression map.
- [ ] Year labels render along the bottom (2018–2024 visible).
- [ ] "Today" marker visible at the right edge with a "today" text label.
- [ ] Labels alternate above/below the track (crude row-based placement; B5 polishes).
- [ ] Single-day trip (NYC Day Trip, `startDate === endDate`) renders as a dot, not a zero-width bar.
- [ ] Empty trips array renders the "Nothing yet" state.
- [ ] Dark mode (toggle via adding `.dark` class to `<html>` in dev tools): colors swap per §17.2 — track stays visible, segments stay visible, tick labels stay visible.
- [ ] `npm run build` compiles; `/timeline-dev` loads without errors.

## Non-goals

- **No zoom/pan** — B3.
- **No hover/click interactions** — B4.
- **No label collision handling beyond alternating rows** — B5.
- **No playback playhead** — B6.
- **No Sanity integration** — B4.
- **No mobile stickiness / squeeze** — E1.

## Gotchas

- **`use client`** required — uses hooks (`useRef`, `useEffect`, `useState`, `useMemo`).
- **`ResizeObserver` SSR safety**: wrap in `useEffect` so it only runs on client.
- **Tick label x-position**: apply the same horizontal inset (`inset-x-4` = 16px) used for segments; otherwise ticks and segments won't line up.
- **Container width**: read from `contentRect.width` — this excludes padding. Subtract the inset manually when computing `leftPx`.
- **Alternating rows**: `i % 2` is crude. B5 replaces with collision-aware layout. Don't over-engineer in this ticket.
- **`widthPx = Math.max(2, ...)` for visibility**: a zero-width rect doesn't render. The `isDot` branch (< 12px) renders a circle instead — avoid two competing visibility hacks.
- **Tailwind arbitrary color opacity**: `bg-black/5` is valid Tailwind syntax for opacity. If you prefer CSS variables, define once in `globals.css`.
- **Today marker using `left: 100%`**: anchored to the track's right edge which is the inset-adjusted position. Verify visually that it aligns with `x = 1.0`.

## Ambiguities requiring clarification before starting

1. **Segment colors**: spec §17.1 says `rgba(0, 0, 0, 0.20)` for idle light, `rgba(255, 255, 255, 0.18)` for idle dark. Tailwind's `bg-black/20` → `rgba(0, 0, 0, 0.2)` ✓; `bg-white/[.18]` → `rgba(255, 255, 255, 0.18)` ✓. Using these.

   **Action**: no clarification — use Tailwind arbitrary-value syntax as above.

2. **Timeline height**: spec §2 "~10–15% viewport height" is desktop only. `h-16 md:h-20` (64px → 80px) is conservative. On a 1080p monitor that's ~7–7.4% — below the spec floor. Bump to `h-20 md:h-24` (80 → 96px) if a reviewer finds it cramped.

   **Action**: ship `h-16 md:h-20`. Note in PR as tunable.

3. **Label text for mock data**: mock trips use readable titles. Production data (B4) will use `trip.title`. Field name mismatch? No — both use `.title`. Safe.

   **Action**: proceed as spec'd.

4. **Height of mobile timeline**: mobile layout is E1's scope; this ticket's timeline height applies to both form factors currently. Acceptable.

## Handoff / outputs consumed by later tickets

- **`Timeline.tsx`** with `TimelineProps` signature: `{ trips, className?, now? }`. B3–B7 modify in place; B4 changes the `trips` source from mock to real data.
- **`TimelineSegment.tsx`**: reused by B4, B5.
- **`TimelineAxis.tsx`**: reused by B3 (zoom-driven tick recomputation).
- **`/timeline-dev`**: deleted in B8.

## How to verify

1. `npm run dev`
2. Open `http://localhost:3000/timeline-dev`.
3. See 9 segments, years across bottom, "today" marker at right.
4. Resize window — segments and ticks reposition proportionally.
5. Toggle dark mode: add `class="dark"` to `<html>` in devtools. Colors flip correctly.
6. Open `/globe` — timeline still renders (with real data via A3/A4), though interactions aren't wired yet (B4).
