# 5C-C6 — Trip arcs: great-circle arcs between visits + state-driven appearance

**Epic**: C. Globe & Panels · **Owner**: Dev C · **Can be run by agent?**: Yes (arc math is well-defined) · **Estimated size**: M

## Dependencies

### Hard
- **C1** — reads `trips`, `pins`, `hoveredTrip`, `lockedTrip`, `playbackHighlightedTripIds`.

### Soft
- **B6** — arcs respond to playback highlight, but rendering works in all non-playback states without B6.

### Blocks
- **C7** (arc highlight coordination with pin cross-interactions).

---

## Goal

Render **arcs** connecting visits within a single trip, in chronological order. Always visible as thin muted gray lines at idle; thicken + accent-color on hover/lock/playback-cross. Great-circle geometry (correct spherical interpolation, not flat lines). Preserve render-order band invariants (README §4.3 invariant 2).

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §6.2 Arcs
- §6.3 Arc states
- §17.1 / §17.2 Arc colors (idle + highlighted)
- §17.3 Arc fade in/out timings (400ms)
- §5.10 Overlapping trips (arcs thicken when trip highlighted)

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §6.2, §6.3
- [`../../components/globe/GlobeMesh.tsx`](../../components/globe/GlobeMesh.tsx) — render-order bands; `Line` from drei
- [`../../components/globe/GlobePins.tsx`](../../components/globe/GlobePins.tsx) — pattern for position-ref-driven state
- [`../../lib/globe.ts`](../../lib/globe.ts) — `sphericalToCartesian`
- [README §4.3 invariants 1–3](./README.md#43-invariants-from-the-existing-code-preserve-these)

## Files to create

- `components/globe/TripArcs.tsx` — mounts inside `<Canvas>`, renders all arcs

## Files to modify

- `components/globe/GlobeCanvas.tsx` — mount `<TripArcs />` inside the canvas

## Files to delete

- None.

---

## Implementation guidance

### Data shape

An arc is defined by two visit points within a single trip. For trip A with visits v1, v2, v3 (chronological), arcs = `[(v1, v2), (v2, v3)]`. Repeated location handling (§6.2): "Repeated locations within a single trip (e.g., A → B → A → C): pin A appears once; three distinct arcs drawn between the unique pairs." → actually re-read: "three distinct arcs between the unique pairs" implies the arcs are drawn between consecutive visits, which may revisit locations. Interpret as: arcs follow chronological visit order, but overlapping arcs between same pair render once (dedup).

**Dedup rule**: arcs keyed by sorted pair of locationIds. `key = [min(a.id, b.id), max(a.id, b.id)].join('-')`. Two arcs between the same pair in a trip draw once. Simpler and visually cleaner — matches spec's "A → B → A → C produces 3 distinct arcs".

### Great-circle geometry

```ts
import * as THREE from 'three'

function greatCircleArcPoints(
  startLat: number, startLng: number,
  endLat: number, endLng: number,
  radius: number,
  segments = 32,
): THREE.Vector3[] {
  const startVec = (() => {
    const latRad = (startLat * Math.PI) / 180
    const lngRad = (startLng * Math.PI) / 180
    return new THREE.Vector3(
      -Math.cos(latRad) * Math.cos(lngRad),
      Math.sin(latRad),
      Math.cos(latRad) * Math.sin(lngRad),
    )
  })()
  const endVec = (() => {
    const latRad = (endLat * Math.PI) / 180
    const lngRad = (endLng * Math.PI) / 180
    return new THREE.Vector3(
      -Math.cos(latRad) * Math.cos(lngRad),
      Math.sin(latRad),
      Math.cos(latRad) * Math.sin(lngRad),
    )
  })()

  // Interpolate along the great circle using SLERP on unit vectors.
  const axis = new THREE.Vector3().crossVectors(startVec, endVec).normalize()
  const angle = startVec.angleTo(endVec)
  if (axis.lengthSq() < 1e-6 || angle < 1e-6) {
    // Degenerate: same or antipodal points. Return a straight line.
    return [startVec.clone().multiplyScalar(radius), endVec.clone().multiplyScalar(radius)]
  }

  const points: THREE.Vector3[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle * t)
    const p = startVec.clone().applyQuaternion(q).multiplyScalar(radius)
    points.push(p)
  }
  return points
}
```

Use radius slightly above the globe surface so arcs don't z-fight with wireframe. `GLOBE_RADIUS + 0.005` equivalent (borrow the `SURFACE_OFFSET` concept from `GlobePins.tsx`).

### `TripArcs.tsx`

```tsx
'use client'

import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { useGlobe } from './GlobeContext'

const GLOBE_RADIUS = 2
const ARC_SURFACE_OFFSET = 0.01
const ARC_SEGMENTS = 32

interface ArcData {
  tripId: string
  key: string  // sorted-pair key for dedup
  points: THREE.Vector3[]
}

export default function TripArcs() {
  const { tripsWithVisits, hoveredTrip, lockedTrip, playbackHighlightedTripIds, isDark } = useGlobe()

  // Precompute arc geometry. Re-runs when tripsWithVisits changes.
  const arcs: ArcData[] = useMemo(() => {
    const result: ArcData[] = []
    for (const trip of tripsWithVisits) {
      const seen = new Set<string>()
      for (let i = 0; i < trip.visits.length - 1; i++) {
        const a = trip.visits[i].location
        const b = trip.visits[i + 1].location
        const pair = [a._id, b._id].sort().join('|')
        if (seen.has(pair)) continue
        seen.add(pair)
        const points = greatCircleArcPoints(
          a.coordinates.lat, a.coordinates.lng,
          b.coordinates.lat, b.coordinates.lng,
          GLOBE_RADIUS + ARC_SURFACE_OFFSET,
          ARC_SEGMENTS,
        )
        result.push({ tripId: trip._id, key: `${trip._id}:${pair}`, points })
      }
    }
    return result
  }, [tripsWithVisits])

  const accentColor = /* from CSS var, or hardcoded */ '#2563eb'
  const idleColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'

  return (
    <group renderOrder={0}>
      {arcs.map((arc) => {
        const isHighlighted =
          hoveredTrip === arc.tripId ||
          lockedTrip === arc.tripId ||
          playbackHighlightedTripIds.includes(arc.tripId)
        const isLocked = lockedTrip === arc.tripId

        return (
          <ArcLine
            key={arc.key}
            points={arc.points}
            idleColor={idleColor}
            accentColor={accentColor}
            isHighlighted={isHighlighted}
            isLocked={isLocked}
          />
        )
      })}
    </group>
  )
}

interface ArcLineProps {
  points: THREE.Vector3[]
  idleColor: string
  accentColor: string
  isHighlighted: boolean
  isLocked: boolean
}

function ArcLine({ points, idleColor, accentColor, isHighlighted, isLocked }: ArcLineProps) {
  // Driven via imperative material updates — avoids React reconciling the
  // `<Line>` prop tree every frame.
  const lineRef = useRef<any>(null)
  const currentOpacity = useRef(isHighlighted ? 1 : 0.15)
  const currentColor = useRef(isHighlighted ? accentColor : idleColor)
  const currentWidth = useRef(isHighlighted ? 2.5 : 1.5)

  useFrame(({ clock }) => {
    if (!lineRef.current) return
    const mat = lineRef.current.material

    // Smoothly ease toward target values (400ms for fade, per §17.3).
    const targetOpacity = isHighlighted ? 1 : 0.15
    const targetColor = isHighlighted ? accentColor : idleColor
    const targetWidth = isHighlighted ? 2.5 : 1.5

    const k = 0.08  // ~16fps lerp = ~250ms to close ~95% of gap. Close enough to 400ms.
    currentOpacity.current += (targetOpacity - currentOpacity.current) * k
    currentWidth.current += (targetWidth - currentWidth.current) * k

    // Pulse when locked (2s period, §17.3)
    if (isLocked) {
      const pulse = 0.2 * Math.sin(clock.elapsedTime * Math.PI)  // 2s period → omega = π
      currentOpacity.current = Math.min(1, 0.8 + pulse)
    }

    mat.opacity = currentOpacity.current
    if (mat.color && mat.color.set) mat.color.set(targetColor)
    if ('linewidth' in mat) mat.linewidth = currentWidth.current
  })

  return (
    <Line
      ref={lineRef}
      points={points}
      lineWidth={1.5}
      color={idleColor}
      transparent
      depthWrite={false}
    />
  )
}

function greatCircleArcPoints(/* ... see above ... */): THREE.Vector3[] { /* ... */ }
```

### Mount inside canvas

```tsx
// GlobeCanvas.tsx
import TripArcs from './TripArcs'

// Inside <Canvas>:
<GlobeScene />
<GlobeMesh />
<GlobePins />
<TripArcs />  {/* new */}
<GlobePositionBridge />
```

### Render-order band discipline

`renderOrder={0}` on the `<group>`: same as wireframe + country borders (default band). This means:
- Back-hemisphere arcs get depth-culled by the depth-only occluder at render-order `-2`. ✓
- Pin dots (render-order `-1`) paint before arcs. Arcs should appear **on top of** pin dots visually when overlapping, but spec's aesthetic is "lines on top of dots." Re-read invariant 2:

> `-1`: pin dots + rings (transparent, no depth write)  
> `0` (default): wireframe + country borders + **arcs** (new — transparent, default band)

"Lines always paint after pins, so map detail reads through every dot." Arcs, being lines in the default band, paint after dots. Correct.

### Overlapping trips (§5.10)

If playhead is in a region where two trips overlap, both trips' arcs highlight. Same color (accent). Visual overlap of arcs on the globe is acceptable — no disambiguation needed. Confirm via fixture: SF Q4 '23 + Seattle Q4 '23 in overlap — those pins are across the US, arcs visible.

Actually — single-visit trips have no arcs (§6.2 "Single-visit trips: no arc"). SF Q4 '23 and Seattle Q4 '23 are both single-visit fixtures per A4. They don't generate arcs. For arc-overlap testing, need a fixture with overlapping multi-visit trips. Add one to A4 if not present, or skip this specific verification.

### `data-no-skeleton` on arcs

Arcs are 3D canvas elements, not DOM. Boneyard operates on DOM, so `data-no-skeleton` attributes don't apply. No action here.

---

## Acceptance criteria

- [ ] Multi-visit trips (Japan Spring '22) render arcs: Tokyo → Kyoto, Kyoto → Osaka.
- [ ] Arcs are thin muted gray at idle.
- [ ] Repeated-location trip (if a fixture has A → B → A → C): renders 3 distinct arcs between unique pairs (A-B, B-A [dedup'd], A-C) — effectively 2 unique arcs after dedup. Confirmed via `seen` Set.
- [ ] Hovering a trip's timeline label: that trip's arcs thicken + turn accent color. Revert on hover end.
- [ ] Locking a trip: arcs stay accent-colored + slow pulse (2s period, visible breathing).
- [ ] When playback enters a trip's time range: arcs fade in to accent over ~400ms. Fade out on exit.
- [ ] Back-hemisphere arcs not visible (depth-occluded by the depth-only globe mesh).
- [ ] No per-frame THREE.Vector3 allocations (scratch vectors or memoized points).
- [ ] No React re-renders during arc animation (verify via Profiler during lock pulse).
- [ ] Single-visit trips render no arcs.

## Non-goals

- **No arrowheads / gradient / directional indicator** — spec §6.2 "non-directional."
- **No per-trip color distinction** — single highlight color.
- **No arc interaction (clicking an arc)** — not in spec.
- **No arc rendering on mobile** — wait, actually arcs render on all devices (§6.2 says "Always visible"). Fine — render on all.

## Gotchas

- **`@react-three/drei` `<Line>` component**: uses `MeshLine` or similar under the hood; `linewidth` may not apply on all platforms (WebGL line width is capped to 1 on most GPUs). If `lineWidth` prop doesn't visibly change thickness between 1.5 and 2.5, investigate:
  - drei's `<Line>` uses `three-stdlib`'s LineMaterial which supports thick lines via a custom shader. Should work. If not, fall back to `tube geometry` or `MeshLine` directly.

- **Color property on drei's Line material**: depends on the underlying material. `mat.color.set('#hex')` works for `LineBasicMaterial`. For `LineMaterial` (from stdlib), check the prop name.

- **Performance with 100+ arcs**: each arc is a line with 33 points. 100 arcs × 33 = 3300 vertices total — trivial for WebGL. The per-frame `useFrame` work is the concern. Each ArcLine runs a tick with trivial math. 100 arcs × 60fps = 6k math-ops/s. Fine.

  BUT: 100 `<ArcLine>` components = 100 React components each with a `useFrame`. R3F registers each via `useFrame` — that's 100 entries in R3F's frame callback list per frame. Still fine for reasonable counts. If F2 profiling shows it as a hotspot, flatten to a single `<Group>` with all arcs and one `useFrame`.

- **Accent color source**: spec §17 defers concrete hex. Using `#2563eb` as a default. Define as a Tailwind custom property in `globals.css` so it matches timeline segment highlight.

- **Pulse math**: `Math.sin(clock.elapsedTime * Math.PI)` gives a 2-second period. Verify visually — should feel like slow breathing, not frantic.

- **Fade interaction with pulse**: when locked, opacity is `0.8 + 0.2 × sin(...)`. When not locked but highlighted (hovered or playback), opacity is `1`. When idle, `0.15`. The lerp from idle → highlighted happens at `k = 0.08` per frame → ~4 frames to reach 50% → ~66ms. Fast enough to feel instant. Spec §17.3 says 400ms for playback fade-in; the lerp is faster than spec. If noticeable, slow `k`.

- **`tripsWithVisits` dependency**: if C4 didn't add `tripsWithVisits` to context, arcs can't be computed. Coordinate with C4/C1.

## Ambiguities requiring clarification before starting

1. **Dedup vs explicit repeats**: spec §6.2 "A → B → A → C: ... three distinct arcs drawn between the unique pairs." Reading carefully: A→B, B→A, A→C are three ordered pairs but the middle pair is the same unordered pair as the first. "Unique pairs" suggests dedup.

   Defaulting to unordered-pair dedup. If reviewer wants every visit transition drawn, remove the `seen` Set.

   **Action**: dedup by unordered pair. Document in PR.

2. **Arc surface offset** (`0.01` vs larger): too small → z-fights with wireframe. Too large → arcs appear floating. 0.01 works visually. Tune if needed.

3. **Lerp rate `k = 0.08`**: faster than spec's 400ms. If spec'd timing is load-bearing, use an explicit elapsed-time timer per arc instead of lerp. Costlier but precise. Start with lerp; profile and switch if reviewer flags.

4. **Arc thickness when hovered vs locked vs playback**: all three states use `2.5`. Spec §6.3 shows same "thicker, highlight color" for preview / locked / playback. Locked adds pulse. Good.

## Handoff / outputs consumed by later tickets

- `TripArcs` component is self-contained. C7 reads `lockedTrip` to coordinate; no direct API surface.
- `tripsWithVisits` on context — required; confirm C1/C4 added it.

## How to verify

1. `/globe` — see arcs between Tokyo/Kyoto/Osaka (Japan Spring '22) and Tokyo/NY/Sydney (Round-the-World).
2. Arcs thin muted gray at idle.
3. Hover Japan Spring '22 timeline label — arcs thicken + turn accent. Hover off — revert.
4. Click Japan Spring '22 — arcs stay accent + pulse (2s period visible).
5. Wait for playback to sweep into Japan Spring '22 time range — arcs fade in to accent over ~400ms. Fade out on exit.
6. Rotate globe so Japan pins go behind — their arcs hide (depth occlusion working).
7. DevTools Performance tab: record 10s. Arc rendering should have no significant CPU contribution.
8. React Profiler: no Timeline or panel re-renders when arc colors transition.
