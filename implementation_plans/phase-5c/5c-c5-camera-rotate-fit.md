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

---

## Shipped implementation notes (2026-04-22)

Record of what actually landed and the decisions made during implementation. Reviewers and future implementers should treat this section as authoritative over the pseudocode in *Implementation guidance* above when they disagree.

### Where the code lives

- **`lib/globe.ts`** owns `computeFitCamera` as a pure, parameter-driven helper. Extracted from `GlobeScene.tsx` so it's unit-testable without a R3F runtime and because the math is independent of any component state. The ticket suggested keeping it local; we chose to extract because the test harness pattern (`aggregatePins` + friends in `lib/globe.ts` with a `lib/globe.test.ts` companion) was already established in Phase 5C.
- **`components/globe/GlobeScene.tsx`** owns the scene-side glue: state refs, the `useEffect` that fires on `lockedTrip` change, the `useFrame` animation branch, and a `kickOffTripFit` `useCallback` that both the effect and the entrance-done handler call. Extracted because the two call sites had duplicated coord-collection + ref-write logic.
- **`lib/globe.test.ts`** covers the 5 branches of `computeFitCamera`: single coord, tight cluster, hemisphere-straddle (→ max), antipodal (→ fallback direction, not NaN), and empty input (→ resting, defensive).

### Fit formula (final form)

The shipped formula is a proper camera-frustum fit — not the ticket's `1/tan` approximation, which had transcription bugs and produced near-binary behavior. Derivation:

> At camera distance `D` from globe center looking at the centroid direction, a pin at angular offset `θ` from the centroid projects to screen half-angle `φ` where `tan(φ) = R · sin(θ) / (D − R · cos(θ))`. Solving for `D` and choosing `φ` so that a hemisphere-spread trip (`θ = π/2`) lands exactly at `maxDistance` yields:
>
> **`D = R · cos(θ) + maxDistance · sin(θ)`**
>
> Clamped to `[minDistance, maxDistance]`.

This is smooth, monotonic, and handles the hemisphere cusp analytically — no separate singularity branch needed. `minDistance` sets the close-up floor for tight clusters; `maxDistance` sets the pulled-back ceiling for globe-spanning trips.

### Evolution of this formula

Three iterations during review:

1. **Ticket pseudocode v1** (never shipped): `rawDistance = 1/tan(α + margin) * RESTING`. The `* RESTING` multiplier was a copy-paste bug inconsistent with the derivation above it. Every trip clamped to max.
2. **Transcription fix** (shipped, then replaced): dropped the multiplier. Near-binary — tight clusters → resting, hemisphere-straddle → max. Morocco '18 at ~6.62, Japan at 6.5, RTW at 13.
3. **Proper frustum fit** (current): replaced the whole `1/tan` approximation with the exact camera-geometry formula. Smooth gradient between `minDistance` and `maxDistance`. Tight clusters clamp to min (close-up feel); mid-spreads grow proportionally; RTW lands exactly at max.

### Distance gradient (final)

With `globeRadius = 2`, `minDistance = 5.5`, `maxDistance = 8.6`:

| Angular spread (from centroid) | Example | Computed D | Clamped D |
|---|---|---|---|
| 0° (single) | Morocco '18 | 2.0 | 5.5 (min) |
| ~2° (cluster) | Japan Spring '22 | ~2.3 | 5.5 (min) |
| 15° | close continental pair | ~4.16 | 5.5 (min) |
| 30° | ~30° continental spread | ~6.03 | 6.03 |
| 45° (hemisphere edge) | — | ~7.49 | 7.49 |
| 60° | — | ~8.45 | 8.45 |
| ≥ 65° | RTW (Tokyo/NYC/Sydney) | 8.6+ | 8.6 (max) |

Japan and single-visit trips clamp to `minDistance ≈ 4.24` (close-up, globe overflows viewport at ~125%). RTW lands at `maxDistance ≈ 8.57` (globe fills ~60% of viewport). The transition through continental and hemispheric spreads is smooth.

### Constants

Everything is derived from four primary inputs — `GLOBE_RADIUS`, `CAMERA_FOV_DEG`, and two viewport-fraction targets — so tuning is a one-place change:

- `GLOBE_RADIUS = 2` — now the **single source of truth** in [`lib/globe.ts`](../../lib/globe.ts). Previously duplicated across `GlobeMesh.tsx`, `GlobePins.tsx`, `GlobePositionBridge.tsx`, and `GlobeScene.tsx` — all four now import it.
- `CAMERA_FOV_DEG = 45` — mirrors the `Canvas` prop in `GlobeCanvas.tsx`. Still a duplication, but a narrow one that lives next to its consumer. If the camera FOV ever changes, update both.
- `TRIP_FIT_MIN_VIEWPORT_FRAC = 1.25` — tight clusters fill 125% of the viewport (intentionally overflow). Derives `TRIP_FIT_MIN_DISTANCE ≈ 4.24`, which has ~0.24 clearance above OrbitControls `minDistance = 4`.
- `TRIP_FIT_MAX_VIEWPORT_FRAC = 0.6` — globe-spanning trips fill 60% of viewport. Derives `TRIP_FIT_MAX_DISTANCE ≈ 8.57`, below OrbitControls `maxDistance = 13` (which stays looser so user wheel-zoom has headroom).

`distanceForViewportFraction(f) = R / sin(f · FOV / 2)` handles the conversion. Both endpoints use the same helper so the symmetry is obvious.

### Invariant: `minDistance < maxDistance`

Enforced implicitly by the choice of constants (5.5 < 8.6). The fit formula is only meaningful when this holds. `OrbitControls maxDistance` stays at 13 (looser) so the user's scroll-wheel has headroom past the trip-fit cap.

### `OrbitControls maxDistance` vs `TRIP_FIT_MAX_DISTANCE`

Two independent caps with different jobs. `OrbitControls maxDistance = 13` is kept looser than `TRIP_FIT_MAX_DISTANCE = 8.6` so the user's scroll-wheel can push past the fit cap if they want to. Invariant: `OrbitControls.maxDistance ≥ TRIP_FIT_MAX_DISTANCE` so the fit animation is never clipped by controls.

### Cold-URL `?trip=` handling

Implemented via a `pendingTripFit` ref. If the `lockedTrip` effect fires *before* the entrance animation completes, we set the pending flag and return. The entrance-done branch inside `useFrame` consumes the flag and calls `kickOffTripFit(lockedTrip)` directly — no extra effect dance, same helper.

This pattern mirrors the existing `pendingArticleZoom` mechanism for cold-URL article loads.

### Article-open guard + `prevLockedTripRef` ordering

The effect returns early when `layoutState === 'article-open'` *without* updating `prevLockedTripRef`. This is intentional: if a user deep-links to `/trip/<slug>/<article>` (article-open while trip is locked) and then closes the article back to `panel-open`, the effect re-fires with the same `lockedTrip` value. Because `prev !== lockedTrip` still holds (we never marked it seen), the fit lands on article close. If you ever want to suppress that re-fit, update `prevLockedTripRef.current = lockedTrip` before returning.

### `kickOffTripFit` shared helper

Both the `useEffect` and the entrance-done consumer inside `useFrame` collect coords from `pins[]` where `v.trip._id === tripId`, compute the fit camera position, and populate `rotateToFitTripRef`. The shared callback is the single place to update if the data model's trip-id key ever moves.

Guards intentionally stay at the call sites (not inside the helper) so each path can express its own preconditions (`entranceDone.current`, `layoutState !== 'article-open'`, `pins` non-empty) without the helper having to read them.

### Duration tuning: 800ms → 1100ms

Spec §17.3 calls for ~800ms. After initial implementation, PR review feedback flagged trip-to-trip transitions as feeling whiplash-y — the abrupt mid-animation peak velocity from `0 → endPos` over 0.8s reads as jerky when the user re-targets quickly between locked trips. Bumped to **1.1s** without changing the quadratic ease-in-out curve (`t < 0.5 ? 2*t² : 1 − (−2t+2)²/2`). The longer runway lowers peak velocity ~27%, which is the knob that actually affects perceived abruptness; the curve shape is fine.

If future polish wants even softer edges (not currently needed), swap to a quintic ease-in-out (`t < 0.5 ? 16*t⁵ : 1 − (−2t+2)⁵/32`) — flatter boundaries, same midpoint.

### Scope left for follow-ups

- **Proper frustum-fit math.** The current near-binary behavior works but isn't a "proper" camera-FOV frustum fit. If a future ticket wants a smooth `distance(spread)` curve — e.g. Japan at resting, Europe slightly pulled back, RTW at max — revisit the derivation using the camera's actual vertical FOV. Out of scope for C5.
- **Pending-flag state machine.** Both `pendingArticleZoom` and `pendingTripFit` are consumed in the same post-entrance block; if a third "pending X on entrance" ever shows up, the interaction matrix grows and a dedicated state machine would be cleaner. Not needed at two.

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
