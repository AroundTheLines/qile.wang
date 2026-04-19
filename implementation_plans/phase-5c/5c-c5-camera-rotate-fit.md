# 5C-C5 — Camera rotate-to-fit trip on lock; drag-during-lock

**Epic**: C. Globe & Panels · **Owner**: Dev C · **Can be run by agent?**: Partial — fit-to-bounds math benefits from human visual review · **Estimated size**: M

## Dependencies

### Hard
- **C1** — `lockedTrip` state.

### Soft
- **C4** — trip panel exposes the UI trigger; without C4 you can still test via DevTools.

### Blocks
- **F2** (performance pass assumes camera animations settled).

---

## Goal

When a trip is locked, the globe camera rotates to **fit all of that trip's visits** into the viewport. Similar to the existing pin-click rotation, but framing multiple points instead of one. Caps at ~40% of the globe visible (spec §16 Q4) so intercontinental trips don't zoom out absurdly. Also: manual drag while locked takes over — camera stays wherever the user leaves it.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §5.9 Camera during playback
- §9.1 (click-lock row)
- §9.3 (globe surface interactions, esp. "click-drag while trip is locked")
- §16 Open question 4 (zoom cap)
- §17.3 Animation timings (~800ms cinematic for trip fit; ~500ms snappy for pin)

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §5.9, §9.3
- [`../../components/globe/GlobeScene.tsx`](../../components/globe/GlobeScene.tsx) — current rotate/zoom logic; diff target
- [`../../lib/globe.ts`](../../lib/globe.ts) — `sphericalToCartesian`

## Files to create

- None.

## Files to modify

- `components/globe/GlobeScene.tsx` — add `rotateToFitTripRef` state + handler

## Files to delete

- None.

---

## Implementation guidance

### Prior art

`GlobeScene.tsx` already has:
- `rotateRef` — rotates camera to a single pin on selection.
- `articleZoomRef` — zooms into sliver view.

Pattern: use a state-like ref that stores `{ active, elapsed, startPos, endPos, duration }`, driven by the single `useFrame` tick. Add a third: `rotateToFitTripRef`.

### Fit-to-bounds math

Given visits of a locked trip:

```ts
function computeFitCamera(
  visits: { coordinates: Coordinates }[],
  currentDistance: number,
): THREE.Vector3 {
  // 1. Convert each visit to a unit vector on the globe surface.
  const vectors = visits.map((v) => {
    const [x, y, z] = sphericalToCartesian(v.coordinates.lat, v.coordinates.lng, 1)
    return new THREE.Vector3(x, y, z)
  })

  // 2. Centroid (average + normalize).
  const centroid = new THREE.Vector3()
  for (const v of vectors) centroid.add(v)
  centroid.normalize()

  // 3. Max angular spread — the largest angle from centroid to any visit.
  let maxAngle = 0
  for (const v of vectors) {
    const a = centroid.angleTo(v)
    if (a > maxAngle) maxAngle = a
  }

  // 4. Fit distance: the camera must be far enough that all pins fit in the frustum.
  //    We want ~40% of the globe visible at max spread per §16 Q4.
  //    Rough heuristic: if maxAngle is π/2 (90° — opposite sides of globe),
  //    globe looks half-full from any distance. Cap zoom-out.
  //    Derivation: for a camera looking at origin at distance d, the half-FOV
  //    angle is θ = atan(R/d) where R=1 (unit sphere). A spread of α radians
  //    between pins means we want θ ≈ α + margin. So d = R / tan(α + margin).
  const MARGIN = 0.15  // radians, ~8.5° padding
  const FIT_FOV = maxAngle + MARGIN
  const rawDistance = 1 / Math.tan(FIT_FOV)

  // Clamp to [RESTING_DISTANCE, 2 * RESTING_DISTANCE] so cramped trips don't
  // pull camera in and globe-spanning trips cap at ~40% visible.
  const RESTING = 6.5  // match existing GlobeScene constant
  const MAX_FIT_DISTANCE = RESTING * 2  // corresponds roughly to "40% of globe visible"
  const distance = Math.min(MAX_FIT_DISTANCE, Math.max(RESTING, rawDistance * RESTING))

  // 5. Camera sits along the centroid direction at the computed distance.
  return centroid.clone().multiplyScalar(distance)
}
```

**Note**: the "40% visible" cap is a qualitative tuning knob. Actual implementation uses `MAX_FIT_DISTANCE = 2 × RESTING`. Adjust by eyeballing against the Round-the-World fixture (Tokyo + NYC + Sydney).

### `GlobeScene.tsx` additions

```tsx
// Near existing refs:
const rotateToFitTripRef = useRef<RotateState & { duration: number }>({
  active: false,
  elapsed: 0,
  startPos: new THREE.Vector3(),
  endPos: new THREE.Vector3(),
  duration: 0.8,  // ~800ms cinematic per §17.3
})

const { pins, selectedPin, lockedTrip, layoutState, isMobile } = useGlobe()

// Effect: trigger rotate-to-fit when lockedTrip changes.
const prevLockedTripRef = useRef<string | null>(null)
useEffect(() => {
  const prev = prevLockedTripRef.current
  prevLockedTripRef.current = lockedTrip

  if (!lockedTrip || prev === lockedTrip) return
  if (!entranceDone.current) return
  // Don't rotate if article is open — different camera state owns it.
  if (layoutState === 'article-open') return

  // Find all visits for this trip. Collect their locations via pins[].visits.
  const visits = pins.flatMap((p) => p.visits).filter((v) => v.trip._id === lockedTrip)
  if (visits.length === 0) return

  const currentDistance = camera.position.length()
  const endPos = computeFitCamera(visits.map((v) => ({ coordinates: v.location.coordinates })), currentDistance)

  rotateToFitTripRef.current = {
    active: true,
    elapsed: 0,
    startPos: camera.position.clone(),
    endPos,
    duration: 0.8,
  }
  setControlsEnabled(false)
}, [lockedTrip, pins, layoutState, camera])

// When lockedTrip clears: DO NOT animate back. Camera stays where it is (§9.3).
// Re-enable manual controls.
useEffect(() => {
  if (lockedTrip === null && entranceDone.current && layoutState !== 'article-open') {
    setControlsEnabled(true)
  }
}, [lockedTrip, layoutState])

// Inside the single useFrame — add rotate-to-fit-trip handling alongside existing rotate/zoom.
useFrame((_, delta) => {
  // (entrance handling — unchanged)
  // ...
  // (pin-switch rotate — unchanged)
  // ...
  // (article zoom — unchanged)
  // ...

  // NEW: rotate-to-fit-trip
  const rot2 = rotateToFitTripRef.current
  if (rot2.active) {
    rot2.elapsed += delta
    const t = Math.min(rot2.elapsed / rot2.duration, 1)
    // ease-in-out per §17.3 cinematic
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    camera.position.lerpVectors(rot2.startPos, rot2.endPos, eased)
    camera.lookAt(0, 0, 0)

    if (t >= 1) {
      rot2.active = false
      // Do NOT re-enable controls automatically — user may drag to take over
      // per §9.3. Controls stay off until the user interacts or lockedTrip clears.
      // Actually — re-enable so the user CAN drag. The drag-takes-over behavior
      // is implicit: user drags, OrbitControls applies, we don't re-center.
      setControlsEnabled(true)
    }
  }
})
```

Wait — the effect at the top already sets `setControlsEnabled(false)` during the animation. After animation ends, we re-enable controls so the user can drag. Spec §9.3 says "drag while locked: camera moves freely where the user drags. On release, camera stays where it was dragged — the 'fit to visits' framing is not restored." That matches: after animation, controls re-enable; user drags → camera moves; we don't snap back.

### Single-visit trip

If a trip has exactly one visit, the fit-to-bounds reduces to a single pin rotation. Use the same math — `maxAngle = 0`, `rawDistance` is tiny so clamped to `RESTING`. Camera lands along the pin's outward normal at resting distance. Equivalent to the existing pin-rotate feel.

Alternative: explicitly reuse the `rotateRef` pin-rotate pipeline for single-visit trips. Simpler, same outcome. Choice: single code path via `computeFitCamera` — works for any count, single or many.

### Collision with pin-select effect

Both `rotateRef` (pin click) and `rotateToFitTripRef` (trip lock) write to camera.position. If both fire in the same tick, last write wins (whichever runs second in `useFrame`).

Precedence rule: **pin-click wins over trip-lock** if they fire simultaneously (e.g., user clicks a pin within a locked trip). C7 clarifies: pin-click-within-locked-trip does NOT rotate (panel scrolls instead). So the rotate effect should guard:

```tsx
// Pin rotate effect — existing code
useEffect(() => {
  // ... existing checks ...
  // ADD: skip if this pin is within the locked trip (C7 scope).
  if (lockedTrip && pin?.tripIds.includes(lockedTrip)) return
  // ...
}, [selectedPin, pins, lockedTrip])  // add lockedTrip dep
```

Finding whether a pin belongs to the locked trip: `pin.tripIds.includes(lockedTrip)` where `pin = pins.find(p => p.location._id === selectedPin)`.

This guard lives in GlobeScene's existing pin-rotate effect. Coordinate with C7.

---

## Acceptance criteria

- [ ] Locking a single-visit trip (Morocco '18): camera rotates to Marrakech, lands at resting distance. Feels similar to pin-click.
- [ ] Locking a multi-visit trip (Japan Spring '22): camera rotates to frame Tokyo + Kyoto + Osaka. All three pins visible.
- [ ] Locking a globe-spanning trip (Round-the-World): camera pulls back but capped at ~2× resting distance. Globe ~40% visible.
- [ ] Animation duration ~800ms, ease-in-out.
- [ ] During animation: OrbitControls disabled (user can't interfere).
- [ ] After animation: OrbitControls re-enabled. User can drag globe; camera moves where dragged.
- [ ] Unlocking trip (close X or click another label): controls stay enabled. Camera stays where it is — no snap-back.
- [ ] Clicking a pin inside the locked trip: does NOT trigger rotate-to-fit (C7 owns the "scroll panel" behavior instead).
- [ ] Clicking a pin outside the locked trip: trip unlocks, pin-click rotation happens (standard behavior).
- [ ] No conflict with the article-zoom animation: locking a trip while article is open does nothing until article closes.

## Non-goals

- **No playback-driven camera motion** — §5.9 "Playback does not drive the camera." Camera remains passive during playback sweep.
- **No passive-spin-during-lock change** — locked trip already halts passive spin per §5.9. Existing autoRotate guard (`layoutState === 'default'`) handles it.
- **No visual indicator that camera can be dragged during lock** — spec doesn't require one.

## Gotchas

- **`rotateToFitTripRef` vs `rotateRef`**: two separate refs, driven by the same `useFrame`. Order matters — rotate-to-fit runs after pin-switch in the frame loop. If both are active the later write overwrites. Guard at effect level (skip pin rotate when pin is in locked trip).
- **`entranceDone.current` guard**: if trip is locked via cold URL load, the entrance animation is mid-flight. Don't start rotate-to-fit until entrance finishes. Existing `if (!entranceDone.current) return` in effects preserves this.
- **Camera distance during lock**: user scroll-wheel zoom changes distance mid-lock. Fit math uses `currentDistance` for proportional math. But we compute `endPos` with its own distance. OK — camera teleports to fit distance, user can zoom from there.
- **`computeFitCamera`** pure function, no THREE globals — keep as a local helper. Or extract to `lib/globe.ts` if reusable. For now keep local.
- **MaxAngle numerical stability**: if all visits are at the same location (degenerate multi-visit), `maxAngle = 0` and `rawDistance = 1/tan(MARGIN) ≈ 6.6`. Close to resting. OK.
- **Centroid at globe-antipode visits**: two visits on exact opposite sides of the globe → centroid is near zero vector → `normalize()` returns `(NaN, NaN, NaN)`. Guard: if `centroid.lengthSq() < 1e-6`, pick an arbitrary direction (e.g., average lat/lng). Unlikely in practice but possible.

## Ambiguities requiring clarification before starting

1. **Fit distance cap**: "40% of globe visible" is qualitative. I'm using `MAX_FIT_DISTANCE = 2 × RESTING = 13`. Verify visually with Round-the-World fixture. If too zoomed-out or too-close, tune the 2x.

   **Action**: ship 2x, tune via PR review.

2. **Single-visit trip handling**: reusing `computeFitCamera` gives identical behavior to the existing `rotateRef` pin-rotate. If a reviewer wants different feel for "single-visit trip lock" vs "pin click" (e.g., different speed), add a branch. Default: same pipeline, 800ms duration (vs pin-rotate's 300ms). Noticeable difference, spec-aligned (§17.3 cinematic for trip lock, snappy for pin click).

   **Action**: use rotate-to-fit pipeline for all locks. Document as "intentionally slower than pin click."

3. **What if `pins` hasn't hydrated when lock fires**: cold URL load with `/globe?trip=<slug>` — `lockedTrip` is set but pins still fetching. The effect reads `pins.flatMap(...)` — if empty, `visits.length === 0` → skip. Good. Once pins arrive, the effect re-runs (dep array includes pins) — rotate fires.

4. **Camera during drag-while-locked**: `OrbitControls` takes over. On release, we don't restore fit. Spec §9.3 confirms. No action needed.

## Handoff / outputs consumed by later tickets

- C7 reads `pin.tripIds` to decide whether to trigger rotate or scroll panel. Confirm the pin-rotate-guard is in place.
- None other.

## How to verify

1. `/globe` — click Japan Spring '22 timeline label.
2. Camera animates over ~800ms to frame Tokyo, Kyoto, Osaka. All three pins visible simultaneously.
3. Drag globe during lock — camera moves freely. Release — stays where dragged.
4. Click another trip label — new rotate-to-fit fires. Previous lock releases cleanly.
5. Click a pin inside the locked trip (e.g., Tokyo pin while Japan '22 is locked) — no rotate. Panel behavior takes over (requires C7).
6. Click a pin outside the locked trip (e.g., Berlin pin while Japan '22 is locked) — trip unlocks, camera rotates to Berlin (standard pin-rotate).
7. Lock Round-the-World — globe zooms out; all three far-apart pins visible but globe doesn't shrink to a dot.
8. Lock Morocco '18 (single visit) — camera rotates to Marrakech at resting distance. Feel similar to pin click.
9. Cold URL test: navigate to `/globe?trip=berlin-2022`. Page loads, entrance animation plays, then rotate-to-fit fires for Berlin.
