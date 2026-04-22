# 5C-B4 — Timeline integration: Sanity data + hover + click + URL

**Epic**: B. Timeline & Playback · **Owner**: Dev B · **Can be run by agent?**: Yes · **Estimated size**: M

**Status**: ✅ Shipped (PR #35). See [Implementation notes (as shipped)](#implementation-notes-as-shipped) for deviations from the original sketch that downstream tickets should inherit.

## Dependencies

### Hard
- **A3** — provider is fed real `trips` prop.
- **C1** — provider exposes `hoveredTrip`, `lockedTrip`, `setHoveredTrip`, `setLockedTrip`.
- **B3** — timeline has zoom/pan + segment rendering.

### Soft
- None.

### Blocks
- B5 (builds on this), B8 (retires dev route), E1 (mobile layout uses same Timeline), E3 (mobile preview).

---

## Goal

Flip the timeline from mock data to real Sanity data. Wire segment hover to `hoveredTrip`, segment click to `lockedTrip` + URL. Include the §12.7 fetch-error inline state.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §9.1 Timeline label interaction
- §9.4 Timeline surface interactions
- §8.4 URL state (`/globe?trip=<slug>`)
- §12.1 Zero trips ("Nothing yet")
- §12.7 Data fetch failure inline error

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §8.4, §9.1, §9.4, §12.7
- [`../../components/globe/Timeline.tsx`](../../components/globe/Timeline.tsx) (post-B3)
- [`../../components/globe/GlobeContext.tsx`](../../components/globe/GlobeContext.tsx) (post-C1) — consume `hoveredTrip`, `lockedTrip`, `addPauseReason`, `removePauseReason`
- [`../../app/globe/layout.tsx`](../../app/globe/layout.tsx) (post-A3) — data source

## Files to create

- None.

## Files to modify

- `components/globe/Timeline.tsx` — read `trips` from context instead of props (or both), add fetch-error state, hover/click wiring
- `components/globe/TimelineSegment.tsx` — segment hover/click + highlight state

## Files to delete

- None.

---

## Implementation guidance

### Option: data from context vs data from props

Current Timeline signature (post-B2/B3) takes `trips` as a prop. Layout (post-A3) passes them via `<GlobeProvider>`. Two valid approaches:

- **(a)** Timeline keeps `trips` prop. Layout passes `<Timeline trips={validTrips} />` inside `<GlobeProvider>`.
- **(b)** Timeline reads `trips` from `useGlobe()`. Layout passes nothing.

**Default**: (b) — context is the single source of truth for Phase 5C state. Keeps the call site clean. The `trips` prop stays supported (doesn't break) so `/timeline-dev` continues to work with mock data.

```tsx
// Timeline.tsx
interface TimelineProps {
  /** Override: used by /timeline-dev with mocks. In production, omit and Timeline reads from context. */
  trips?: TripRange[]
  className?: string
  now?: string
}

export default function Timeline({ trips: tripsProp, className, now }: TimelineProps) {
  const ctx = useGlobe()
  const trips = tripsProp ?? ctx.trips  // pre-wired TripRange-shaped from context (C1)
  const { fetchError } = ctx
  // ...
}
```

### Fetch-error state (§12.7)

```tsx
if (fetchError) {
  return (
    <div className={`w-full h-16 md:h-20 flex items-center justify-center gap-2 text-xs tracking-widest uppercase text-black/50 dark:text-white/50 ${className ?? ''}`}>
      <span>Could not load timeline.</span>
      <button
        onClick={() => window.location.reload()}
        className="underline hover:text-black dark:hover:text-white transition-colors"
      >
        Retry
      </button>
    </div>
  )
}
```

Retry = full page reload. A fetch-only retry would require making `client.fetch` client-side, which it isn't (SSR). Reload is acceptable per spec ("Retry" affordance — mechanism unspecified).

### Segment hover + click (desktop)

In `TimelineSegment.tsx`, read `hoveredTrip`, `lockedTrip` from context. Emit to the pause system via `addPauseReason('label-hover')`:

```tsx
'use client'
import { useRouter } from 'next/navigation'
import { useGlobe } from './GlobeContext'
import { DRAG_THRESHOLD_PX } from './Timeline'  // export the constant from Timeline

interface Props {
  trip: TripRange & { title?: string; slug?: { current: string } }
  compressed: CompressedMap
  zoomWindow: { start: number; end: number }
  containerWidth: number
  row: 0 | 1
}

export default function TimelineSegment({ trip, compressed, zoomWindow, containerWidth, row }: Props) {
  const router = useRouter()
  const {
    hoveredTrip, setHoveredTrip,
    lockedTrip, setLockedTrip,
    addPauseReason, removePauseReason,
    isDesktop,
  } = useGlobe()

  const x0 = compressed.dateToX(trip.startDate)
  const x1 = compressed.dateToX(trip.endDate)
  const zoomSpan = zoomWindow.end - zoomWindow.start
  const projX0 = (x0 - zoomWindow.start) / zoomSpan
  const projX1 = (x1 - zoomWindow.start) / zoomSpan
  if (projX1 < -0.05 || projX0 > 1.05) return null
  const leftPx = projX0 * containerWidth
  const widthPx = Math.max(2, (projX1 - projX0) * containerWidth)

  const isHovered = hoveredTrip === trip.id
  const isLocked = lockedTrip === trip.id
  const isHighlighted = isHovered || isLocked

  const pressDown = useRef<{ x: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    pressDown.current = { x: e.clientX }
    e.stopPropagation()  // don't trigger the timeline's pan gesture
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pressDown.current) return
    const dx = Math.abs(e.clientX - pressDown.current.x)
    pressDown.current = null
    if (dx >= DRAG_THRESHOLD_PX) return  // was a drag, not a click

    // Click — toggle lock
    if (lockedTrip === trip.id) {
      setLockedTrip(null)
      router.push('/globe', { scroll: false })
    } else {
      setLockedTrip(trip.id)
      if (trip.slug) {
        router.push(`/globe?trip=${encodeURIComponent(trip.slug.current)}`, { scroll: false })
      }
    }
  }

  const onPointerEnter = () => {
    if (!isDesktop) return
    setHoveredTrip(trip.id)
    addPauseReason('label-hover')
  }

  const onPointerLeave = () => {
    if (!isDesktop) return
    setHoveredTrip((cur) => (cur === trip.id ? null : cur))
    removePauseReason('label-hover')
  }

  return (
    <div
      className="absolute inset-y-0"
      style={{ left: leftPx, width: widthPx }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {/* Segment */}
      <div
        className={`absolute inset-0 transition-colors duration-200 ${
          isHighlighted
            ? 'bg-[var(--accent)]'
            : 'bg-black/20 dark:bg-white/[.18]'
        }`}
      />
      {/* Label */}
      <span
        className={`absolute left-0 text-[10px] tracking-widest uppercase whitespace-nowrap transition-colors duration-200 ${
          row === 0 ? 'bottom-[calc(100%+4px)]' : 'top-[calc(100%+4px)]'
        } ${isHighlighted ? 'text-[var(--accent)]' : 'text-black/80 dark:text-white/80'}`}
      >
        {trip.title ?? trip.id}
      </span>
    </div>
  )
}
```

### Empty-timeline click to deselect (§9.4)

On the Timeline wrapper's `onPointerUp`, if it was a click (not a drag), and the target was the wrapper itself (not a segment), deselect:

```tsx
// In Timeline.tsx
const handleTimelineClick = (e: React.PointerEvent) => {
  // Use pressDown state from the pan-drag handler to distinguish click vs drag.
  // If dragged > DRAG_THRESHOLD_PX, this was a pan — do nothing.
  // Else, clear lockedTrip.
  if (wasJustDragged.current) return
  if (lockedTrip) {
    setLockedTrip(null)
    router.push('/globe', { scroll: false })
  }
}
```

`wasJustDragged` is a ref set during pan gestures. Clear it on next `pointerdown`.

### URL idempotency

After clicking a label:
- If `lockedTrip === trip.id`: URL must go back to `/globe`.
- Else: URL must become `/globe?trip=<slug>`.

Avoid redundant pushes (don't push `?trip=A` if already at `?trip=A`). Use `useSearchParams()`:

```tsx
const searchParams = useSearchParams()
const currentTripParam = searchParams.get('trip')
// Only push if the URL change is meaningful.
```

### Pin-hover → timeline visit-band highlight (C2 consumer)

C2 emits pin hover via `hoveredPin`. Timeline listens and renders a sub-region band for each visit at that pin within the pin's trip segments. **Defer this sub-region rendering to B5** (it's polish), but wire the plumbing now: read `hoveredPin`, map to visit ranges, expose a render hook.

Actually — B5 handles visit tick marks and the sub-region band. Leave this to B5.

---

## Acceptance criteria

- [ ] `/globe` renders with real Sanity data. Segments and labels visible.
- [ ] Hover a segment label (desktop): segment + label turn accent color. `hoveredTrip` context updates.
- [ ] Moving cursor off segment: highlight clears. `hoveredTrip` returns to null.
- [ ] Click a segment label: URL updates to `/globe?trip=<slug>`. Segment stays highlighted (now locked).
- [ ] Click the already-locked label: URL returns to `/globe`. Highlight clears.
- [ ] Click a different label while one is locked: URL updates to the new slug. Panels (if C3/C4 landed) swap.
- [ ] Click the empty timeline area (between segments): if anything is locked, deselect. URL returns to `/globe`.
- [ ] Dragging the timeline to pan does **not** trigger a segment click (drag threshold ≥ 5 px).
- [ ] When `trips.length === 0`: "Nothing yet" message renders.
- [ ] When `fetchError === true`: inline error with Retry button.
- [ ] `/timeline-dev` still works with mock data (backward-compatible prop).

## Non-goals

- **No label collision handling** — B5.
- **No clipping cue for partially visible segments** — B5.
- **No playhead rendering** — B6.
- **No pin-hover-highlights-timeline wiring** — B5 (per the note above).
- **No mobile preview label expansion** — E3 (desktop only in this ticket).

## Gotchas

- **`e.stopPropagation()` on segment `pointerDown`** — prevents the timeline wrapper's pan gesture from starting. Without this, clicking a label would also pan.
- **DRAG_THRESHOLD_PX constant**: export from Timeline.tsx (or a shared file) so segment handlers can use the same constant. Current value = 5.
- **`router.push('/globe', { scroll: false })`** — always include `{ scroll: false }`.
- **Encoding slug in URL**: `encodeURIComponent` for safety even though Sanity slugs are URL-safe by convention.
- **Pause reason leakage**: if `pointerLeave` doesn't fire (e.g., user clicks + a modal covers the segment), the `label-hover` pause reason sticks. Guard: also clear pause reasons on `pointerUp`.
- **`isDesktop` gate on hover**: mobile should NOT use hover-to-highlight (spec §9.1 mobile row — single tap shows preview label, expands inline). That's E3. Ensure desktop hover path is behind the `isDesktop` gate.
- **`next/navigation` `useRouter` for App Router**: not `next/router`. Mixing up breaks silently in Next.js 16 (see `AGENTS.md`).

## Ambiguities requiring clarification before starting

1. **What does "click" mean when a drag happens?**: the spec says "drag doesn't select." With a 5px threshold, any movement ≥ 5px between down and up cancels. This matches globe behavior (invariant 4). Using that threshold.

2. **Retry button behavior**: `window.location.reload()` vs refetch. Reload is sledgehammer but simple. Refetch requires making data client-side; Phase 5C is SSR-first. Reload.

3. **Does hovering a label over the same segment as a locked one feel different?**: spec doesn't specify. Visually, `isHovered || isLocked` both → highlighted. No distinction needed. If a reviewer wants a "darker" locked color, bump §17.1 defaults.

4. **Does pausing playback on hover need a debounce?**: "Brief cursor transit over the timeline without stopping" should not pause per §5.5. The current handler calls `addPauseReason('label-hover')` on `pointerEnter`, which fires immediately on entering a segment. Realistically a transit takes <100ms — may or may not register as a pause.

   **Recommendation**: add a 100ms debounce before calling `addPauseReason` on enter. If the user leaves within 100ms, cancel the debounce. **This implementation detail lives in the pause-reasons system** — can be implemented in B7 (pause coordinator) as a general policy for all hover-based pauses. For this ticket, call `addPauseReason` immediately; B7 can layer debouncing later.

   **Action**: immediate pause. B7 adds debounce if needed.

## Handoff / outputs consumed by later tickets

- `DRAG_THRESHOLD_PX` exported from `Timeline.tsx` or a shared constants file — B5, E3 reuse.
- Segment hover/click wiring assumes `hoveredTrip` / `lockedTrip` / `addPauseReason` are on context (provided by C1).

## How to verify

1. `npm run dev`
2. `/globe` — timeline renders with real trips.
3. Hover first trip label — turns accent; URL unchanged; `hoveredTrip` visible in React DevTools.
4. Click it — URL becomes `/globe?trip=<slug>`; stays highlighted.
5. Click same label — URL returns to `/globe`; highlight clears.
6. Click a second label — URL updates; first label returns to idle style.
7. Drag the timeline — doesn't trigger a click.
8. Click between segments (empty area) — if locked, deselects.
9. Add `throw new Error('test')` to `client.fetch` in `layout.tsx` → reload → inline error shows with Retry.
10. Empty the trips array (temporarily in layout) → "Nothing yet" shows.

---

## Implementation notes (as shipped)

The shipped implementation diverges from the sketch above in a few places downstream tickets need to know about. If you're reading this to build on top of B4, trust this section over the "Implementation guidance" sketch.

### Trip identity is `_id`, not `slug`

The A3 notes originally used the trip `slug` as the identity key, but C1's resolver (the one that writes `hoveredTrip` / `lockedTrip` into context) keys by Sanity `_id`. To avoid an identity mismatch between the writers (pin hover, deep-link effect in `GlobeProvider` which calls `setLockedTripState(target._id)`) and the readers (Timeline labels), Timeline also keys by `_id`. The URL still uses `slug.current` — identity and URL-surface are deliberately different.

**Impact on D2 / future tickets**: any comparison against `hoveredTrip` / `lockedTrip` must use `_id`. If you find yourself reaching for `slug` to compare, you're probably introducing a bug.

### Interaction target is the label, not the segment

B3 landed hover-on-label, not hover-on-segment. B4 inherited that: `onPointerEnter` / `onPointerLeave` / `onPointerDown` / `onPointerUp` live on the label element (and on a transparent hit-area around it), not on the segment bar. This matches the §9.1 acceptance wording ("hover a label") and avoids the timeline's pan-gesture interference at the segment level.

The `stopPropagation` guidance from the sketch still applies, but it's on the label's `onPointerDown` only. The segment itself has no handlers.

### Layout shell: fixed-layer wrapper at `top: NAVBAR_HEIGHT_PX`

`GlobeViewport` uses `fixed inset-0`, which overpaints anything rendered as its sibling in normal flow. To keep Timeline visible on `/globe`, it's mounted inside a fixed-layer shell:

```tsx
<div
  className="hidden md:block fixed left-0 right-0 z-40 px-4"
  style={{ top: NAVBAR_HEIGHT_PX }}
>
  <Timeline />
</div>
```

`NAVBAR_HEIGHT_PX = 72` now lives in `lib/globe.ts` and is imported by both `GlobeViewport` (for mobile globe re-centering math) and `app/globe/layout.tsx`. If the navbar height changes, update the constant once.

**For E1 (mobile layout)**: mobile restructure (globe above timeline) is explicitly *out of scope* for B4. The fixed-layer wrapper is gated `hidden md:block` so mobile sees nothing here — E1 owns the mobile arrangement.

### Mobile click is gated until E3 ships

Label hover is desktop-only (`isDesktop` gate). Label *click* is also gated on mobile — tapping a label on mobile is a no-op for now. E3 will wire the mobile preview-label expansion and its own click behavior. Until then, letting mobile taps trigger the desktop lock path would conflict with the mobile panel/URL flow.

### Pause-reason cleanup is unconditional on leave

The `label-hover` pause reason is removed on `pointerLeave` **regardless of `isDesktop`**. This is defensive: if a user resizes from desktop → mobile while hovering, the enter handler may have added a reason that the mobile leave handler would otherwise skip removing. Cheaper to always call `removePauseReason` than to debug a stuck pause.

### Backward compat with `/timeline-dev`

Timeline reads `useContext(GlobeContext)` **raw** (not via `useGlobe()`) so it can null-check and fall back to the `trips` prop. This keeps `/timeline-dev` (mock data, no provider) working. The `trips` prop is now optional:

```tsx
type TimelineTrip = TripRange & { title?: string; slug?: { current: string } }
interface TimelineProps {
  trips?: TimelineTrip[]
  // ...
}
```

When both the context and the prop are present, the prop wins (so `/timeline-dev` remains predictable). B8 will retire `/timeline-dev` — at that point the prop can be dropped.

### Fetch-error UI lives inside Timeline

`fetchError` is read from context. When true, Timeline returns an inline error row with a Retry button that calls `window.location.reload()`. Retry = full reload because `client.fetch` is server-side (SSR); a client-side refetch would require a different data path. Spec §12.7 doesn't mandate a mechanism — reload is acceptable.

### Memo dependency on `ctx?.trips`

The trips-derivation memo reads `const ctxTripsSource = ctx?.trips` into a local and depends on `[ctxTripsSource]` (not `[ctx]`). Depending on the whole context object causes the memo to recompute on any context change (e.g. hover state flips). The tighter dep is load-bearing for perf when a user is hovering labels rapidly.

### Verification

The ticket was verified against live data on `/globe`:
- URL updates to `?trip=morocco-2018` on label click.
- Switching between labels updates the URL correctly.
- Background click (empty timeline area) deselects and clears the query param.
- `/timeline-dev` still renders with mock data.
- No console or server errors.

Hover-state verification (cursor enter/leave → accent color) was deferred to manual user test because synthetic `mouseenter` events dispatched via `preview_eval` don't trip React's SyntheticEvent system reliably.

### Environment note for future agents

The dev dataset is token-gated. The worktree needs `.env.local` symlinked from the main checkout (or the authenticated `readClient` path from `lib/sanity.ts`) or `/globe` will render with 0 trips even when Sanity has data. `app/globe/layout.tsx` imports `readClient` — do not swap it back to the public `client`.
