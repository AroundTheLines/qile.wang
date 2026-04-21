# 5C-B3 — Timeline zoom & pan gestures

**Epic**: B. Timeline & Playback · **Owner**: Dev B · **Can be run by agent?**: Partial — feel of zoom rate + pan elasticity needs human review · **Estimated size**: M

## Dependencies

### Hard
- **B2** — extends the Timeline component.

### Soft
- None.

### Blocks
- B4 (hover/click layered on gestures; gesture vs click needs the drag-threshold contract).

---

## Goal

Add zoom and pan to the timeline. Desktop: scroll wheel or pinch to zoom; click-drag to pan. Mobile: two-finger pinch to zoom; one-finger horizontal swipe to pan. Vertical swipe on mobile passes through to page scroll. Zoom window defines which slice of the compressed map is visible; segments and ticks re-render within that slice.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §4.3 Zoom and pan
- §4.7 Gesture ownership (mobile)
- §9.4 Timeline surface interactions

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §4.3, §4.7, §9.4
- [`../../components/globe/Timeline.tsx`](../../components/globe/Timeline.tsx) (post-B2)
- [`../../components/wardrobe/WardrobeCarousel.tsx`](../../components/wardrobe/WardrobeCarousel.tsx) — wardrobe uses Framer + pointer events; pattern to follow
- [README §4.3 invariant 4 (drag threshold = 5 px)](./README.md#43-invariants-from-the-existing-code-preserve-these)

## Files to create

- None.

## Files to modify

- `components/globe/Timeline.tsx` — add `zoomWindow` state + gesture handlers
- `components/globe/TimelineSegment.tsx` — re-project x-coordinates into zoom window
- `components/globe/TimelineAxis.tsx` — re-project tick x-coordinates

## Files to delete

- None.

---

## Implementation guidance

### State shape

```ts
// Inside Timeline.tsx
const [zoomWindow, setZoomWindow] = useState<{ start: number; end: number }>({ start: 0, end: 1 })
// start/end are compressed-map x values.
// Full history: { start: 0, end: 1 }
// One-month window near present: { start: 0.95, end: 1 } (roughly)
```

### Re-projection math

Given a segment's compressed x-coordinate `x`:

```ts
const zoomSpan = zoomWindow.end - zoomWindow.start
const projectedX = (x - zoomWindow.start) / zoomSpan  // 0..1 within the visible zoom
const pixelX = projectedX * containerWidth            // final pixel position
```

Drop segments where `projectedX < -0.01` or `projectedX > 1.01` (off-screen). Leave a tiny buffer for the clipping cue (B5).

### Min/max zoom

```ts
// Total history span in days = earliestStart → now
const totalDays = daysBetween(compressed.start, compressed.end)
// 1 month = ~30 days. Min zoom = 30 / totalDays.
const MIN_ZOOM_SPAN = Math.min(1, 30 / totalDays)
const MAX_ZOOM_SPAN = 1  // full history
```

### Desktop scroll-wheel zoom

```tsx
const handleWheel = (e: React.WheelEvent) => {
  e.preventDefault()
  // deltaY > 0 = scroll down = zoom out; negate for intuitive direction
  const zoomFactor = Math.exp(e.deltaY * -0.001)  // gentle; 0.001 multiplier tunable
  const rect = e.currentTarget.getBoundingClientRect()
  const cursorXFrac = (e.clientX - rect.left) / rect.width  // 0..1 within visible area
  const cursorX = zoomWindow.start + cursorXFrac * (zoomWindow.end - zoomWindow.start)

  const newSpan = Math.min(
    MAX_ZOOM_SPAN,
    Math.max(MIN_ZOOM_SPAN, (zoomWindow.end - zoomWindow.start) * zoomFactor)
  )
  // Anchor at cursor: cursorX stays at cursorXFrac after zoom.
  let newStart = cursorX - cursorXFrac * newSpan
  let newEnd = newStart + newSpan
  // Clamp to [0, 1]
  if (newStart < 0) { newEnd -= newStart; newStart = 0 }
  if (newEnd > 1) { newStart -= (newEnd - 1); newEnd = 1; if (newStart < 0) newStart = 0 }
  setZoomWindow({ start: newStart, end: newEnd })
}
```

### Desktop click-drag pan

Use pointer events on the timeline container:

```tsx
const dragState = useRef<{ startX: number; startZoom: { start: number; end: number } } | null>(null)

const handlePointerDown = (e: React.PointerEvent) => {
  // Only pan if NOT clicking a segment (segments stopPropagation in B4).
  if (e.button !== 0) return
  dragState.current = { startX: e.clientX, startZoom: { ...zoomWindow } }
  e.currentTarget.setPointerCapture(e.pointerId)
}

const handlePointerMove = (e: React.PointerEvent) => {
  if (!dragState.current) return
  const dx = e.clientX - dragState.current.startX
  const rect = e.currentTarget.getBoundingClientRect()
  const dxFrac = dx / rect.width
  const span = dragState.current.startZoom.end - dragState.current.startZoom.start
  let newStart = dragState.current.startZoom.start - dxFrac * span
  let newEnd = newStart + span
  if (newStart < 0) { newEnd -= newStart; newStart = 0 }
  if (newEnd > 1)   { newStart -= (newEnd - 1); newEnd = 1 }
  setZoomWindow({ start: newStart, end: newEnd })
}

const handlePointerUp = (e: React.PointerEvent) => {
  dragState.current = null
  e.currentTarget.releasePointerCapture(e.pointerId)
}
```

### Mobile: pinch-to-zoom + swipe-to-pan

Track two pointers for pinch; one pointer for swipe. Similar pattern to click-drag but with multi-touch support:

```tsx
const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
const gestureState = useRef<
  | { kind: 'pan'; startX: number; startZoom: typeof zoomWindow }
  | { kind: 'pinch'; startDist: number; startSpan: number; startCenter: number }
  | null
>(null)

const handlePointerDown = (e: React.PointerEvent) => {
  pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
  e.currentTarget.setPointerCapture(e.pointerId)

  if (pointers.current.size === 1) {
    gestureState.current = { kind: 'pan', startX: e.clientX, startZoom: { ...zoomWindow } }
  } else if (pointers.current.size === 2) {
    const [a, b] = Array.from(pointers.current.values())
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    const rect = e.currentTarget.getBoundingClientRect()
    const centerXFrac = ((a.x + b.x) / 2 - rect.left) / rect.width
    const centerX = zoomWindow.start + centerXFrac * (zoomWindow.end - zoomWindow.start)
    gestureState.current = {
      kind: 'pinch',
      startDist: dist,
      startSpan: zoomWindow.end - zoomWindow.start,
      startCenter: centerX,
    }
  }
}

// handlePointerMove: check gestureState.kind, apply pan or pinch.
// handlePointerUp: pointers.current.delete(pointerId); gestureState = null when empty.
```

### Vertical pass-through on mobile (§4.7)

Set `touchAction` on the timeline wrapper:

```tsx
<div
  className="..."
  style={{ touchAction: 'pan-y' }}  // browser handles vertical scroll; JS handles horizontal + zoom
  onPointerDown={handlePointerDown}
  ...
>
```

`pan-y` tells the browser: vertical scroll is native; horizontal gestures go to JS. Essential for the spec's gesture-ownership contract.

### TimelineSegment changes

Pass `zoomWindow` down. Compute projected x inside the segment:

```tsx
// TimelineSegment.tsx
interface Props {
  trip: TripRange & { title?: string }
  compressed: CompressedMap
  zoomWindow: { start: number; end: number }   // new
  containerWidth: number
  row: 0 | 1
}

const x0 = compressed.dateToX(trip.startDate)
const x1 = compressed.dateToX(trip.endDate)
const zoomSpan = zoomWindow.end - zoomWindow.start
const projX0 = (x0 - zoomWindow.start) / zoomSpan
const projX1 = (x1 - zoomWindow.start) / zoomSpan

// Off-screen cull — B5 will add a clipping cue for partially visible.
if (projX1 < -0.05 || projX0 > 1.05) return null

const leftPx = projX0 * containerWidth
const widthPx = Math.max(2, (projX1 - projX0) * containerWidth)
// ... rest of render
```

### TimelineAxis changes

Same projection for ticks. Cull off-screen ticks:

```tsx
compressed.tickMarks
  .map((t) => ({ ...t, projX: (t.x - zoomWindow.start) / (zoomWindow.end - zoomWindow.start) }))
  .filter((t) => t.projX >= -0.01 && t.projX <= 1.01)
  .map((t) => /* render */)
```

Additionally, **densify tick marks when zoomed in**: when `zoomSpan < 2/5` (zoomed past the 2-year threshold hinted at in §4.5), month ticks become primary. B1's CompressedMap already includes month ticks for short spans, but the zoomed view may need higher-density ticks than B1 generated.

Decision: use the tick marks B1 provides. If coverage is thin under deep zoom, synthesize additional month ticks via `xToDate` iteration — but defer to B5 (polish). Keep this ticket lean.

---

## Acceptance criteria

- [ ] Scroll wheel on `/timeline-dev` zooms in/out; cursor x stays under the zoom focal point.
- [ ] Click-drag pans the zoomed view; can't pan before `x = 0` or after `x = 1`.
- [ ] Zoom cannot shrink beyond ~1 month window (`MIN_ZOOM_SPAN`).
- [ ] Zoom cannot exceed full history (`MAX_ZOOM_SPAN`).
- [ ] On mobile (test via Chrome devtools device mode with touch): two-finger pinch zooms; one-finger horizontal swipe pans.
- [ ] Vertical swipe on mobile scrolls the page — the timeline does not capture it.
- [ ] Ticks outside the zoom window are not rendered (confirm via devtools: zoom to 2024 only, inspect DOM — only 2024 ticks present).
- [ ] Segments outside the zoom window are not rendered.
- [ ] No React warnings, no unbounded re-renders (check Profiler during a sustained scroll).

## Non-goals

- **No hover/click preview/lock** — B4.
- **No playhead** — B6.
- **No label collision handling** — B5.
- **No zoom reset on playback resume** — B6/B7.
- **No keyboard navigation** — deferred per spec §13.

## Gotchas

- **`e.preventDefault()` in wheel handler**: React's SyntheticEvent does not guarantee preventDefault actually blocks native scroll in passive listeners. To ensure, register a native listener via `useEffect`:
  ```ts
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const handler = (e: WheelEvent) => { e.preventDefault(); /* ... */ }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])
  ```
  Otherwise, scrolling the timeline scrolls the page on some browsers.

- **`setPointerCapture` required** for drag to work when pointer leaves the element.

- **Zoom rate multiplier** (`0.001` in `Math.exp(deltaY * -0.001)`): tune to feel. Too aggressive = jarring; too gentle = feels unresponsive. Start with 0.001, bump to 0.002 if sluggish.

- **Clamping order matters**: when the new window would overshoot `[0, 1]`, shift the opposite bound first, then clamp. Naive clamp of `newStart` to 0 without adjusting `newEnd` truncates the zoom span.

- **Pinch-to-zoom on trackpads**: macOS trackpads emit `wheel` events with `ctrlKey: true` for pinch gestures. Handle both — the wheel handler above works for both without special-casing. But if zoom feels off on trackpad pinch vs mouse wheel, split handlers.

- **Drag vs click threshold = 5 px** (global invariant, README §4.3 invariant 4). Segment click handlers (B4) must only fire on mouseup if total drag < 5 px. Don't implement segment-click in this ticket, but preserve the drag-distance tracking pattern from `GlobeViewport.tsx` so B4 can reuse it.

- **`pan-y` `touchAction`**: on the Timeline wrapper's root, not children. Children inherit.

- **Two-finger vs two-pointer**: `pointers.current.size === 2` covers both two-finger touch and two-pen input. Browsers fire pointer events uniformly.

## Ambiguities requiring clarification before starting

1. **Zoom rate feel**: spec says "smooth" but offers no numeric. Default `0.001` multiplier on wheel deltaY. Tune during B4 integration.

   **Action**: ship default; note as tunable.

2. **Elastic pan bounds?** On iOS Safari, scroll views have an "elastic" overshoot (rubber-band) at edges. Spec doesn't require this; hard clamp at `[0, 1]` is simpler and feels correct for a "locked-bounds" timeline.

   **Action**: hard clamp. No elastic.

3. **Inertia after swipe?** Mobile users expect a brief coast after releasing a swipe. Spec doesn't require it. Added complexity moderate.

   **Action**: skip inertia. Add in F2 polish if it feels dead.

4. **What about keyboard shortcuts for zoom?** Spec defers keyboard nav (§13). Even basic `+/-` keys are out of scope.

   **Action**: ignore.

---

## Implementation notes (post-merge)

Deviations from the spec above and load-bearing choices future tickets should know about:

### 1. `MIN_ZOOM_SPAN` has a **20% floor**, not `30/totalDays`

Spec said `MIN_ZOOM_SPAN = Math.min(1, 30 / totalDays)`. In practice, because B1's compression applies `activeBoost=3` (active regions get 3× the x-space of quiet gaps), the pure `30/totalDays` math lets the view zoom so far into a quiet gap that **zero trips are visible** — the cursor lands between clusters in a region the compression shrunk to ~nothing.

Actual formula: `Math.min(1, Math.max(0.2, 30 / totalDays))` — at max zoom, at least 20% of the compressed x-range is visible. With the mock dataset this keeps ~3–5 trips on screen at max zoom. A dense real dataset will pull the floor toward the `30/totalDays` value. Constant is `MIN_ZOOM_SPAN_FLOOR` in [Timeline.tsx](../../components/globe/Timeline.tsx).

**For B5 / tick densification**: since max zoom is now 20% of compressed x (not 1 month of real days), the "zoom past 2 years → show month ticks" threshold in §4.5 should key on `zoomSpan < MIN_ZOOM_SPAN * ~2` or a similar relative measure, not raw days.

### 2. Pan/pinch use **window-level listeners**, not React pointer events

Spec pseudocode used `onPointerMove`/`onPointerUp` on the wrapper with `setPointerCapture`. In real browsers React's delegated pointer events drop frames once the pointer leaves the element's hit area, even with capture — drag silently stops mid-swipe.

Actual pattern: `onPointerDown` (React) attaches `pointermove`/`pointerup`/`pointercancel` listeners on `window`. They detach when all pointers release. Stable-proxy pattern (`moveImplRef` + `useCallback((e) => moveImplRef.current(e), [])`) keeps listener identity constant while letting the impl close over fresh state.

**For B4**: when you add segment click handlers, `stopPropagation` on the segment's `onPointerDown` is still sufficient — the wrapper's `onPointerDown` never fires, window listeners are never attached.

### 3. Row packing uses **full-history anchors**, not the zoomed view

Critical for avoiding vertical jitter. The initial attempt packed against visible items (`projX * innerWidth`), which meant row count + wrapper height changed every time a label culled in/out during pan. Looked like the whole timeline was jittering.

Actual: `packed.items` stores `rawX` (full-history anchor) and `row` — computed once in a memo keyed on `trips`/`compressed`/`innerWidth`/`labelWidths`. The render loop reprojects horizontally via `(rawX - zoomWindow.start) / zoomSpan` but reuses the stable `row`. `rowCount` and `totalHeight` are invariant under zoom/pan.

**For B5 / collision handling**: any collision logic needs to run against the **zoomed** x-coordinates to be useful (labels that don't overlap at 100% may overlap at 5%). But row *assignment* must stay in the full-history pack to preserve vertical stability. Likely need a second pass that adjusts horizontal offset within a row without reassigning rows.

### 4. Gesture updates **coalesced onto rAF**

Spec had `setZoomWindow` called directly from wheel/pointermove. At ~120Hz trackpad input × N labels × N segments, re-projection dominates frame budget on realistic datasets. `scheduleZoom` batches to one update per animation frame. All code paths that produce a new window (wheel, pan, pinch) go through it.

**For B6/B7 (playhead)**: the playback driver should likewise write zoom updates through the same rAF queue if it ever animates zoom (e.g., a "fit-to-trip" transition).

### 5. Pure `clampZoom` lives in `lib/timelineZoom.ts`

Extracted so it's testable without pulling in React/tsx. Covered by [`lib/timelineZoom.test.ts`](../../lib/timelineZoom.test.ts). B4/B5 that programmatically set the zoom window (e.g., "zoom to this trip") should reuse `clampZoom` rather than inlining the shift-not-truncate logic.

### 6. Pinch uses the **two oldest pointers only**

A 3rd finger landing mid-pinch is ignored until one of the original two releases. Map-like UX.

---

## Handoff / outputs consumed by later tickets

- **`Timeline.tsx`** now tracks `zoomWindow` state. B4 reads it to determine whether a clicked label is in the visible window.
- **`TimelineSegment.tsx`** accepts `zoomWindow` prop. B5 adds clipping cues when a segment is only partially visible.
- **`TimelineAxis.tsx`** accepts `zoomWindow` prop.
- **Drag-threshold contract**: document the 5px threshold — it's shared with B4 segment click handlers.

## How to verify

1. `/timeline-dev` loads.
2. Scroll wheel over the timeline — zooms in. Cursor x stays near the same real-date position (confirm by hovering a segment label).
3. Scroll down — zooms out. Can't exceed full history.
4. Click-drag timeline — pans. Can't overshoot `[0, 1]`.
5. Open Chrome devtools → Device mode → iPhone 12. Pinch with trackpad (Cmd+Shift+drag in devtools) — zooms. Swipe horizontally — pans. Swipe vertically — page scrolls (add a `<div style={{ height: '200vh' }} />` below the Timeline to test scroll).
6. Max-zoom-in: verify the visible window is ~1 month (4–5 tick marks visible).
7. Confirm segments outside the zoom window disappear from DOM (inspect via devtools).
