# 5C-B5 — Timeline polish: label collision, dot rendering, clipping cues, visit ticks

**Epic**: B. Timeline & Playback · **Owner**: Dev B · **Can be run by agent?**: Yes · **Estimated size**: M

## Dependencies

### Hard
- **B4** — works on integrated Timeline with real data.

### Soft
- None.

### Blocks
- B6 (playhead rendering assumes polish is complete; else feels half-done).

---

## Goal

Polish the timeline from "functional" to "spec-compliant." Specifically:
1. Label collision detection + 45° rotate-to-reveal fallback.
2. Dot rendering for very short segments (already partial in B2; formalize per §4.4).
3. Clipping cues at zoom-window edges for partially visible segments.
4. **Visit tick marks** inside a trip segment (hidden idle, visible when trip highlighted).
5. Sub-region bands rendered when a pin is hovered/clicked (consumer of C2's `hoveredPin` signal).

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §4.4 Labels
- §4.6 Visit-level markers
- §7.5 Pin click highlights visit sub-regions on timeline
- §9.2 Pin hover highlights visit sub-regions
- §17.1 / §17.2 Visual defaults (visit tick mark colors)

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §4.4, §4.6, §7.5
- [`../../components/globe/Timeline.tsx`](../../components/globe/Timeline.tsx) (post-B4)
- [`../../components/globe/TimelineSegment.tsx`](../../components/globe/TimelineSegment.tsx) (post-B4)
- [`../../lib/types.ts`](../../lib/types.ts) (post-A2) — `VisitSummary`, `PinWithVisits` for finding visits in a pin

## Files to create

- `components/globe/TimelineVisitTicks.tsx` — renders tick marks inside a trip segment
- `components/globe/TimelinePinBands.tsx` — renders visit sub-region bands triggered by pin hover/click

## Files to modify

- `components/globe/Timeline.tsx` — integrate collision detection + mount new sub-components
- `components/globe/TimelineSegment.tsx` — clipping cues + refined dot rendering + label rotation support
- `components/globe/GlobeContext.tsx` — add `pinSubregionHighlight: string | null` (the pin id whose visit bands should render)

## Files to delete

- None.

---

## Implementation guidance

### 1. Label collision detection

Simple greedy algorithm in Timeline.tsx. After rendering, measure each label's bounding rect; if a later label overlaps horizontally at the same row, rotate it 45° and hide until segment-hover.

**Challenge**: label widths aren't known until render. Two options:
- **(a)** Estimate widths via `canvas.measureText` with the Timeline's font settings. Pure computation, zero layout thrash.
- **(b)** First-pass render at opacity-0, measure via `getBoundingClientRect`, then apply rotation classes.

Default: **(a)**. Avoids layout thrash; B6's playback will re-trigger collision checks frequently.

```tsx
// Inside Timeline.tsx (or a helper)
function measureLabelWidths(
  trips: (TripRange & { title?: string })[],
  font: string
): Map<string, number> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = font
  const widths = new Map<string, number>()
  for (const t of trips) {
    widths.set(t.id, ctx.measureText(t.title ?? t.id).width)
  }
  return widths
}
```

Then place labels on two rows (above/below) and check collisions within each row:

```tsx
interface LabelPlacement {
  row: 0 | 1
  leftPx: number
  widthPx: number
  rotated: boolean
}

function placeLabels(
  segments: { id: string; leftPx: number; widthPx: number; labelWidth: number }[]
): Map<string, LabelPlacement> {
  const placements = new Map<string, LabelPlacement>()
  const rowRightEdges: [number, number] = [-Infinity, -Infinity]  // rightmost edge used per row
  for (const seg of segments) {
    const labelLeft = seg.leftPx
    const labelRight = labelLeft + seg.labelWidth
    // Prefer row 0 if it fits; else row 1; else rotate 45° on nearest row.
    let row: 0 | 1 = 0
    let rotated = false
    if (rowRightEdges[0] < labelLeft) {
      row = 0
    } else if (rowRightEdges[1] < labelLeft) {
      row = 1
    } else {
      // Collision on both rows. Pick the row with the smaller overlap and rotate.
      row = rowRightEdges[0] < rowRightEdges[1] ? 0 : 1
      rotated = true
    }
    rowRightEdges[row] = Math.max(rowRightEdges[row], labelRight)
    placements.set(seg.id, { row, leftPx: seg.leftPx, widthPx: seg.widthPx, rotated })
  }
  return placements
}
```

`TimelineSegment.tsx` consumes the placement via a prop:

```tsx
// New prop: placement: LabelPlacement
{placement.rotated ? (
  <span
    className="absolute left-0 text-[10px] tracking-widest uppercase origin-left rotate-[-45deg] opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity"
    style={{ top: placement.row === 0 ? undefined : '100%' }}
  >
    {trip.title}
  </span>
) : (
  <span
    className={`absolute left-0 text-[10px] tracking-widest uppercase whitespace-nowrap transition-colors ${
      placement.row === 0 ? 'bottom-[calc(100%+4px)]' : 'top-[calc(100%+4px)]'
    }`}
  >
    {trip.title}
  </span>
)}
```

Wrap the segment in `<div className="group">` so `group-hover:opacity-100` reveals rotated labels on hover.

### 2. Dot rendering (formalize)

B2 already does `isDot = widthPx < 12`. Formalize the threshold as `MIN_SEGMENT_WIDTH_PX = 12` (spec §16 Q8 default). Add dot-specific hover behavior: hover still triggers tooltip-style label above the dot, even without a persistent text label.

```tsx
const MIN_SEGMENT_WIDTH_PX = 12

// In TimelineSegment.tsx:
const isDot = widthPx < MIN_SEGMENT_WIDTH_PX
// Dots: render a ~8px circle. Labels become hover-only via the rotated pattern above.
```

### 3. Clipping cues (§4.4 "extends further")

When a segment's real x-range straddles the zoom window edge, render a 2px wedge/arrow on the clipped side:

```tsx
// In TimelineSegment.tsx
const clippedLeft = x0 < zoomWindow.start
const clippedRight = x1 > zoomWindow.end

{clippedLeft && (
  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-[var(--accent)]/30 pointer-events-none" />
)}
{clippedRight && (
  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-[var(--accent)]/30 pointer-events-none" />
)}
```

Keep subtle — spec says "use discretion; keep it subtle and within the timeline bounds."

### 4. Visit tick marks (§4.6)

Only shown when a trip is `hoveredTrip` or `lockedTrip`. Rendered inside the trip segment, one tick per visit boundary.

```tsx
// components/globe/TimelineVisitTicks.tsx
'use client'

import { useGlobe } from './GlobeContext'
import type { CompressedMap } from '@/lib/timelineCompression'

interface Props {
  tripId: string
  tripStart: string
  tripEnd: string
  compressed: CompressedMap
  zoomWindow: { start: number; end: number }
  containerWidth: number
  leftOffsetPx: number  // segment's leftPx on Timeline
  segmentWidthPx: number
}

export default function TimelineVisitTicks({
  tripId, compressed, zoomWindow, containerWidth, leftOffsetPx, segmentWidthPx,
}: Props) {
  const { pins, hoveredTrip, lockedTrip } = useGlobe()
  const isHighlighted = hoveredTrip === tripId || lockedTrip === tripId
  if (!isHighlighted) return null

  // Find all visits in this trip. PinWithVisits has tripIds[] — iterate pins.
  const visits = pins
    .flatMap((p) => p.visits)
    .filter((v) => v.trip._id === tripId)

  return (
    <>
      {visits.map((v) => {
        const vx0 = compressed.dateToX(v.startDate)
        const vx1 = compressed.dateToX(v.endDate)
        const zoomSpan = zoomWindow.end - zoomWindow.start
        const projStart = (vx0 - zoomWindow.start) / zoomSpan
        const projEnd = (vx1 - zoomWindow.start) / zoomSpan
        const leftPx = projStart * containerWidth - leftOffsetPx
        const widthPx = Math.max(1, (projEnd - projStart) * containerWidth)

        return (
          <div
            key={v._id}
            data-no-skeleton
            className="absolute top-0 bottom-0 bg-[var(--accent)]/40"
            style={{ left: leftPx, width: widthPx }}
          />
        )
      })}
    </>
  )
}
```

Render inside `TimelineSegment.tsx` with the segment as the positioning context.

### 5. Pin sub-region bands (§7.5, §9.2)

When a user clicks or hovers a pin, the timeline must highlight visit sub-regions across multiple trips (not a single trip segment).

Add `pinSubregionHighlight: string | null` to `GlobeContext`. C2 sets this to `pin.location._id` on hover (desktop) or click (any device, transient). Timeline reads it:

```tsx
// components/globe/TimelinePinBands.tsx
'use client'

import { useGlobe } from './GlobeContext'
import type { CompressedMap } from '@/lib/timelineCompression'

interface Props {
  compressed: CompressedMap
  zoomWindow: { start: number; end: number }
  containerWidth: number
  leftOffsetPx: number
}

export default function TimelinePinBands({ compressed, zoomWindow, containerWidth, leftOffsetPx }: Props) {
  const { pins, pinSubregionHighlight } = useGlobe()
  if (!pinSubregionHighlight) return null

  const pin = pins.find((p) => p.location._id === pinSubregionHighlight)
  if (!pin) return null

  return (
    <>
      {pin.visits.map((v) => {
        const vx0 = compressed.dateToX(v.startDate)
        const vx1 = compressed.dateToX(v.endDate)
        const zoomSpan = zoomWindow.end - zoomWindow.start
        const projStart = (vx0 - zoomWindow.start) / zoomSpan
        const projEnd = (vx1 - zoomWindow.start) / zoomSpan
        if (projEnd < 0 || projStart > 1) return null
        const leftPx = Math.max(0, projStart) * containerWidth - leftOffsetPx
        const widthPx = (Math.min(1, projEnd) - Math.max(0, projStart)) * containerWidth
        return (
          <div
            key={v._id}
            data-no-skeleton
            className="absolute top-0 bottom-0 bg-[var(--accent)]/25 pointer-events-none"
            style={{ left: leftPx, width: Math.max(2, widthPx) }}
          />
        )
      })}
    </>
  )
}
```

Mount inside Timeline.tsx as an overlay on the full track.

---

## Acceptance criteria

- [ ] Densely packed trips show labels that either row-alternate (no collision) or rotate to 45° with hover-to-reveal.
- [ ] Hovering a segment with a rotated label makes the label visible (`group-hover:opacity-100`).
- [ ] Single-day trip (NYC Day Trip fixture) renders as a dot, not a zero-width bar. Hovering the dot still shows the label.
- [ ] Zooming into a sub-range of a long trip shows a clipping cue at the zoom-window edge.
- [ ] Hovering a trip segment reveals visit tick marks inside it. Tick marks correspond to visit date ranges.
- [ ] Locking a trip shows visit ticks persistently until deselect.
- [ ] Hovering a pin (desktop) triggers `pinSubregionHighlight` → timeline renders bands for each of that pin's visits. Hover end clears.
- [ ] Clicking a pin (any device) sets `pinSubregionHighlight` → bands render. Dismissing pin panel clears.
- [ ] All new DOM nodes have `data-no-skeleton` where appropriate (tick marks, bands, clipping cues).

## Non-goals

- **No playhead logic** — B6.
- **No pause-on-pin-hover wiring** — B7 (the context signal already goes to B4's pause reasons via C2).
- **No per-trip color distinction** — deferred §13.
- **No sub-region bands when both trip AND pin are interacted simultaneously** — spec doesn't define overlap behavior; both render. Visually OK (same color).

## Gotchas

- **`canvas.measureText` needs matching font string**: pass the Timeline's exact computed font (e.g., `"10px ui-sans-serif, system-ui, ..."`). Mismatch causes off-by-10% width estimates. Read via `getComputedStyle(labelEl).font`.
- **Label placement recomputes on zoom**: `placeLabels` runs on every zoomWindow change. That's fine — pure function, fast.
- **Rotated label clipping**: `origin-left rotate-[-45deg]` anchors at the label's left edge. Rotated label spills downward for row 1 or upward for row 0. Test against the timeline's `h-16` — may need vertical overflow adjustment or bump to `h-20`.
- **`group-hover` requires `group` class on the parent segment div**: easy to forget. If rotated labels never appear on hover, check the group pattern.
- **Visit ticks when segment clipped**: if a trip's segment is partially clipped by zoom, visit ticks outside the visible range should not render. `TimelineVisitTicks` already handles via `leftOffsetPx` math; double-check clipping.
- **`pinSubregionHighlight` context field**: ensure C1 includes this field (may have been missed). Coordinate with C1 agent; if missing, add to `GlobeContext.tsx` here with a note: "Added for B5 subregion rendering; should have been in C1."
- **Performance**: with 50 pins and playback running, `pins.flatMap` inside render happens every playhead tick. Memoize with `useMemo(() => pins.flatMap(...), [pins])` in Timeline.

## Ambiguities requiring clarification before starting

1. **Label rotation direction**: `-45°` (bottom-left up to top-right) or `+45°` (top-left down to bottom-right)? Default `-45°`. Reviewable.

2. **Visit tick visual style**: spec §17.1 says "accent color at ~40% saturation." Using `bg-[var(--accent)]/40` as a proxy (opacity vs saturation is different — color-saturation manipulation requires `hsl()` rewriting). For a subtle highlight, opacity is close enough.

   **Action**: use opacity. Note as potential visual discrepancy.

3. **Pin-hover band opacity**: using `/25` to be more subtle than visit ticks' `/40`. Reviewable.

4. **Sub-region bands while trip is locked**: if the user locks trip A and then hovers a pin that's NOT in trip A, should bands render on other trip segments? Spec §9.2 says "Timeline also highlights the visit sub-regions within each containing trip's segment" — so yes, bands render regardless of lock.

   **Action**: render bands independent of locked-trip state. Simpler.

5. **Collision with playhead label**: B6 renders a floating playback label. It may collide with rotated trip labels. Defer to B6's implementation — it can detect collision and offset.

## Handoff / outputs consumed by later tickets

- `pinSubregionHighlight` context field — C2 sets it (confirm with C2 agent).
- `TimelineVisitTicks` and `TimelinePinBands` components — reusable if mobile layout (E1) needs them.
- `MIN_SEGMENT_WIDTH_PX = 12` constant — shared with B6 (dot-render on playhead crossing).

## How to verify

1. `/globe` — timeline renders with all polish.
2. Inspect DOM during densely-packed zoom — rotated labels present with `opacity-0`. Hover triggers opacity 1.
3. Zoom deeply into a long trip — clipping cues visible on zoom edges.
4. Hover any trip — visit tick marks appear inside the segment.
5. Click a pin on the globe (requires C2 + C3 merged) — bands appear on timeline at that pin's visit dates.
6. Single-day trip (NYC Day Trip) — renders as dot; hover shows label.
7. React Profiler during zoom-wheel: no unbounded re-renders from Timeline children.
