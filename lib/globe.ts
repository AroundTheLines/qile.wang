import type { Coordinates, PinWithVisits, VisitSummary } from './types'

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
 * `coords` on a unit-radius sphere. Returns a position vector scaled to
 * the computed fit distance, clamped to [restingDistance, maxDistance].
 *
 * Conventions:
 * - Coords are treated as directions on the unit sphere. The globe's
 *   actual mesh radius is not threaded through because `restingDistance`
 *   is measured from origin and the `1/tan(fitFov)` formula is scale-
 *   free in that frame.
 * - `centroid` = normalized sum of direction vectors. If the inputs are
 *   antipodal (sum ≈ 0), falls back to the first visit's direction.
 * - `fitFov = maxAngle + margin`. When fitFov approaches π/2, `1/tan`
 *   explodes and then goes negative; `fovSingularityBuffer` catches that
 *   band early and pins to `maxDistance` so globe-spanning trips stay
 *   framed (§16 Q4 "~40% visible").
 */
export interface ComputeFitCameraOpts {
  restingDistance: number
  maxDistance: number
  /** Radians of padding around the angular spread. */
  margin: number
  /** Radians before π/2 at which we bail to maxDistance. */
  fovSingularityBuffer: number
}

export function computeFitCamera(
  coords: Coordinates[],
  opts: ComputeFitCameraOpts,
): { x: number; y: number; z: number; distance: number } {
  if (coords.length === 0) {
    return { x: 0, y: 0, z: opts.restingDistance, distance: opts.restingDistance }
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

  const fitFov = maxAngle + opts.margin
  // `rawDistance = 1/tan(fitFov)` in unit-sphere units — derivation: for a
  // camera at distance d looking at origin, the pin at angular offset α from
  // the centroid subtends screen angle atan(sin α / (d - cos α)) ≈ α / d for
  // small α and d >> 1. Setting that equal to half the camera FOV and solving
  // for d gives d ≈ 1/tan(α). The `* RESTING` multiplier seen in the C5
  // ticket's pseudocode was a transcription bug — it caused single-visit
  // trips to clamp at MAX_DISTANCE instead of landing at RESTING.
  const rawDistance = 1 / Math.tan(fitFov)
  const distance =
    fitFov >= Math.PI / 2 - opts.fovSingularityBuffer
      ? opts.maxDistance
      : Math.min(
          opts.maxDistance,
          Math.max(opts.restingDistance, rawDistance),
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

