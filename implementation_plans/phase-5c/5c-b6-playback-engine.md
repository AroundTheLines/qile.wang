# 5C-B6 — Playback: playhead, loop, floating label, arc/segment highlighting

**Epic**: B. Timeline & Playback · **Owner**: Dev B · **Can be run by agent?**: Partial — timing and feel need human review; loop direction spec subtlety worth double-reading · **Estimated size**: L

## Dependencies

### Hard
- **B5** — playhead rendered on a complete timeline.
- **C6** — arcs must respond to playback-highlighted trips; without C6 the arc-response acceptance criterion isn't testable.

### Soft
- None.

### Blocks
- B7 (pause/resume sources integration).

---

## Goal

Implement the playback animation — the "globe is never truly static" promise of the spec. A playhead sweeps the timeline continuously; as it crosses trip segments, those trips' arcs + pins + segments highlight with a fade; at the earliest edge it holds for ~5s then jumps to present and repeats.

This is the **riskiest subsystem in the phase** per spec §15 — it coordinates with camera, pan/zoom, pin highlights, arcs, URL, lock state, passive spin, and mobile gesture conflicts. Everything else must be working before this lands.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §5 Playback Animation (ENTIRE SECTION — read carefully)
- §5.1 Playhead
- §5.2 Initial load behavior
- §5.3 Speed
- §5.4 Loop
- §5.8 Floating label
- §5.9 Camera during playback
- §5.10 Overlapping trips
- §13.6.2 `data-no-skeleton` on playhead + floating label

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §5 in full (re-read §5.4 loop behavior — ambiguity flagged below)
- [`../../components/globe/Timeline.tsx`](../../components/globe/Timeline.tsx) (post-B5)
- [`../../components/globe/GlobePositionBridge.tsx`](../../components/globe/GlobePositionBridge.tsx) — `frameSubscribersRef` pattern for imperative frame updates
- [`../../components/globe/GlobeClickConnector.tsx`](../../components/globe/GlobeClickConnector.tsx) — another example of ref-driven, no-state-per-frame animation
- [`../../components/globe/TripArcs.tsx`](../../components/globe/TripArcs.tsx) (post-C6) — arcs consume playback highlight state

## Files to create

- `lib/timelinePlayback.ts` — pure state machine for playback (no React)
- `components/globe/TimelinePlayhead.tsx` — renders the playhead line + floating label

## Files to modify

- `components/globe/Timeline.tsx` — mount `<TimelinePlayhead>`
- `components/globe/GlobeProvider.tsx` — expose `playbackHighlightedTripIds: string[]`, `playheadX: number` (ref), `playbackActive: boolean`
- `components/globe/GlobeContext.tsx` — add the fields above

## Files to delete

- None.

---

## Implementation guidance

### Spec re-read: loop direction

Quoted §5: "a continuous playback animation sweeps **present → past**" (intro) — BUT also: §5.4 "When playhead reaches the earliest trip: playhead stays at that position for **5 seconds**, then **resets to the present** and resumes."

Reconciling: sweep direction is **present → past** (right-to-left). When it reaches the earliest segment, it holds there, then teleports to the present edge (right side) and sweeps again left.

Double-check with spec §5.1: "Moves smoothly and continuously (not discrete trip-to-trip hops). **Starts at the present edge**." — confirms starting at the right, sweeping left.

**Verified direction**: right → left (present → past). Reset instantly to right (present edge). Hold for 5s at left (earliest), then reset.

Wait — re-read §5.4 carefully: "When playhead reaches the earliest trip: playhead stays at that position for 5 seconds (globe in fully neutral state — nothing highlighted, nothing dimmed), then resets to the present and resumes."

So the 5-second hold is AT the earliest position, not at present. After hold, teleport to present, resume sweep. Got it.

### Playback state machine

```ts
// lib/timelinePlayback.ts
import type { TripRange } from './timelineCompression'

export interface PlaybackConfig {
  halfYearSeconds: number      // default 5 — 5s per half-year of compressed timeline
  loopHoldMs: number            // default 5000 — hold duration at earliest edge
  trips: TripRange[]
}

export interface PlaybackState {
  playheadX: number             // 0..1 in compressed-x
  highlightedTripIds: string[]  // trips the playhead is currently crossing
  phase: 'sweeping' | 'holding'
}

export interface PlaybackController {
  readonly state: PlaybackState
  pause(): void
  resume(): void
  tick(dtSec: number): void     // advance state by dt
  subscribe(fn: (s: PlaybackState) => void): () => void
  setTrips(trips: TripRange[]): void
}

export function createPlaybackController(cfg: PlaybackConfig): PlaybackController {
  let { trips, halfYearSeconds, loopHoldMs } = cfg
  // Sweep direction: present → past. At x=1 (present), sweep left (decreasing).
  let playheadX = 1
  let highlightedTripIds: string[] = []
  let phase: PlaybackState['phase'] = 'sweeping'
  let holdElapsedMs = 0
  let paused = false
  const subscribers = new Set<(s: PlaybackState) => void>()

  // Convert halfYearSeconds into compressed-x velocity.
  // The compressed map gives us the total "compressed duration" abstractly —
  // we can't derive half-year in compressed-x without the map. Instead,
  // receive speed as compressed-x-per-second externally.
  //
  // Decision: take `xPerSecond` directly — simpler. Default = 1 / (2 * 365 / (halfYearSeconds * 182.5)) ...
  //
  // Re-read §5.3 "Approximately 5 seconds per half-year of trips" — means 5s to cross
  // a half-year's worth of *real* time. Since compression distorts real-time spacing,
  // map real seconds ↔ compressed-x via the CompressedMap (not this controller's concern).
  //
  // This controller takes a raw `xPerSecond` rate. Timeline computes it from the map:
  //   xPerSecond = (compressed.dateToX(now) - compressed.dateToX(nowMinus6Months)) / halfYearSeconds
  //
  // For initial ship, accept xPerSecond as a config input instead of deriving from halfYearSeconds.

  const xPerSecond = /* external — see note */ 0.033  // rough placeholder; tune during integration

  const notify = () => {
    const snapshot: PlaybackState = { playheadX, highlightedTripIds, phase }
    for (const s of subscribers) s(snapshot)
  }

  const recomputeHighlighted = () => {
    highlightedTripIds = trips
      .filter((t) => {
        const start = compressedStartOf(t)  // caller provides compression lookup
        const end = compressedEndOf(t)
        return playheadX >= start && playheadX <= end
      })
      .map((t) => t.id)
  }

  return {
    get state() { return { playheadX, highlightedTripIds, phase } },
    pause() { paused = true },
    resume() { paused = false },
    setTrips(t) { trips = t; recomputeHighlighted(); notify() },
    tick(dtSec) {
      if (paused) return
      if (phase === 'sweeping') {
        playheadX -= xPerSecond * dtSec
        if (playheadX <= 0) {
          playheadX = 0
          phase = 'holding'
          holdElapsedMs = 0
          highlightedTripIds = []  // "fully neutral" per §5.4
          notify()
          return
        }
        recomputeHighlighted()
        notify()
      } else {
        holdElapsedMs += dtSec * 1000
        if (holdElapsedMs >= loopHoldMs) {
          playheadX = 1
          phase = 'sweeping'
          recomputeHighlighted()
          notify()
        }
      }
    },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn) },
  }
}
```

**Simplification**: the controller doesn't know about CompressedMap. It takes trips as `TripRange` and needs their compressed-x start/end. Pass a helper `getTripXRange(trip) => [x0, x1]` as a config callback, or have the caller pre-compute and pass as `trips: { id, xStart, xEnd }[]`.

**Simpler API**:

```ts
export interface PlaybackTrip {
  id: string
  xStart: number
  xEnd: number
}

export function createPlaybackController(cfg: {
  trips: PlaybackTrip[]
  xPerSecond: number
  loopHoldMs?: number
}): PlaybackController { /* ... */ }
```

Timeline does the compression lookup:

```tsx
const playbackTrips = useMemo(
  () => trips.map((t) => ({
    id: t.id,
    xStart: compressed.dateToX(t.startDate),
    xEnd: compressed.dateToX(t.endDate),
  })),
  [trips, compressed]
)
```

### Playhead rendering (imperative, not state-driven)

```tsx
// components/globe/TimelinePlayhead.tsx
'use client'

import { useEffect, useRef, useMemo } from 'react'
import { createPlaybackController, type PlaybackController } from '@/lib/timelinePlayback'
import { useGlobe } from './GlobeContext'
import type { CompressedMap } from '@/lib/timelineCompression'

interface Props {
  compressed: CompressedMap
  zoomWindow: { start: number; end: number }
  containerWidth: number
  leftOffsetPx: number
  trips: { id: string; startDate: string; endDate: string; title?: string }[]
}

export default function TimelinePlayhead({ compressed, zoomWindow, containerWidth, leftOffsetPx, trips }: Props) {
  const playheadRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<PlaybackController | null>(null)
  const { isPaused, setPlaybackHighlightedTripIds, addPauseReason, removePauseReason } = useGlobe()
  // isPaused comes from B7 (pause reasons). We listen to it reactively.

  const playbackTrips = useMemo(
    () => trips.map((t) => ({
      id: t.id,
      xStart: compressed.dateToX(t.startDate),
      xEnd: compressed.dateToX(t.endDate),
    })),
    [trips, compressed]
  )

  const xPerSecond = useMemo(() => {
    // 5s per half-year of real time, projected through the compression.
    // dateToX distorts real time, so compute compressed-x span of a 6-month window.
    const now = compressed.end
    const nowDate = new Date(now)
    const sixMonthsAgo = new Date(nowDate)
    sixMonthsAgo.setMonth(nowDate.getMonth() - 6)
    const pastISO = sixMonthsAgo.toISOString().slice(0, 10)
    const halfYearCompressedX = compressed.dateToX(now) - compressed.dateToX(pastISO)
    return halfYearCompressedX / 5  // 5s per half-year
  }, [compressed])

  // Create controller once, update trips/speed on change.
  useEffect(() => {
    const c = createPlaybackController({
      trips: playbackTrips,
      xPerSecond,
      loopHoldMs: 5000,
    })
    controllerRef.current = c

    c.subscribe((s) => {
      // Update playhead position imperatively
      if (playheadRef.current) {
        const zoomSpan = zoomWindow.end - zoomWindow.start
        const projX = (s.playheadX - zoomWindow.start) / zoomSpan
        if (projX < 0 || projX > 1) {
          playheadRef.current.style.opacity = '0'
        } else {
          playheadRef.current.style.opacity = '1'
          playheadRef.current.style.left = `${projX * containerWidth + leftOffsetPx}px`
        }
      }
      // Update label
      if (labelRef.current) {
        const names = s.highlightedTripIds
          .map((id) => trips.find((t) => t.id === id)?.title ?? '')
          .filter(Boolean)
        labelRef.current.textContent = names.length > 0 ? names.join(' · ') : ''
        labelRef.current.style.opacity = s.phase === 'sweeping' ? '1' : '0'
      }
      // Propagate to context for arcs + pins to react
      setPlaybackHighlightedTripIds(s.highlightedTripIds)
    })

    return () => {
      // Controller has no teardown currently; add if needed.
    }
  }, [playbackTrips, xPerSecond, zoomWindow.start, zoomWindow.end, containerWidth, leftOffsetPx, trips, setPlaybackHighlightedTripIds])

  // RAF loop: drive tick(dtSec). Respect pause state.
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000)  // clamp to 100ms to avoid huge jumps on tab switch
      last = t
      if (!isPaused) controllerRef.current?.tick(dt)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [isPaused])

  // Floating label hover → pause (§5.5)
  const onLabelEnter = () => addPauseReason('playback-floating-label-hover')
  const onLabelLeave = () => removePauseReason('playback-floating-label-hover')

  return (
    <>
      {/* Playhead vertical line */}
      <div
        ref={playheadRef}
        data-no-skeleton
        className="absolute top-0 bottom-0 w-px bg-black/70 dark:bg-white/80 pointer-events-none"
        style={{ transition: 'opacity 150ms' }}
      />
      {/* Floating label */}
      <div
        ref={labelRef}
        data-no-skeleton
        onPointerEnter={onLabelEnter}
        onPointerLeave={onLabelLeave}
        className="absolute top-1 px-2 py-0.5 bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 text-[9px] tracking-widest uppercase pointer-events-auto cursor-pointer max-w-[240px] truncate shadow-sm"
        style={{
          transition: 'opacity 200ms',
          // Positioning: attached to playhead. Compute in subscribe callback by setting left in same update.
        }}
      />
    </>
  )
}
```

**Note**: the floating label's `left` also needs updating in the subscribe callback (not shown above — add it). Position the label ~6px above the track, horizontally centered on the playhead. Clamp to visible range to avoid edge-clip.

### Context additions (coordinate with C1)

Verify C1 includes these. If missing, add:

```ts
// GlobeContext.tsx additions (C1 or here if not done)
playbackHighlightedTripIds: string[]
setPlaybackHighlightedTripIds: (ids: string[]) => void
```

Actually — the playhead already calls `setPlaybackHighlightedTripIds` via context. Make sure `GlobeProvider` holds this in state and exposes it.

### Overlapping trips (§5.10)

Multiple trips at same `playheadX` → `highlightedTripIds` contains both. Floating label shows `"Trip A · Trip B"`. Truncate with ellipsis if over ~240px total (the `max-w-[240px] truncate` classes handle this via CSS).

### Initial load (§5.2)

- While `trips` is empty (still loading), don't start the controller. Once trips arrive, start from `playheadX = 1`.
- Passive globe spin continues (already exists in GlobeScene, unchanged).

### Floating label click (§5.8)

Desktop: click → lock the currently-highlighted trip. Mobile: tap → preview.

```tsx
const onLabelClick = () => {
  const highlightedIds = /* from controller state */
  if (highlightedIds.length === 0) return
  // If multiple, pick the first. (Spec doesn't say — using first.)
  if (isDesktop) setLockedTrip(highlightedIds[0])
  else setPreviewTrip(highlightedIds[0])  // preview is E3's concern
}
```

---

## Acceptance criteria

- [ ] On `/globe` with fixtures loaded: playhead visible at right edge, starts sweeping left within ~2s.
- [ ] Playhead's `left` updates smoothly (visually 60fps).
- [ ] As playhead crosses a trip segment, that segment + label turn accent color (via `playbackHighlightedTripIds` state flowing to TimelineSegment).
- [ ] Floating label above/near the playhead shows the currently-highlighted trip title. "Trip A · Trip B" when two trips overlap (fixture: SF Q4 '23 + Seattle Q4 '23).
- [ ] Reaching `x = 0`: playhead stops, all highlights clear (fully neutral), holds for 5s, then teleports to `x = 1` and resumes.
- [ ] Hovering the floating label pauses the sweep (`addPauseReason('playback-floating-label-hover')`).
- [ ] Clicking the floating label locks the currently-highlighted trip (desktop).
- [ ] Playhead has `data-no-skeleton`; floating label has `data-no-skeleton`.
- [ ] No React re-renders of Timeline children during sweep (inspect via Profiler — the imperative ref-based update keeps re-renders localized).
- [ ] Arcs on the globe respond: when playhead enters a trip's range, arcs fade in over 400ms; fade out on exit (verified once C6 lands — if C6 hasn't, verify the context signal is correct via React DevTools).

## Non-goals

- **Pause reason wiring for other sources** — B7 (this ticket only wires `playback-floating-label-hover`).
- **Zoom reset on playback resume** — B7.
- **Pin highlight from playback** — handled indirectly via C2 reading `playbackHighlightedTripIds`; not re-scoped here.
- **Mobile preview behavior on label click** — E3 (this ticket uses `isDesktop` gate).

## Gotchas

- **Spec loop direction**: sweep is **present → past** (right to left). Easy to implement backward if you skim §5.1 only. Re-read §5.4 for the hold-at-earliest-then-teleport-to-present cycle.
- **`performance.now` precision**: use `performance.now()` for dt, not `Date.now()`. The latter is coarser and causes jitter.
- **`dt` clamping**: when the tab is backgrounded, RAF pauses. On return, the first `dt` can be enormous — clamp to 100ms (`Math.min(0.1, dt)`) to avoid huge playhead jumps.
- **Imperative updates, not state**: writing `playheadX` to state every RAF causes ~60 rerenders/sec of Timeline. Use refs + direct DOM writes (`playheadRef.current.style.left = ...`). State-based update is only for `highlightedTripIds` (low-frequency — changes maybe once per second), which is OK.
- **`xPerSecond` computation**: naive `1 / (totalDays / halfYearDays * halfYearSeconds)` ignores compression. Correct computation uses `CompressedMap.dateToX` to find the compressed-x distance a half-year spans, then divides by `halfYearSeconds`. See the `useMemo` above.
- **Start condition**: before first RAF tick, playhead sits at `playheadX = 1` (right edge). In zoomed-in views where `x = 1` is off-screen right, playhead renders invisibly (opacity 0). Fine — it comes into view as sweep reaches visible range.
- **Floating label position**: when the playhead is near the left edge of the visible timeline, the label would clip off-screen. Clamp label's `left` to `[4px, containerWidth - labelWidth - 4px]`. Measure label width via `ref.getBoundingClientRect` in the subscribe callback.
- **Subscribe cleanup**: `controllerRef.current?.tick(dt)` uses the current controller. If trips change, the `useEffect` creates a new controller and unsubscribes the old subscriber — but the old subscriber's DOM writes may already have been applied in this frame. Usually harmless; worth flagging during profiling.

## Ambiguities requiring clarification before starting

1. **Sweep direction re-verification**: spec §5 intro says "past → present" in the opening sentence but §5.4 implies present → past. The §5.4 mechanics (hold at earliest, reset to present) only make sense if sweep is present → past. **Going with present → past.** If a reviewer disagrees, the fix is one sign flip on `xPerSecond`.

   **Action**: implement present → past; call out in PR description.

2. **Floating label click on multi-trip overlap**: spec says "clicking this floating label behaves the same as clicking the trip's timeline label" — but there are multiple trips highlighted in overlap. Which one locks?
   - **Option A**: first in `highlightedTripIds` (arbitrary — chronological order).
   - **Option B**: show a picker on click (additional UI).
   - **Option C**: do nothing (click is no-op during overlap).

   **Default**: Option A (first). Simplest; edge case so rarely triggered.

3. **`xPerSecond` feel**: computed default ≈ 5s per half-year but compression distorts. On a 5-year dataset, sweep takes ~50s; with extensive compression of empty regions, effective "real time crossed" per second varies. Review after B4/B5 integration. Tunable via constant.

4. **Does the controller survive zoom changes?**: creating a new controller on every zoom change is expensive (unsubscribing subscribers, re-initializing). The `useEffect` above re-runs when zoomWindow or compressed changes. Acceptable — these are infrequent. If performance complaints, refactor the controller to accept updates in place.

5. **Loop hold UX**: at `phase: 'holding'`, all highlights clear. But passive globe spin continues. Spec explicitly says "globe in fully neutral state" — we're interpreting that as "no playback highlights" while keeping other idle animations. Verify with reviewer.

## Handoff / outputs consumed by later tickets

- `playbackHighlightedTripIds` on context — C6 consumes (arc fade-in), C2 consumes (pin highlight during playback), B5's TimelineSegment consumes (segment color).
- `playback-floating-label-hover` pause reason — added to the registry (README §5.3).
- `TimelinePlayhead` component — mounted in Timeline.tsx.
- `lib/timelinePlayback.ts` controller — pure module; could be unit-tested independently (not required but welcome).

## How to verify

1. `/globe` — watch for 5s. Playhead should start sweeping left.
2. Observe a trip segment: as playhead crosses, segment accent-colors; when playhead leaves, returns to idle color.
3. Hover floating label — sweep pauses (verify by noting playhead stops).
4. Click floating label — trip locks (verify via URL + panel).
5. Wait for playhead to reach left edge — it stops, 5s hold, then teleports right.
6. Overlap test: force playhead into SF+Seattle Q4 '23 overlap region (pause at right location). Label shows "SF Q4 '23 · Seattle Q4 '23".
7. Chrome performance tab: record 10s of sweep. Main thread should show ~60fps with minimal React commit work.
8. React Profiler: during sweep, Timeline and siblings don't re-render on every frame (only when `highlightedTripIds` changes).
