# 5C-B7 — Playback: wire all pause/resume sources; zoom reset; lock override

**Epic**: B. Timeline & Playback · **Owner**: Dev B · **Can be run by agent?**: Yes · **Estimated size**: M

## Dependencies

### Hard
- **B6** — pause-reasons API exists; playback controller wired.
- **C2** — pin-hover source emits the pause signal.

### Soft
- **C5** — camera rotate-to-fit trip exists (locked trip should freeze playback, but doesn't require C5 to wire).

### Blocks
- F2 (perf pass assumes playback + pause fully wired).

---

## Goal

Complete the pause/resume system. B6 exposes the API (`addPauseReason` / `removePauseReason` / `isPaused`) and wires one source (floating label hover). This ticket wires the remaining sources: timeline zoom/pan, globe drag, trip lock (indefinite), article open, pin hover. Implements the 5-second idle-resume timer and the zoom-reset-on-resume behavior.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §5.5 Pause triggers
- §5.6 Resume (idle timer, lock override, zoom reset)
- §5.9 Camera during playback (passive spin interaction)

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §5.5, §5.6, §5.9
- [`../../components/globe/Timeline.tsx`](../../components/globe/Timeline.tsx) (post-B5/B6) — timeline gestures wire pause
- [`../../components/globe/GlobePins.tsx`](../../components/globe/GlobePins.tsx) (post-C2) — pin hover wires pause
- [`../../components/globe/GlobeScene.tsx`](../../components/globe/GlobeScene.tsx) — OrbitControls `start`/`end` events already emit drag signals
- [`../../components/globe/GlobeProvider.tsx`](../../components/globe/GlobeProvider.tsx) — pause-reasons registry
- [README §5.3 Pause reasons registry](./README.md#53-pause-reasons-registry-for-b6b7)

## Files to create

- None.

## Files to modify

- `components/globe/GlobeProvider.tsx` — idle-resume timer, lock-override logic, zoom-reset trigger
- `components/globe/Timeline.tsx` — zoom + pan gestures fire `addPauseReason('timeline-zoom')` / `'timeline-pan'`
- `components/globe/GlobeScene.tsx` — OrbitControls `start` event fires `addPauseReason('globe-drag')`; `end` triggers removal with delay
- `components/globe/GlobePins.tsx` — pin hover fires `addPauseReason('pin-hover')` (desktop only)

## Files to delete

- None.

---

## Implementation guidance

### Pause-reasons registry (in GlobeProvider)

Expand B6's minimal implementation:

```tsx
// GlobeProvider.tsx

const pauseReasonsRef = useRef<Set<string>>(new Set())
const [pauseReasonCount, setPauseReasonCount] = useState(0)  // triggers re-render when reasons change

const addPauseReason = useCallback((reason: string) => {
  if (!pauseReasonsRef.current.has(reason)) {
    pauseReasonsRef.current.add(reason)
    setPauseReasonCount(pauseReasonsRef.current.size)
  }
}, [])

const removePauseReason = useCallback((reason: string) => {
  if (pauseReasonsRef.current.has(reason)) {
    pauseReasonsRef.current.delete(reason)
    setPauseReasonCount(pauseReasonsRef.current.size)
  }
}, [])

// isPaused includes the lock override: if a trip is locked, playback is paused
// regardless of the reasons set.
const isPaused = pauseReasonCount > 0 || lockedTrip !== null

// Also track article state — article-open is a pause reason, but driven by
// activeArticleSlug/activeTripSlug rather than explicit add/remove calls.
useEffect(() => {
  const isArticle = activeArticleSlug || activeTripSlug
  if (isArticle) addPauseReason('article-open')
  else removePauseReason('article-open')
}, [activeArticleSlug, activeTripSlug, addPauseReason, removePauseReason])
```

### Idle-resume timer (§5.6)

Play resumes after **5 seconds of full idle** (no active reasons, no lock).

```tsx
const [playbackActive, setPlaybackActive] = useState(false)
const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

useEffect(() => {
  // Whenever the pause state changes:
  if (isPaused) {
    // Clear any pending resume timer.
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
    setPlaybackActive(false)
    return
  }

  // Idle — start the 5s resume timer. Only if lockedTrip is null (spec §5.6).
  if (lockedTrip !== null) {
    setPlaybackActive(false)
    return
  }

  if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
  resumeTimerRef.current = setTimeout(() => {
    setPlaybackActive(true)
    resumeTimerRef.current = null
  }, 5000)

  return () => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
  }
}, [isPaused, lockedTrip])

// Expose playbackActive via context so TimelinePlayhead knows whether to tick.
```

**Wait** — B6's `TimelinePlayhead` reads `isPaused` directly and gates `tick(dt)` on `!isPaused`. That's simpler and correct for the "pause during interaction" case but doesn't implement the 5-second resume delay.

**Correction**: the controller's `paused` state should flip only when the 5s idle timer completes. Update B6's wiring:

- `isPaused` (computed from reasons + lock) → playback is paused.
- `playbackActive` (true only after 5s idle from `isPaused`) → playback is running.
- `TimelinePlayhead` ticks only when `playbackActive === true`.

```tsx
// In TimelinePlayhead (B6's file):
// Replace `if (!isPaused) controllerRef.current?.tick(dt)`
// with `if (playbackActive) controllerRef.current?.tick(dt)`

const { playbackActive } = useGlobe()

useEffect(() => {
  let raf = 0
  let last = performance.now()
  const loop = (t: number) => {
    const dt = Math.min(0.1, (t - last) / 1000)
    last = t
    if (playbackActive) controllerRef.current?.tick(dt)
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
  return () => cancelAnimationFrame(raf)
}, [playbackActive])
```

### Resume picks up from current position (§5.6)

"When playback does resume, it picks up from where the playhead was when interaction started — not from the present edge."

The controller's internal `playheadX` is preserved across pause (we just stopped calling `tick`). So this is free — no special handling needed.

### Playhead visibility during pause (§5.1)

"Hides during user timeline interaction (while panning, zooming, hovering a label, etc.). Reappears at the **right edge (present)** once interaction fully stops."

Two behaviors:
- **During pause** (any reason): playhead `opacity: 0`.
- **When pause clears and resume starts**: playhead teleports to `x = 1` (right edge).

But §5.6 also says "it picks up from where the playhead was when interaction started" — contradicts the §5.1 "reappears at right edge."

**Reconciling**: the two statements apply to different cases:
- §5.1 "reappears at the right edge" — UX reset after the user interacted (clear visual break).
- §5.6 "picks up from where the playhead was" — playback resumes from that position.

Interpretation: **visually, the playhead reappears at the right edge**, but **the underlying state is at the saved position**. This would require the playhead to teleport to right-edge at resume time and the controller's internal state to... also be reset? That contradicts "picks up from where".

**Alternative interpretation**: the playhead hides during the pause (opacity 0); when resume fires, it reappears at its saved position (opacity 1). No teleport.

**Verify with spec carefully**: §5.1 "Reappears at the right edge (present) once interaction fully stops" — this seems to override §5.6. Maybe §5.6 "picks up from where" refers to the internal state across brief interactions (tiny pause counts don't reset position).

**Implementation choice**: on resume, teleport playhead to `x = 1`. This is the simpler interpretation and matches the user-visible promise of §5.1.

```tsx
// In GlobeProvider, when playbackActive transitions false → true:
useEffect(() => {
  if (!playbackActive) return
  // Signal the controller to reset to present.
  playbackControllerRef.current?.resetToPresent()
}, [playbackActive])
```

Add `resetToPresent()` method to the controller:

```ts
// lib/timelinePlayback.ts
resetToPresent() {
  playheadX = 1
  phase = 'sweeping'
  recomputeHighlighted()
  notify()
}
```

**Document the choice in a code comment**; flag for reviewer. See ambiguity #1 below.

### Zoom reset on resume (§5.6)

"Zoom state resets on resume. If the user zoomed the timeline during interaction, the timeline animates back to full-history max zoom when playback restarts."

```tsx
// In Timeline.tsx
const { playbackActive } = useGlobe()
const prevPlaybackActive = useRef(false)
useEffect(() => {
  if (playbackActive && !prevPlaybackActive.current) {
    // Transitioning into playback — animate zoom window back to [0, 1].
    animateZoomTo({ start: 0, end: 1 })
  }
  prevPlaybackActive.current = playbackActive
}, [playbackActive])

// animateZoomTo: simple rAF tween over ~500ms ease-out.
```

### Wire remaining sources

#### Timeline zoom/pan (B3 adds gestures; add pause hooks here)

```tsx
// Timeline.tsx inside the pinch/wheel handler:
addPauseReason('timeline-zoom')
// On gesture end:
removePauseReason('timeline-zoom')
```

```tsx
// Timeline.tsx inside the pan handler:
addPauseReason('timeline-pan')
// On pointerup:
removePauseReason('timeline-pan')
```

#### Globe drag

`GlobeScene.tsx` already has OrbitControls `start` / `end` handlers for auto-rotate. Extend:

```tsx
// In GlobeScene.tsx
const handleStart = () => {
  setAutoRotate(false)
  addPauseReason('globe-drag')
  if (interactionTimeout.current) clearTimeout(interactionTimeout.current)
}
const handleEnd = () => {
  if (interactionTimeout.current) clearTimeout(interactionTimeout.current)
  interactionTimeout.current = setTimeout(() => {
    setAutoRotate(true)
    removePauseReason('globe-drag')
  }, AUTO_ROTATE_RESUME_DELAY)
}
```

**Note**: §5.5 says "Clicking-and-dragging the globe to rotate it manually" pauses playback. But also: "scroll wheel or pinch to zoom" — does globe zoom pause?

Re-read §5.5 pause triggers: "Clicking-and-dragging the globe to rotate it manually" — only drag, not zoom. So globe scroll-wheel zoom should NOT pause playback.

`OrbitControls` fires `start`/`end` for both rotate and zoom. To distinguish: examine the mouse button / touch count during `start`. Alternative: add a separate event listener for `change` that checks whether camera position changed (rotate) vs only distance changed (zoom).

**Simplification**: pause on any OrbitControls interaction. Spec technically says drag-only, but zoom-pause is a minor behavior and the cost of distinguishing is nontrivial.

**Action**: pause on any OrbitControls start. Document as deviation in PR; if a reviewer pushes back, distinguish via event inspection.

#### Pin hover (desktop only)

C2 already handles pin hover state. Add pause wire:

```tsx
// GlobePins.tsx
const { addPauseReason, removePauseReason, isDesktop } = useGlobe()

const handlePointerOver = useCallback((e) => {
  e.stopPropagation()
  if (!showHover) return
  if (selectedPin === group) return
  setHoveredPin(group)
  if (isDesktop) addPauseReason('pin-hover')  // desktop only
}, [showHover, selectedPin, group, setHoveredPin, isDesktop, addPauseReason])

const handlePointerOut = useCallback((e) => {
  e.stopPropagation()
  if (!showHover) return
  setHoveredPin((prev) => (prev === group ? null : prev))
  if (isDesktop) removePauseReason('pin-hover')
}, [showHover, group, setHoveredPin, isDesktop, removePauseReason])
```

Actually, `pin-hover` is a single-reason string that all pins share. If one pin is hovered and another is hovered next (pin-transit), the second `addPauseReason('pin-hover')` is a no-op (Set semantics), and the first's `removePauseReason` cleanup might fire on pointerOut. Set has one entry — remove clears it even though a new pin is now hovered. Race.

**Fix**: use the pin's group id as the reason. `addPauseReason('pin-hover:' + group)`. Remove on leave. Multiple simultaneous pin hovers (rare) are all tracked.

Or simpler: tie to `hoveredPin` state via effect:

```tsx
// GlobeProvider.tsx
useEffect(() => {
  if (hoveredPin && isDesktop) {
    addPauseReason('pin-hover')
    return () => removePauseReason('pin-hover')
  }
}, [hoveredPin, isDesktop, addPauseReason, removePauseReason])
```

Cleaner — effect-driven. Put in provider, not component.

### Locked trip = indefinite pause (§5.6)

"If a trip is currently locked (user clicked a label): playback stays paused indefinitely until the trip is deselected. The 5s idle timer does not run while a trip is locked."

The `isPaused = pauseReasonCount > 0 || lockedTrip !== null` computation above handles this. When `lockedTrip` clears, the idle timer starts (if no reasons active). Correct.

### Debounce for hover pauses (from B4 ambiguity)

Brief cursor transit should not pause. Add a 150ms debounce for hover-kind reasons:

```tsx
// Helper in provider
const pendingHoverReasons = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

const addDebouncedPauseReason = useCallback((reason: string, delayMs = 150) => {
  if (pendingHoverReasons.current.has(reason)) return
  const timer = setTimeout(() => {
    addPauseReason(reason)
    pendingHoverReasons.current.delete(reason)
  }, delayMs)
  pendingHoverReasons.current.set(reason, timer)
}, [addPauseReason])

const removeDebouncedPauseReason = useCallback((reason: string) => {
  const pending = pendingHoverReasons.current.get(reason)
  if (pending) {
    clearTimeout(pending)
    pendingHoverReasons.current.delete(reason)
  } else {
    removePauseReason(reason)
  }
}, [removePauseReason])
```

Use `addDebouncedPauseReason` for `'label-hover'`, `'pin-hover'`. Use immediate `addPauseReason` for `'timeline-pan'`, `'timeline-zoom'`, `'globe-drag'`, `'article-open'`, `'trip-lock'`.

---

## Acceptance criteria

- [ ] All pause triggers from §5.5 pause playback when fired.
- [ ] All resume triggers resume after 5s idle.
- [ ] Locked trip (clicking a label) keeps playback paused indefinitely; deselecting starts the 5s timer.
- [ ] Opening article sliver pauses playback; closing resumes after 5s.
- [ ] Globe drag pauses; release → 5s resume.
- [ ] Pin hover (desktop) pauses; pointer off for > 150ms before pausing (debounce).
- [ ] Brief cursor transit over timeline labels (< 150ms hover) does NOT pause.
- [ ] Zooming timeline pauses; release → resume animates zoom back to full-history over ~500ms.
- [ ] After idle-resume, playhead reappears at right edge (`x = 1`) — not saved position. (See ambiguity #1.)
- [ ] Scroll-wheel zoom on globe also pauses (pragmatic deviation from spec). Documented.
- [ ] Playhead visible only when playback is active.

## Non-goals

- **No change to the controller algorithm** — B6 owns it.
- **No passive spin changes** — GlobeScene already handles `autoRotate` via `controls.start`/`end`. This ticket just adds pause-reason calls alongside.
- **No camera-drag-while-locked behavior** — C5 owns that.

## Gotchas

- **OrbitControls `start` fires for both drag and zoom**. Spec says only drag pauses. Simplified to "any interaction pauses" (less code, same user feel for 99% of cases). Reviewer-visible decision.
- **Race between `addPauseReason` and `removePauseReason` across multiple pins**: solved by the effect-driven approach using `hoveredPin` as the trigger, rather than each pin calling add/remove directly.
- **`article-open` pause**: driven by route state, not explicit calls. The `useEffect` on `[activeArticleSlug, activeTripSlug]` manages it.
- **Test the resume timer reset**: if the user pauses (reason in set), then adds another reason, the set size grows but count stays > 0. Removing one reason while another is still set should NOT start the resume timer — `isPaused` still `true`. Verified by the single effect on `[isPaused, lockedTrip]`.
- **Clean up on unmount**: clear all pending debounce timers and the resume timer on provider unmount. Most components won't hit this but defense-in-depth.
- **`resetToPresent` on resume**: required per the §5.1 vs §5.6 ambiguity resolution. Makes sweep start visibly fresh.

## Ambiguities requiring clarification before starting

1. **§5.1 vs §5.6 playhead position on resume**: spec §5.1 says "reappears at the right edge (present)." Spec §5.6 says "picks up from where the playhead was when interaction started." I'm implementing §5.1 (reset to right). Acceptable deviation: preserve internal state (for highlights) but visually teleport.

   Actually thinking more — §5.6 "picks up from where" probably refers to the **internal state across brief pauses** (e.g., you hovered a label briefly — playhead continues from where). §5.1 "reappears at the right edge" probably refers to **major interactions** (pan, zoom).

   Defaulting to §5.1 unconditionally because that's the clearer UX promise. If reviewer wants distinction between "brief" and "major" pauses, additional logic required.

   **Action**: implement reset-to-right on every resume. Document in PR.

2. **Globe zoom pause**: spec §5.5 says only globe drag pauses. I'm pausing on zoom too for code simplicity. If reviewer insists on distinguishing, listen to OrbitControls `change` event and compare camera position pre/post to detect drag vs zoom.

   **Action**: conservative simplification — pause on any OrbitControls start. Document.

3. **Multiple-pin-hover race**: resolved by the effect-driven approach above. No ambiguity — just an implementation pattern choice.

4. **Debounce duration**: 150ms default. Tunable during F2 if feel is wrong.

## Handoff / outputs consumed by later tickets

- `playbackActive` on context (computed) — consumed by `TimelinePlayhead` (B6) gating RAF loop, and by Timeline's zoom-reset effect.
- Pause-reasons registry is complete — F2 can profile to ensure no reason leaks.

## How to verify

1. `/globe` — let it play for 10s.
2. Hover a trip label briefly (< 100ms) — playback continues.
3. Hover a trip label and hold (> 200ms) — playback pauses. Move off — 5s later, playhead jumps to right and resumes.
4. Click a trip label (lock) — playback pauses indefinitely. Click again to deselect — 5s later resumes.
5. Drag the globe — playback pauses. Release — 5s later, passive spin + playback resume together.
6. Open item article (from a pin panel, requires D1 merged) — playback pauses. Close article — 5s later resumes.
7. Pinch-zoom timeline — pauses. Release — 5s later, timeline animates back to full history, playback resumes from right edge.
8. Check `isPaused` / `playbackActive` / `pauseReasonsRef.current` in React DevTools during each interaction. Confirm reasons enter/exit the set correctly.
