# 5C-F2 — Performance optimization pass

**Epic**: F. Polish · **Owner**: All three (coordinate) · **Can be run by agent?**: Partial — profiling + interpretation requires human judgment · **Estimated size**: M

## Dependencies

### Hard
- **B7** — playback + pause fully wired
- **C7** — panel cross-interactions landed
- **D3** — URL state + escape complete
- **E3** — mobile flows wired

### Soft
- **F1** — bones available for skeleton rendering profile.

### Blocks
- **F3** (verification pass assumes perf work done).

---

## Goal

Profile the running app with full Phase 5C features. Identify per-frame allocation hotspots, React reconciliation bloat, and unnecessary re-renders. Apply targeted fixes without breaking features. Stay under the §13.5.2 target capacity at 60fps.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §13.5 Performance (entire section)
- §13.5.1 Guiding principles
- §13.5.2 Expected scale ceiling
- §13.5.3 Optimization ordering

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §13.5
- All Phase 5C tickets' Gotchas sections (pre-flagged perf concerns):
  - B1 (compression algorithm — pure, fine)
  - B5 (collision detection runs on zoom)
  - B6 (RAF imperative updates)
  - C6 (arcs + useFrame hotspot)
  - E1 (IntersectionObserver, Canvas mount/unmount)
  - C1 (provider state churn)

## Files to create

- None.

## Files to modify

- Any file identified as a hotspot by profiling.

## Files to delete

- None (unless discovering dead code).

---

## Implementation guidance

### Step 1: baseline profile

1. `npm run dev` (production-like: `npm run build && npm start` — `dev` mode has extra overhead).
2. Open `/globe` in Chrome. Seed data: 10 trips, 15 visits, 9 pins (A4's fixtures).
3. Chrome devtools → Performance → Record 30 seconds:
   - 5s idle (passive spin, playback active).
   - 5s timeline hover/unhover a label.
   - 5s pin hover/unhover (desktop).
   - 5s drag globe.
   - 5s lock a trip, close panel.
   - 5s open + close article sliver.
4. Stop recording. Look for:
   - **Long tasks** (yellow bars > 50ms) during interactions.
   - **Scripting % vs rendering %**: ideally rendering dominates.
   - **Frame rate in FPS meter**: should stay ≥ 58fps on desktop, ≥ 45fps on mid-range mobile.

### Step 2: React Profiler sweep

1. React DevTools → Profiler → Record.
2. Repeat the 5 interactions above.
3. Inspect the flamegraph:
   - Components re-rendering during idle (no user input): hotspots.
   - Timeline children re-rendering on every playhead tick: reconsider state flow.
   - Panel components re-rendering on unrelated context changes: memoize.
4. Apply memoization (`React.memo`, `useMemo`, `useCallback`) surgically.

### Step 3: 3D / WebGL profiling

1. Chrome devtools → Rendering → "Frame Rendering Stats" on.
2. Observe during playback + idle. GPU time should stay < 8ms/frame at 60fps target.
3. If arc rendering or pin updates dominate: revisit imperative-update patterns.

### Common hotspots to audit

Based on spec §13.5.1 and prior ticket flags:

**Per-frame allocations**:
- Grep for `new THREE.Vector3(` in `useFrame` bodies. Should be zero unless on a module scratch like `GlobePositionBridge.tsx` pattern.
  ```bash
  grep -n "useFrame\|new THREE\." components/globe/**/*.tsx
  ```
- `GlobePins.tsx`, `TripArcs.tsx`, `GlobeScene.tsx` are the primary suspects.
- Fix: hoist to module-scoped scratch vectors.

**Stable React references**:
- `GlobeProvider.tsx` context value is recomputed every render. Wrap in `useMemo`:
  ```tsx
  const value = useMemo(() => ({ ... }), [/* all deps */])
  ```
  (Or rely on React's context stability for each consumer. Measure first.)

- `pins` and `trips` arrays are stable from props. `aggregatePins` runs on layout — memoize if the array identity changes unnecessarily.

**Avoid animation thrash**:
- Playback sweep updates `playheadRef.current.style.left` directly — no React render. Good.
- If `highlightedTripIds` changes every frame (small timing jitter), it causes React renders. The controller's `recomputeHighlighted` only emits when the set actually changes — verify:
  ```ts
  // In lib/timelinePlayback.ts recomputeHighlighted:
  const newIds = trips.filter(...).map(...)
  if (!arraysEqual(newIds, highlightedTripIds)) {
    highlightedTripIds = newIds
    notify()
  }
  ```

**Arc geometry caching**:
- `TripArcs.tsx` uses `useMemo` to compute arc points once per `tripsWithVisits` change. Confirm.

**Lazy loading**:
- `TripArticleContent` and `ArticleContent` could be code-split. In `app/trip/[slug]/page.tsx`:
  ```ts
  // Probably not needed — server component doesn't affect client bundle size.
  ```
  Focus on client components that render conditionally — e.g., the heavy boneyard fixtures inside `<Skeleton>` only render during loading. No change needed.

### Common fixes

**Fix 1**: `useCallback` wrapper on context setters
```tsx
// Already in C1 for most; audit
const setHoveredTrip = useCallback((id: string | null) => { ... }, [])
```

**Fix 2**: Memoize pin list in TripArcs
```tsx
const arcs = useMemo(() => {
  const result: ArcData[] = []
  for (const trip of tripsWithVisits) { ... }
  return result
}, [tripsWithVisits])  // only recompute on data change
```

**Fix 3**: `React.memo` around `TimelineSegment`, `VisitSection`, `ArcLine`:
```tsx
export default React.memo(TimelineSegment, (prev, next) => {
  return prev.trip.id === next.trip.id &&
         prev.zoomWindow.start === next.zoomWindow.start &&
         prev.zoomWindow.end === next.zoomWindow.end &&
         prev.containerWidth === next.containerWidth &&
         prev.placement === next.placement
})
```

**Fix 4**: useMemo arc computation keys
```tsx
const arcs = useMemo(() => computeArcs(tripsWithVisits), [tripsWithVisits])
```

### Frame budget check

60fps = 16.7ms per frame. Allocate roughly:
- 4ms React reconciliation
- 4ms browser composite
- 8ms WebGL render
- ≤ 1ms margin

If any single component's render takes > 1ms (React Profiler shows), investigate.

### Memory leak check

1. Open Chrome devtools → Memory → Take heap snapshot.
2. Interact for 2 minutes (repeat the 5 actions).
3. Take another snapshot.
4. Compare: memory should plateau, not grow linearly.
5. If growing: find the leak. Common culprits:
   - Frame subscribers never removed (`frameSubscribersRef.current.delete(fn)` missing in cleanup).
   - Playback controller instance leaked on effect re-run.
   - Event listeners on window without removal.

### Benchmarks (target)

Per §13.5.2:

| Dataset | FPS (desktop) | FPS (mobile) | Hover→paint time |
|---|---|---|---|
| 10 trips / 15 visits / 9 pins (fixtures) | 60 | 55+ | < 16ms |
| 50 trips / 200 visits / 500 pins (synthetic) | 60 | 40+ | < 25ms |

Synthetic data: add a flag to the fixture script to seed 50 trips with random coordinates. Use for stress testing only.

---

## Acceptance criteria

- [ ] No `new THREE.Vector3` or similar allocations inside `useFrame` bodies.
- [ ] During playback sweep: React Profiler shows only `<Timeline>` child components re-rendering when `highlightedTripIds` changes (not every frame).
- [ ] During idle (no interaction): negligible React re-renders. Profiler flat.
- [ ] Globe idle spin: 60fps on desktop.
- [ ] Playback sweep + idle spin: 60fps on desktop.
- [ ] Panel open/close transitions: < 16ms main thread work per frame.
- [ ] Arc pulsing (locked trip): no detectable jank.
- [ ] Memory plateau after 2 min of interaction — no linear growth.
- [ ] Mobile (real device or devtools iPhone 12 emulation): 45+ fps during interactions.
- [ ] `npm run build` bundle size: comparable to pre-5C (Phase 5C adds timeline + panels; expect +15–30kb gzipped, not 100+).

## Non-goals

- **No pin clustering** — out of scope per §13.5.2.
- **No timeline virtualization** — out of scope.
- **No partial arc rendering** — out of scope.
- **No replacing libraries**: stick with Framer Motion, R3F, drei.

## Gotchas

- **Production mode matters**: always profile with `npm run build && npm start`. Dev mode double-renders and shows inflated numbers.
- **Throttling**: Chrome's CPU throttle setting (4× slowdown) simulates low-end devices. Use for confidence but don't chase perfection at 4× — real devices are closer to 1–2×.
- **React 19 auto-memoization**: React 19 (shipped in this repo per `package.json`) has new features around automatic memoization. Test whether `React.memo` wrappers are even necessary before adding them — they may be redundant.
- **Over-memoization**: wrapping everything in `useMemo`/`useCallback` can slow things down (the hook itself costs memory and closure creation). Apply surgically, not wholesale.
- **Profile AFTER landing a fix, not before**: speculative fixes without measurement are counterproductive. Record baseline → fix → re-record → measure improvement.
- **Arc count 500**: each arc is a `<Line>` with 33 points. 500 arcs × 33 = 16,500 vertices. Tiny for GPU. If React Profiler flags 500 `<ArcLine>` re-renders per tick, flatten to a single merged geometry (more work, defer until needed).

## Ambiguities requiring clarification before starting

1. **Is F2 mandatory or optional?**: spec §13.5.3 says "run a dedicated optimization pass as a final ticket before closing out the phase." Mandatory. Don't skip.

2. **Target hardware**: desktop = a 2020+ laptop; mobile = iPhone 12 / Pixel 5. Not Pixel 3 or iPhone 8 — those are legacy. Reviewer may specify.

   **Action**: target modern mid-range. Document.

3. **What counts as "done"?**: no fixed benchmark from spec. I'm proposing 60fps desktop / 45fps mobile. Negotiable.

## Handoff / outputs consumed by later tickets

- Performance baseline numbers — document in a PR comment. F3 references them during verification.

## How to verify

1. Chrome devtools Performance tab: record each interaction listed in "Step 1." Confirm no long tasks > 50ms.
2. React DevTools Profiler: record; interact. Verify minimal commit work on idle.
3. `npm run build` — bundle size report. Note change from pre-5C baseline.
4. Mobile emulation: record same interactions. Verify 45+ fps.
5. Memory: 2-minute leak test as described.
6. Document baseline numbers in PR description so F3 can cross-reference.
