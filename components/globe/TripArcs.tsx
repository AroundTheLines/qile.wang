'use client'

import { memo, useEffect, useMemo, useRef, type Ref } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { useGlobeData, useGlobeTrip, useGlobePlayback, useGlobeUI } from './GlobeContext'
import { GLOBE_RADIUS, greatCircleArcPoints as greatCircleArcCoords } from '@/lib/globe'
import { useReducedMotion } from '@/lib/useReducedMotion'

const ARC_SURFACE_OFFSET = 0.01

const RENDER_ORDER_ARC = 0

const ACCENT_COLOR = '#2563eb'
const IDLE_COLOR_LIGHT = '#000000'
const IDLE_COLOR_DARK = '#ffffff'

// Base layer — always visible, never animated out. Tells the reader where
// each trip goes at a glance.
const BASE_OPACITY_INACTIVE = 0.15
// Active trips brighten the base so the path is still clearly readable in
// the gaps between overlay sweeps — otherwise the only cue for "which line
// is being animated" disappears while the comet is off-screen. The active
// base also matches the overlay's width and tints toward accent (at a much
// lower blend than the overlay) so the whole arc reads as one family.
const BASE_OPACITY_ACTIVE = 0.5
const BASE_WIDTH_INACTIVE = 1.5
const BASE_WIDTH_ACTIVE = 2.5
const BASE_ACTIVE_ACCENT_BLEND = 0.35

// Overlay layer — the comet highlight. Brighter than the base so the
// traversal reads clearly, but when inactive it's still muted enough to
// stay ambient rather than distracting.
// Inactive overlay sits just a hair brighter than the base so the traversal
// reads as a faint shimmer rather than a second, competing line. Keeping it
// close in value to the base (0.15) is intentional — active trips should own
// the viewer's attention.
const OVERLAY_INACTIVE_OPACITY = 0.18
const OVERLAY_ACTIVE_OPACITY = 1
const OVERLAY_INACTIVE_WIDTH = 1.5
const OVERLAY_ACTIVE_WIDTH = 2.5

const TWEEN_RATE = 6

// Trip traversal animation. Head first draws start → end, then tail follows
// the head, shrinking the visible length until the line disappears. A short
// pause at full length between the two phases and a rest at the end give
// each loop a breathing rhythm.
//
// Active trips: traversal runs at `ACTIVE_SECONDS_PER_ARC` per arc for each
// of the two phases. Inactive trips run `INACTIVE_SLOWDOWN` × slower so the
// ambient motion on dim lines is subdued enough to not distract. Each trip
// also gets a deterministic phase offset so different trips are never in
// lockstep — visually, the globe feels alive without drumbeat sync.
const ACTIVE_SECONDS_PER_ARC = 5
const INACTIVE_SLOWDOWN = 3
const TRIP_PAUSE_FRAC = 0.02 // tiny hold at full length before retract
const TRIP_REST_FRAC = 0.02 // tiny rest before the next draw begins

interface ArcData {
  tripId: string
  key: string
  points: THREE.Vector3[]
  arcIndex: number
  tripArcCount: number
  /** Deterministic phase offset ∈ [0, 1) so parallel trips desync. */
  tripPhaseOffset: number
  /** Sum of segment lengths; feeds the dashed-line shader so dashSize and
      dashOffset can be expressed in world units. */
  arcTotalLength: number
}

function greatCircleArcPoints(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  radius: number,
): THREE.Vector3[] {
  return greatCircleArcCoords(startLat, startLng, endLat, endLng, radius).map(
    ([x, y, z]) => new THREE.Vector3(x, y, z),
  )
}

function totalPolylineLength(points: THREE.Vector3[]): number {
  let acc = 0
  for (let i = 1; i < points.length; i++) {
    acc += points[i].distanceTo(points[i - 1])
  }
  return acc
}

function smoothstep01(x: number): number {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

interface ArcLineProps {
  points: THREE.Vector3[]
  idleColor: string
  isHighlighted: boolean
  isLocked: boolean
  arcIndex: number
  tripArcCount: number
  tripPhaseOffset: number
  arcTotalLength: number
  reducedMotion: boolean
}

// drei's <Line> exposes a Line2 whose material is a LineMaterial (from
// three-stdlib) with color / opacity / linewidth / dash uniforms. The union
// below lets us touch those uniforms without pulling three-stdlib types in.
type LineMat = THREE.Material & {
  color?: THREE.Color
  opacity: number
  linewidth?: number
  transparent: boolean
  dashSize?: number
  gapSize?: number
  dashOffset?: number
  dashScale?: number
}
type LineRef = THREE.Object3D & { material: LineMat }

function ArcLine({
  points,
  idleColor,
  isHighlighted,
  isLocked,
  arcIndex,
  tripArcCount,
  tripPhaseOffset,
  arcTotalLength,
  reducedMotion,
}: ArcLineProps) {
  const baseRef = useRef<LineRef>(null)
  const baseOpacity = useRef(
    isHighlighted ? BASE_OPACITY_ACTIVE : BASE_OPACITY_INACTIVE,
  )
  const baseWidth = useRef(
    isHighlighted ? BASE_WIDTH_ACTIVE : BASE_WIDTH_INACTIVE,
  )
  const baseColorBlend = useRef(isHighlighted ? BASE_ACTIVE_ACCENT_BLEND : 0)
  const baseScratchColor = useRef(new THREE.Color())
  const overlayRef = useRef<LineRef>(null)
  const overlayOpacity = useRef(
    isHighlighted ? OVERLAY_ACTIVE_OPACITY : OVERLAY_INACTIVE_OPACITY,
  )
  const overlayWidth = useRef(
    isHighlighted ? OVERLAY_ACTIVE_WIDTH : OVERLAY_INACTIVE_WIDTH,
  )
  const colorBlend = useRef(isHighlighted ? 1 : 0)
  const scratchColor = useRef(new THREE.Color())
  const idleColorObj = useRef(new THREE.Color(idleColor))
  const accentColorObj = useRef(new THREE.Color(ACCENT_COLOR))

  // Theme toggle reactivity — re-seed the stored idle color so live
  // dark/light switches repaint arcs on the next frame. Without this the
  // tween lerps from a stale source color until the component remounts.
  useEffect(() => {
    idleColorObj.current.set(idleColor)
  }, [idleColor])

  // Draw phase + hold + retract phase + rest — two equal-length symmetric
  // phases with a brief pause at the top and a rest at the bottom.
  const drawFrac = (1 - TRIP_PAUSE_FRAC - TRIP_REST_FRAC) / 2
  const retractStart = drawFrac + TRIP_PAUSE_FRAC
  const retractEnd = retractStart + drawFrac

  const activePeriod = ACTIVE_SECONDS_PER_ARC * 2 * tripArcCount
  const inactivePeriod = activePeriod * INACTIVE_SLOWDOWN

  useFrame(({ clock }, delta) => {
    const obj = overlayRef.current
    if (!obj) return
    const mat = obj.material

    // prefers-reduced-motion: freeze the comet. Highlighted trips show the
    // overlay at full length statically; non-highlighted trips hide it so
    // only the static base layer reads.
    const period = isHighlighted ? activePeriod : inactivePeriod
    const t = reducedMotion
      ? 0
      : ((clock.elapsedTime + tripPhaseOffset * period) % period) / period

    let tripHead: number
    let tripTail: number
    if (reducedMotion) {
      tripHead = isHighlighted ? 1 : 0
      tripTail = 0
    } else if (t < drawFrac) {
      tripHead = smoothstep01(t / drawFrac)
      tripTail = 0
    } else if (t < retractStart) {
      tripHead = 1
      tripTail = 0
    } else if (t < retractEnd) {
      tripHead = 1
      tripTail = smoothstep01((t - retractStart) / drawFrac)
    } else {
      tripHead = 0
      tripTail = 0
    }

    const k = Math.min(1, delta * TWEEN_RATE)
    const targetOpacity = isHighlighted
      ? OVERLAY_ACTIVE_OPACITY
      : OVERLAY_INACTIVE_OPACITY
    const targetWidth = isHighlighted
      ? OVERLAY_ACTIVE_WIDTH
      : OVERLAY_INACTIVE_WIDTH
    const targetBlend = isHighlighted ? 1 : 0

    overlayOpacity.current += (targetOpacity - overlayOpacity.current) * k
    overlayWidth.current += (targetWidth - overlayWidth.current) * k
    colorBlend.current += (targetBlend - colorBlend.current) * k

    // Tween the base line's opacity, width, and color-blend — brighter,
    // slightly wider, and slightly accent-tinted when its trip is
    // highlighted so the path stays locatable during the gap between
    // overlay sweeps and reads as part of the same visual family as the
    // active overlay.
    const targetBaseOpacity = isHighlighted
      ? BASE_OPACITY_ACTIVE
      : BASE_OPACITY_INACTIVE
    const targetBaseWidth = isHighlighted
      ? BASE_WIDTH_ACTIVE
      : BASE_WIDTH_INACTIVE
    const targetBaseBlend = isHighlighted ? BASE_ACTIVE_ACCENT_BLEND : 0
    baseOpacity.current += (targetBaseOpacity - baseOpacity.current) * k
    baseWidth.current += (targetBaseWidth - baseWidth.current) * k
    baseColorBlend.current += (targetBaseBlend - baseColorBlend.current) * k
    const baseObj = baseRef.current
    if (baseObj) {
      const baseMat = baseObj.material
      baseMat.opacity = baseOpacity.current
      if ('linewidth' in baseMat && typeof baseMat.linewidth === 'number') {
        baseMat.linewidth = baseWidth.current
      }
      if (baseMat.color) {
        baseScratchColor.current
          .copy(idleColorObj.current)
          .lerp(accentColorObj.current, baseColorBlend.current)
        baseMat.color.copy(baseScratchColor.current)
      }
    }

    let finalOpacity = overlayOpacity.current
    if (isLocked && !reducedMotion) {
      const breath = 0.1 * Math.sin(clock.elapsedTime * Math.PI)
      finalOpacity = Math.min(1, 0.85 + breath)
    }
    mat.transparent = true

    if (mat.color) {
      scratchColor.current
        .copy(idleColorObj.current)
        .lerp(accentColorObj.current, colorBlend.current)
      mat.color.copy(scratchColor.current)
    }
    if ('linewidth' in mat && typeof mat.linewidth === 'number') {
      mat.linewidth = overlayWidth.current
    }

    const arcSpan = 1 / tripArcCount
    const arcStart = arcIndex * arcSpan
    const localHead = Math.min(1, Math.max(0, (tripHead - arcStart) / arcSpan))
    const localTail = Math.min(1, Math.max(0, (tripTail - arcStart) / arcSpan))

    const visibleFrac = Math.max(0, localHead - localTail)
    if (visibleFrac <= 0) {
      // Overlay invisible between cycles; the base line underneath still
      // shows the full trip path so the arc never blanks out.
      mat.opacity = 0
      if (mat.dashSize != null) mat.dashSize = 0.0001
      if (mat.gapSize != null) mat.gapSize = arcTotalLength * 4
      if (mat.dashOffset != null) mat.dashOffset = -arcTotalLength * 4
      return
    }

    mat.opacity = finalOpacity
    if (mat.dashSize != null) mat.dashSize = visibleFrac * arcTotalLength
    if (mat.gapSize != null) mat.gapSize = arcTotalLength * 4
    if (mat.dashOffset != null) mat.dashOffset = -localTail * arcTotalLength
  })

  return (
    <>
      {/* Base layer — always visible; brightens when its trip is highlighted
          so the path remains legible in the gaps between overlay sweeps. */}
      <Line
        ref={baseRef as unknown as Ref<never>}
        points={points}
        color={idleColor}
        lineWidth={BASE_WIDTH_INACTIVE}
        transparent
        opacity={BASE_OPACITY_INACTIVE}
        depthWrite={false}
        renderOrder={RENDER_ORDER_ARC}
      />
      {/* Overlay — dashed line whose visible segment is the animated comet.
          Paints on top of the base so the traversal reads as a highlight
          sliding over the persistent path. */}
      <Line
        ref={overlayRef as unknown as Ref<never>}
        points={points}
        color={idleColor}
        lineWidth={OVERLAY_INACTIVE_WIDTH}
        transparent
        opacity={OVERLAY_INACTIVE_OPACITY}
        depthWrite={false}
        renderOrder={RENDER_ORDER_ARC}
        dashed
        dashScale={1}
        dashSize={0.0001}
        gapSize={arcTotalLength * 4}
      />
    </>
  )
}

const MemoArcLine = memo(ArcLine)

// Deterministic, well-spread phase in [0, 1) from a trip id. String hashing
// → [0, 1); avoids two trips with adjacent alphabetical ids from starting
// their cycles within a few frames of each other.
function phaseFromId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // Unsigned 32-bit → fraction in [0, 1). Full 2^32 buckets; no quantisation.
  return (h >>> 0) / 0x100000000
}

export default function TripArcs() {
  const { tripsWithVisits } = useGlobeData()
  const { hoveredTrip, lockedTrip } = useGlobeTrip()
  const { playbackHighlightedTripIds } = useGlobePlayback()
  const { isDark } = useGlobeUI()
  const reducedMotion = useReducedMotion()

  const arcs: ArcData[] = useMemo(() => {
    const result: ArcData[] = []
    for (const trip of tripsWithVisits) {
      if (trip.visits.length < 2) continue
      const seen = new Set<string>()
      const tripArcs: Omit<ArcData, 'tripArcCount' | 'tripPhaseOffset'>[] = []
      for (let i = 0; i < trip.visits.length - 1; i++) {
        const a = trip.visits[i].location
        const b = trip.visits[i + 1].location
        // Dedup by unordered pair — also silently handles consecutive
        // same-location visits (pair `A|A` is generated once, arc would be
        // degenerate) by skipping the dedup-hit on the second occurrence.
        // We still skip explicitly here so `greatCircleArcPoints` isn't
        // called with identical endpoints.
        if (a._id === b._id) continue
        const pair =
          a._id < b._id ? `${a._id}|${b._id}` : `${b._id}|${a._id}`
        if (seen.has(pair)) continue
        seen.add(pair)
        const points = greatCircleArcPoints(
          a.coordinates.lat,
          a.coordinates.lng,
          b.coordinates.lat,
          b.coordinates.lng,
          GLOBE_RADIUS + ARC_SURFACE_OFFSET,
        )
        tripArcs.push({
          tripId: trip._id,
          key: `${trip._id}:${pair}`,
          points,
          arcIndex: tripArcs.length,
          arcTotalLength: totalPolylineLength(points),
        })
      }
      const tripPhaseOffset = phaseFromId(trip._id)
      for (const a of tripArcs) {
        result.push({ ...a, tripArcCount: tripArcs.length, tripPhaseOffset })
      }
    }
    return result
  }, [tripsWithVisits])

  const idleColor = isDark ? IDLE_COLOR_DARK : IDLE_COLOR_LIGHT
  const playbackSet = useMemo(
    () => new Set(playbackHighlightedTripIds),
    [playbackHighlightedTripIds],
  )

  return (
    <group>
      {arcs.map((arc) => {
        const isLocked = lockedTrip === arc.tripId
        // When a trip is locked, suppress playback/hover highlight on
        // other trips so the selection reads as a single connected set
        // (mirrors GlobePins — avoids lighting up an arc for a trip that
        // merely overlaps the locked trip's date range).
        const isHighlighted = lockedTrip
          ? isLocked
          : hoveredTrip === arc.tripId || playbackSet.has(arc.tripId)
        return (
          <MemoArcLine
            key={arc.key}
            points={arc.points}
            idleColor={idleColor}
            isHighlighted={isHighlighted}
            isLocked={isLocked}
            arcIndex={arc.arcIndex}
            tripArcCount={arc.tripArcCount}
            tripPhaseOffset={arc.tripPhaseOffset}
            arcTotalLength={arc.arcTotalLength}
            reducedMotion={reducedMotion}
          />
        )
      })}
    </group>
  )
}
