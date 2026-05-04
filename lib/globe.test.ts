import { describe, expect, it } from 'vitest'
import {
  aggregatePins,
  computeFitCamera,
  greatCircleArcPoints,
  sphericalToCartesian,
} from './globe'
import type { VisitSummary } from './types'

const FIT_OPTS = {
  globeRadius: 2,
  minDistance: 4.3,
  maxDistance: 8.6,
}

const loc = (id: string, lat = 0, lng = 0) => ({
  _id: id,
  name: id,
  coordinates: { lat, lng },
})
const trip = (id: string) => ({ _id: id, title: id, slug: { current: id } })
const visit = (
  id: string,
  locId: string,
  tripId: string,
  startDate: string,
): VisitSummary => ({
  _id: id,
  startDate,
  endDate: startDate,
  location: loc(locId),
  trip: trip(tripId),
  items: [],
})

describe('aggregatePins', () => {
  it('returns empty array for empty input', () => {
    expect(aggregatePins([])).toEqual([])
  })

  it('produces one pin with visitCount 1 for a single visit', () => {
    const pins = aggregatePins([visit('v1', 'tokyo', 't1', '2024-01-01')])
    expect(pins).toHaveLength(1)
    expect(pins[0].visitCount).toBe(1)
    expect(pins[0].tripIds).toEqual(['t1'])
    expect(pins[0].coordinates).toEqual({ lat: 0, lng: 0 })
  })

  it('merges two visits at same location across different trips', () => {
    const pins = aggregatePins([
      visit('v1', 'tokyo', 't1', '2024-01-01'),
      visit('v2', 'tokyo', 't2', '2025-06-01'),
    ])
    expect(pins).toHaveLength(1)
    expect(pins[0].visitCount).toBe(2)
    expect(pins[0].tripIds).toEqual(['t1', 't2'])
    expect(pins[0].visits.map((v) => v._id)).toEqual(['v2', 'v1'])
  })

  it('splits three visits across two locations and sorts pins by most-recent visit', () => {
    const pins = aggregatePins([
      visit('v1', 'tokyo', 't1', '2024-01-01'),
      visit('v2', 'tokyo', 't1', '2024-03-01'),
      visit('v3', 'paris', 't2', '2025-07-01'),
    ])
    expect(pins).toHaveLength(2)
    expect(pins[0].location._id).toBe('paris')
    expect(pins[1].location._id).toBe('tokyo')
    expect(pins[1].visitCount).toBe(2)
    expect(pins[1].tripIds).toEqual(['t1'])
  })
})

describe('greatCircleArcPoints', () => {
  it('produces N+1 points pinned to the requested radius', () => {
    const points = greatCircleArcPoints(0, 0, 0, 90, 2, 16)
    expect(points).toHaveLength(17)
    for (const [x, y, z] of points) {
      expect(Math.hypot(x, y, z)).toBeCloseTo(2, 5)
    }
  })

  it('endpoints match sphericalToCartesian for the given lat/lng', () => {
    const points = greatCircleArcPoints(35.68, 139.76, -33.87, 151.21, 2, 8)
    const start = sphericalToCartesian(35.68, 139.76, 2)
    const end = sphericalToCartesian(-33.87, 151.21, 2)
    expect(points[0][0]).toBeCloseTo(start[0], 5)
    expect(points[0][1]).toBeCloseTo(start[1], 5)
    expect(points[0][2]).toBeCloseTo(start[2], 5)
    expect(points[points.length - 1][0]).toBeCloseTo(end[0], 5)
    expect(points[points.length - 1][1]).toBeCloseTo(end[1], 5)
    expect(points[points.length - 1][2]).toBeCloseTo(end[2], 5)
  })

  it('coincident endpoints fall back to the two endpoints (no NaN)', () => {
    const points = greatCircleArcPoints(35.68, 139.76, 35.68, 139.76, 2, 8)
    expect(points).toHaveLength(2)
    for (const [x, y, z] of points) {
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
      expect(Number.isFinite(z)).toBe(true)
    }
  })

  it('midpoint of an equator quarter-arc lands on the great circle, not the chord', () => {
    // (0,0) → (0,90) on the equator. The chord midpoint would lie inside
    // the sphere; the great-circle midpoint should be at lat=0, lng=45 and
    // sit exactly on the surface at radius 2.
    const points = greatCircleArcPoints(0, 0, 0, 90, 2, 4)
    const mid = points[2]
    const expected = sphericalToCartesian(0, 45, 2)
    expect(mid[0]).toBeCloseTo(expected[0], 5)
    expect(mid[1]).toBeCloseTo(expected[1], 5)
    expect(mid[2]).toBeCloseTo(expected[2], 5)
    // Sanity: midpoint is genuinely on the sphere, not inside it.
    expect(Math.hypot(mid[0], mid[1], mid[2])).toBeCloseTo(2, 5)
  })

  it('antipodal pair curves over the pole instead of cutting through origin', () => {
    // (0,0) → (0,180) is exactly antipodal — every great circle is valid.
    // The fallback axis (start × y-axis) sweeps the arc over a pole rather
    // than letting it degenerate to a chord through the globe.
    const points = greatCircleArcPoints(0, 0, 0, 180, 2, 4)
    expect(points).toHaveLength(5)
    // Every point sits on the sphere — never on the chord through origin.
    for (const [x, y, z] of points) {
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
      expect(Number.isFinite(z)).toBe(true)
      expect(Math.hypot(x, y, z)).toBeCloseTo(2, 5)
    }
    // Midpoint sits at a pole — |y| = radius — confirming the arc curves
    // over the surface rather than passing through the centre.
    const mid = points[2]
    expect(Math.abs(mid[1])).toBeCloseTo(2, 5)
  })
})

describe('computeFitCamera', () => {
  it('single coord → clamps to minDistance with camera on the coord direction', () => {
    // maxAngle = 0 → rawDistance = R·cos(0) + M·sin(0) = R = 2 → clamped to min (5.5).
    const fit = computeFitCamera([{ lat: 35.68, lng: 139.76 }], FIT_OPTS)
    expect(fit.distance).toBe(FIT_OPTS.minDistance)
    const [ux, uy, uz] = sphericalToCartesian(35.68, 139.76, 1)
    expect(fit.x).toBeCloseTo(ux * fit.distance, 6)
    expect(fit.y).toBeCloseTo(uy * fit.distance, 6)
    expect(fit.z).toBeCloseTo(uz * fit.distance, 6)
  })

  it('tight cluster clamps to minDistance (Tokyo/Kyoto/Osaka)', () => {
    // ~2° spread → rawDistance barely above R → floor wins.
    const fit = computeFitCamera(
      [
        { lat: 35.68, lng: 139.76 },
        { lat: 34.69, lng: 135.5 },
        { lat: 35.01, lng: 135.77 },
      ],
      FIT_OPTS,
    )
    expect(fit.distance).toBe(FIT_OPTS.minDistance)
  })

  it('hemisphere-straddling spread lands near maxDistance', () => {
    // Round-the-World: maxAngle ≈ 87° from centroid. At θ=π/2 the formula
    // returns exactly maxDistance; here we're a hair under, but still > min
    // and within a few percent of max.
    const fit = computeFitCamera(
      [
        { lat: 35.68, lng: 139.76 },
        { lat: 40.71, lng: -74.0 },
        { lat: -33.87, lng: 151.21 },
      ],
      FIT_OPTS,
    )
    expect(fit.distance).toBeGreaterThan(FIT_OPTS.maxDistance * 0.98)
    expect(fit.distance).toBeLessThanOrEqual(FIT_OPTS.maxDistance)
  })

  it('antipodal pair falls back to the first visit direction (no NaN)', () => {
    const a = { lat: 0, lng: 0 }
    const b = { lat: 0, lng: 180 } // exact antipode
    const fit = computeFitCamera([a, b], FIT_OPTS)
    expect(Number.isFinite(fit.x)).toBe(true)
    expect(Number.isFinite(fit.y)).toBe(true)
    expect(Number.isFinite(fit.z)).toBe(true)
    // Angular spread from fallback centroid = π → rawDistance = -R, clamps to min.
    expect(fit.distance).toBe(FIT_OPTS.minDistance)
    // Direction should match the first visit (0,0).
    const [ax, ay, az] = sphericalToCartesian(0, 0, 1)
    const norm = Math.hypot(fit.x, fit.y, fit.z)
    expect(fit.x / norm).toBeCloseTo(ax, 6)
    expect(fit.y / norm).toBeCloseTo(ay, 6)
    expect(fit.z / norm).toBeCloseTo(az, 6)
  })

  it('empty coords returns a min-distance fallback', () => {
    const fit = computeFitCamera([], FIT_OPTS)
    expect(fit.distance).toBe(FIT_OPTS.minDistance)
  })

  it('formula: raw distance matches R·cos(θ) + Dmax·sin(θ) for each term independently', () => {
    // Pair of points on equator at ±30° → centroid at (0,0,0-ish). Each
    // point is 30° from centroid → θ = π/6. Formula: 2·cos(π/6) + 8.6·sin(π/6).
    const theta = Math.PI / 6
    const expected =
      FIT_OPTS.globeRadius * Math.cos(theta) + FIT_OPTS.maxDistance * Math.sin(theta)
    const fit = computeFitCamera(
      [
        { lat: 0, lng: -30 },
        { lat: 0, lng: 30 },
      ],
      FIT_OPTS,
    )
    expect(fit.distance).toBeCloseTo(expected, 5)
    // Sanity: both terms individually — bumping R or Dmax should move the result.
    const fitBiggerR = computeFitCamera(
      [
        { lat: 0, lng: -30 },
        { lat: 0, lng: 30 },
      ],
      { ...FIT_OPTS, globeRadius: 3 },
    )
    expect(fitBiggerR.distance - fit.distance).toBeCloseTo((3 - 2) * Math.cos(theta), 5)
    const fitBiggerMax = computeFitCamera(
      [
        { lat: 0, lng: -30 },
        { lat: 0, lng: 30 },
      ],
      { ...FIT_OPTS, maxDistance: 10 },
    )
    expect(fitBiggerMax.distance - fit.distance).toBeCloseTo(
      (10 - 8.6) * Math.sin(theta),
      5,
    )
  })

  it('gradient: distance grows monotonically with spread in the non-clamped band', () => {
    // Spreads from 30° to 150° (pair on equator) — sample the growth curve.
    const sample = (halfSpreadDeg: number) =>
      computeFitCamera(
        [
          { lat: 0, lng: -halfSpreadDeg },
          { lat: 0, lng: halfSpreadDeg },
        ],
        FIT_OPTS,
      ).distance
    const d30 = sample(15) // 30° spread
    const d60 = sample(30) // 60° spread
    const d90 = sample(45) // 90° spread (hemisphere)
    const d120 = sample(60) // 120° spread
    // 30° spread: raw = 2·cos(15°) + 8.6·sin(15°) ≈ 1.93 + 2.23 = 4.16 → clamps to 5.5.
    expect(d30).toBe(FIT_OPTS.minDistance)
    // 60°: raw ≈ 1.73 + 4.30 = 6.03 — above min, below max.
    expect(d60).toBeGreaterThan(FIT_OPTS.minDistance)
    expect(d60).toBeLessThan(FIT_OPTS.maxDistance)
    // 90°: raw = 2·cos(45°) + 8.6·sin(45°) ≈ 1.41 + 6.08 = 7.49.
    expect(d90).toBeGreaterThan(d60)
    expect(d90).toBeCloseTo(
      FIT_OPTS.globeRadius * Math.cos(Math.PI / 4) +
        FIT_OPTS.maxDistance * Math.sin(Math.PI / 4),
      5,
    )
    // 120° spread, 60° half: raw = 2·0.5 + 8.6·0.866 ≈ 8.45.
    expect(d120).toBeGreaterThan(d90)
    expect(d120).toBeLessThanOrEqual(FIT_OPTS.maxDistance)
  })

  it('hemisphere boundary lands exactly at maxDistance', () => {
    // Two points on equator, 180° apart, fallback picks first → θ=π from
    // centroid, clamps to min (antipodal case). Use a non-degenerate setup:
    // three points arranged so centroid maxAngle is exactly π/2.
    // Equator at 0°, 90°, and 180° — centroid direction is (−sqrt2/2, 0, sqrt2/2)
    // normalized, maxAngle from centroid is π/2 for the equatorial points that
    // land on the antipodal great circle. Simpler: two points at equator 90°
    // apart — centroid points at 45°, maxAngle = 45° (half the spread).
    // For exactly π/2, use pole + equator:
    const fit = computeFitCamera(
      [
        { lat: 90, lng: 0 },
        { lat: 0, lng: 0 },
      ],
      FIT_OPTS,
    )
    // Centroid is at 45° latitude, 0° longitude. Each point is 45° away → maxAngle = π/4.
    // raw = 2·cos(π/4) + 8.6·sin(π/4) ≈ 7.49. Sanity: below max.
    expect(fit.distance).toBeLessThan(FIT_OPTS.maxDistance)
    expect(fit.distance).toBeGreaterThan(FIT_OPTS.minDistance)
  })
})
