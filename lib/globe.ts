import type { ContentType, PinWithVisits, SanityImage, VisitSummary } from './types'

// --- Types ---

/**
 * Lightweight item shape rendered inside the pin detail panel. Kept here
 * (not replaced by ContentSummary) because `GlobeDetailItem.tsx` expects
 * `locationLabel` + `year` derived fields that the raw content summary lacks.
 */
export interface GlobePinItem {
  _id: string
  title: string
  slug: { current: string }
  content_type: ContentType
  cover_image?: SanityImage
  locationLabel: string
  year?: string
}

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
  for (const v of visits) {
    const key = v.location._id
    let pin = byLocation.get(key)
    if (!pin) {
      pin = {
        location: v.location,
        visits: [],
        coordinates: v.location.coordinates,
        visitCount: 0,
        tripIds: [],
      }
      byLocation.set(key, pin)
    }
    pin.visits.push(v)
    pin.visitCount++
    if (!pin.tripIds.includes(v.trip._id)) pin.tripIds.push(v.trip._id)
  }
  for (const pin of byLocation.values()) {
    pin.visits.sort((a, b) => b.startDate.localeCompare(a.startDate))
  }
  return Array.from(byLocation.values()).sort((a, b) =>
    b.visits[0].startDate.localeCompare(a.visits[0].startDate),
  )
}

