import type { Coordinates, PinWithVisits, VisitSummary } from './types'

// --- Scene constants ---

/**
 * Globe mesh radius. Referenced by anything that needs to place objects
 * on/near the sphere surface, project screen positions, or compute camera
 * framing. Previously duplicated in `GlobeMesh.tsx`, `GlobePins.tsx`,
 * `GlobePositionBridge.tsx`, and `GlobeScene.tsx` — consolidated here so
 * tweaking the globe size doesn't require a multi-file hunt.
 */
export const GLOBE_RADIUS = 2

// --- Layout constants ---

/**
 * Height of the fixed top navbar on `/globe` (see `GlobeNavbar.tsx`). Shared
 * so layout shells (timeline offset, mobile globe re-centering) don't drift
 * if the navbar height changes.
 */
export const NAVBAR_HEIGHT_PX = 72

/**
 * Vertical anchor used by the trip panel (§7.2). Unlike the pin panel —
 * which is anchored to the selected pin's Y so the connector line reads
 * cleanly from pin → panel header — the trip panel has no geometric
 * anchor on the globe, so we pin it just below the timeline rail. The
 * fixed offset is what visually distinguishes the two variants.
 *
 * Navbar (72) + timeline rail (~92) + a visible gap (~28) ≈ 192. Rounded
 * to 200 to keep the floor resilient to small timeline-height changes.
 */
export const TRIP_PANEL_TOP_PX = NAVBAR_HEIGHT_PX + 128

// --- Utilities ---

/**
 * Clamp the panel's top coordinate so it stays fully within the viewport
 * while aligning with the selected pin's Y position when possible.
 */
export function clampPanelTop(pinY: number | null, viewportHeight: number): number {
  if (pinY == null) return 100
  // Align panel top ~60px above the pin (so pin visually connects to header)
  const desired = pinY - 60
  return Math.max(24, Math.min(desired, viewportHeight - 400))
}

// --- Camera framing (C5) ---

/**
 * Compute the camera position (relative to globe origin) that frames all
 * `coords` of a trip inside the viewport. Returns a position along the
 * centroid direction at a distance clamped to [minDistance, maxDistance].
 *
 * Derivation (see §17.3 and the C5 shipped notes for full context):
 *   At camera distance D from globe center, a pin at angular offset θ
 *   from the centroid direction projects to screen half-angle φ where
 *     tan(φ) = R · sin(θ) / (D − R · cos(θ))
 *   Solving for D:
 *     D = R · cos(θ) + R · sin(θ) / tan(φ)
 *   Choosing φ so that a hemisphere-spread trip (θ = π/2) lands exactly
 *   at `maxDistance` gives tan(φ) = R / maxDistance, which simplifies to
 *     D = R · cos(θ) + maxDistance · sin(θ)
 *
 * This yields a smooth gradient: tight clusters land at `minDistance`
 * (clamped), mid-spread trips land proportionally further back, and
 * hemisphere-straddling trips naturally approach `maxDistance` without
 * a separate singularity branch. Antipodal pairs fall back to the first
 * visit's direction (centroid sum ≈ 0).
 */
export interface ComputeFitCameraOpts {
  /** Globe radius in the same units as min/maxDistance. */
  globeRadius: number
  /** Floor distance — tight clusters clamp to this. */
  minDistance: number
  /** Ceiling — hemisphere-straddling trips land at this. */
  maxDistance: number
}

export function computeFitCamera(
  coords: Coordinates[],
  opts: ComputeFitCameraOpts,
): { x: number; y: number; z: number; distance: number } {
  if (coords.length === 0) {
    return {
      x: 0,
      y: 0,
      z: opts.minDistance,
      distance: opts.minDistance,
    }
  }
  const vectors = coords.map((c) => sphericalToCartesian(c.lat, c.lng, 1))

  let cx = 0
  let cy = 0
  let cz = 0
  for (const [x, y, z] of vectors) {
    cx += x
    cy += y
    cz += z
  }
  let clen = Math.hypot(cx, cy, cz)
  if (clen < 1e-6) {
    // Antipodal — fall back to the first visit's direction.
    ;[cx, cy, cz] = vectors[0]
    clen = Math.hypot(cx, cy, cz)
  }
  cx /= clen
  cy /= clen
  cz /= clen

  let maxAngle = 0
  for (const [vx, vy, vz] of vectors) {
    const dot = Math.min(1, Math.max(-1, cx * vx + cy * vy + cz * vz))
    const a = Math.acos(dot)
    if (a > maxAngle) maxAngle = a
  }

  // `rawDistance` is exact on θ ∈ [0, π/2]. Past π/2 the cos term goes
  // negative and the curve starts bending back down — at θ=π it
  // evaluates to −R. That's outside the formula's meaningful domain;
  // the outer clamp to [minDistance, maxDistance] is what actually
  // guarantees a sane output for degenerate-spread inputs. Antipodal
  // inputs never reach this branch because the centroid fallback above
  // picks the first visit direction (θ=0) instead.
  const rawDistance =
    opts.globeRadius * Math.cos(maxAngle) + opts.maxDistance * Math.sin(maxAngle)
  const distance = Math.min(
    opts.maxDistance,
    Math.max(opts.minDistance, rawDistance),
  )

  return { x: cx * distance, y: cy * distance, z: cz * distance, distance }
}

export function sphericalToCartesian(
  lat: number,
  lng: number,
  radius: number,
): [number, number, number] {
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  return [
    -radius * Math.cos(latRad) * Math.cos(lngRad),
    radius * Math.sin(latRad),
    radius * Math.cos(latRad) * Math.sin(lngRad),
  ]
}

/**
 * Sample a great-circle arc between two lat/lng points on a sphere of the
 * given radius. Returns `segments + 1` points as `[x, y, z]` triples. Used
 * by both the main globe's TripArcs (animated comet overlay on top of these
 * paths) and the per-item mini-globe (static travel lines connecting the
 * locations an item visited).
 *
 * Edge cases:
 * - Coincident endpoints (angle ≈ 0) collapse to the two endpoint points so
 *   a zero-length pair doesn't blow up downstream geometry.
 * - Antipodal endpoints (angle ≈ π) have an undefined cross product — every
 *   great circle is valid. We pick a stable axis perpendicular to `start`
 *   so the arc still curves over the pole instead of degenerating to a
 *   chord through the sphere.
 */
export function greatCircleArcPoints(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  radius: number,
  segments = 32,
): [number, number, number][] {
  const sUnit = sphericalToCartesian(startLat, startLng, 1)
  const eUnit = sphericalToCartesian(endLat, endLng, 1)
  const dot = Math.min(
    1,
    Math.max(-1, sUnit[0] * eUnit[0] + sUnit[1] * eUnit[1] + sUnit[2] * eUnit[2]),
  )
  const angle = Math.acos(dot)

  // Coincident endpoints — zero-length arc.
  if (angle < 1e-6) {
    return [
      [sUnit[0] * radius, sUnit[1] * radius, sUnit[2] * radius],
      [eUnit[0] * radius, eUnit[1] * radius, eUnit[2] * radius],
    ]
  }

  // Rotation axis = start × end. For antipodal pairs the cross is the zero
  // vector; fall back to (start × y) — and if `start` itself is the y-axis,
  // (start × x) instead.
  let nx: number
  let ny: number
  let nz: number
  const cAx = sUnit[1] * eUnit[2] - sUnit[2] * eUnit[1]
  const cAy = sUnit[2] * eUnit[0] - sUnit[0] * eUnit[2]
  const cAz = sUnit[0] * eUnit[1] - sUnit[1] * eUnit[0]
  const cAlen = Math.hypot(cAx, cAy, cAz)
  if (cAlen < 1e-6) {
    // start × (0,1,0) = (-sz, 0, sx)
    let fx = -sUnit[2]
    let fy = 0
    let fz = sUnit[0]
    let fLen = Math.hypot(fx, fy, fz)
    if (fLen < 1e-6) {
      // start ∥ ±y; fall back to start × (1,0,0) = (0, sz, -sy).
      fx = 0
      fy = sUnit[2]
      fz = -sUnit[1]
      fLen = Math.hypot(fx, fy, fz)
    }
    nx = fx / fLen
    ny = fy / fLen
    nz = fz / fLen
  } else {
    nx = cAx / cAlen
    ny = cAy / cAlen
    nz = cAz / cAlen
  }

  // Rodrigues' rotation: v_rot = v cos θ + (n × v) sin θ + n (n·v) (1-cos θ).
  // Both `n × start` and `n · start` are constant across the loop — only
  // cos/sin vary with θ — so they're computed once up front.
  const dotNS = nx * sUnit[0] + ny * sUnit[1] + nz * sUnit[2]
  const ncrossSx = ny * sUnit[2] - nz * sUnit[1]
  const ncrossSy = nz * sUnit[0] - nx * sUnit[2]
  const ncrossSz = nx * sUnit[1] - ny * sUnit[0]
  const nDotNSx = nx * dotNS
  const nDotNSy = ny * dotNS
  const nDotNSz = nz * dotNS

  const points: [number, number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const theta = angle * (i / segments)
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    const k = 1 - cos
    const rx = sUnit[0] * cos + ncrossSx * sin + nDotNSx * k
    const ry = sUnit[1] * cos + ncrossSy * sin + nDotNSy * k
    const rz = sUnit[2] * cos + ncrossSz * sin + nDotNSz * k
    points.push([rx * radius, ry * radius, rz * radius])
  }
  return points
}

export interface GlobeScreenCircle {
  cx: number
  cy: number
  r: number
}

/**
 * Treat the globe as a circular occluder in screen space and trim the
 * pin→endpoint line so the segment inside the silhouette is hidden whenever
 * the pin sits on the far hemisphere. When the pin is on the near hemisphere
 * (or we have no globe geometry yet), the original line is returned unchanged.
 *
 * Returns `visible: false` when the entire line is hidden (e.g., both the pin
 * and the endpoint sit inside the disc).
 */
export function clipLineByGlobe(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  pinBehind: boolean,
  globe: GlobeScreenCircle | null,
): { x1: number; y1: number; x2: number; y2: number; visible: boolean } {
  if (!pinBehind || !globe) {
    return { x1, y1, x2, y2, visible: true }
  }
  const dx = x2 - x1
  const dy = y2 - y1
  const a = dx * dx + dy * dy
  if (a === 0) return { x1, y1, x2, y2, visible: false }
  const fx = x1 - globe.cx
  const fy = y1 - globe.cy
  const b = 2 * (fx * dx + fy * dy)
  const c = fx * fx + fy * fy - globe.r * globe.r
  const disc = b * b - 4 * a * c
  if (disc < 0) {
    // Pin is flagged behind but the line never crosses the disc — fall back
    // to drawing the full line so we never silently lose the connector.
    return { x1, y1, x2, y2, visible: true }
  }
  const sqrtDisc = Math.sqrt(disc)
  const tExit = (-b + sqrtDisc) / (2 * a)
  if (tExit >= 1) {
    // Line exits the disc beyond the endpoint → fully occluded.
    return { x1, y1, x2, y2, visible: false }
  }
  const t = Math.max(0, tExit)
  return {
    x1: x1 + t * dx,
    y1: y1 + t * dy,
    x2,
    y2,
    visible: true,
  }
}

/**
 * Aggregate visits into pins (one pin per unique location document).
 * - Each pin's `visits` are sorted startDate desc (most recent first) — matches §7.1.
 * - Pins are sorted by each pin's most-recent visit, descending — preserves
 *   the entrance-target contract GlobeScene relies on (`pins[0]` = freshest).
 */
export function aggregatePins(visits: VisitSummary[]): PinWithVisits[] {
  const byLocation = new Map<string, PinWithVisits>()
  const tripIdSets = new Map<string, Set<string>>()
  for (const v of visits) {
    const key = v.location._id
    let pin = byLocation.get(key)
    let tripSet = tripIdSets.get(key)
    if (!pin || !tripSet) {
      pin = {
        location: v.location,
        visits: [],
        coordinates: v.location.coordinates,
        visitCount: 0,
        tripIds: [],
      }
      tripSet = new Set<string>()
      byLocation.set(key, pin)
      tripIdSets.set(key, tripSet)
    }
    pin.visits.push(v)
    pin.visitCount++
    if (!tripSet.has(v.trip._id)) {
      tripSet.add(v.trip._id)
      pin.tripIds.push(v.trip._id)
    }
  }
  for (const pin of byLocation.values()) {
    pin.visits.sort((a, b) => b.startDate.localeCompare(a.startDate))
  }
  return Array.from(byLocation.values()).sort((a, b) =>
    b.visits[0].startDate.localeCompare(a.visits[0].startDate),
  )
}

