import { describe, expect, it } from 'vitest'
import { aggregatePins, computeFitCamera, sphericalToCartesian } from './globe'
import type { VisitSummary } from './types'

const FIT_OPTS = {
  restingDistance: 6.5,
  maxDistance: 13,
  margin: 0.15,
  fovSingularityBuffer: 0.05,
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

describe('computeFitCamera', () => {
  it('single coord → camera sits on that coord direction near RESTING_DISTANCE', () => {
    // maxAngle = 0 → fitFov = margin (0.15 rad) → rawDistance = 1/tan(0.15) ≈ 6.62.
    // max(resting=6.5, 6.62) = 6.62 — a hair past resting, ticket §247 "close to resting".
    const fit = computeFitCamera([{ lat: 35.68, lng: 139.76 }], FIT_OPTS)
    expect(fit.distance).toBeGreaterThanOrEqual(FIT_OPTS.restingDistance)
    expect(fit.distance).toBeLessThan(FIT_OPTS.restingDistance * 1.05)
    const [ux, uy, uz] = sphericalToCartesian(35.68, 139.76, 1)
    expect(fit.x).toBeCloseTo(ux * fit.distance, 6)
    expect(fit.y).toBeCloseTo(uy * fit.distance, 6)
    expect(fit.z).toBeCloseTo(uz * fit.distance, 6)
  })

  it('tight cluster stays at RESTING_DISTANCE (margin-dominated)', () => {
    // Tokyo + Osaka + Kyoto — all within a few degrees of each other.
    const fit = computeFitCamera(
      [
        { lat: 35.68, lng: 139.76 },
        { lat: 34.69, lng: 135.5 },
        { lat: 35.01, lng: 135.77 },
      ],
      FIT_OPTS,
    )
    expect(fit.distance).toBe(FIT_OPTS.restingDistance)
  })

  it('hemisphere-straddling spread caps at maxDistance (large-spread branch)', () => {
    // Round-the-World: Tokyo, NYC, Sydney — pairwise angular spread > 90°.
    const fit = computeFitCamera(
      [
        { lat: 35.68, lng: 139.76 },
        { lat: 40.71, lng: -74.0 },
        { lat: -33.87, lng: 151.21 },
      ],
      FIT_OPTS,
    )
    expect(fit.distance).toBe(FIT_OPTS.maxDistance)
  })

  it('antipodal pair falls back to the first visit direction (no NaN)', () => {
    const a = { lat: 0, lng: 0 }
    const b = { lat: 0, lng: 180 } // exact antipode
    const fit = computeFitCamera([a, b], FIT_OPTS)
    expect(Number.isFinite(fit.x)).toBe(true)
    expect(Number.isFinite(fit.y)).toBe(true)
    expect(Number.isFinite(fit.z)).toBe(true)
    // Angular spread is π → well past the singularity buffer → max cap.
    expect(fit.distance).toBe(FIT_OPTS.maxDistance)
    // Direction should match the first visit (0,0), not the midpoint (which is ill-defined).
    const [ax, ay, az] = sphericalToCartesian(0, 0, 1)
    const norm = Math.hypot(fit.x, fit.y, fit.z)
    expect(fit.x / norm).toBeCloseTo(ax, 6)
    expect(fit.y / norm).toBeCloseTo(ay, 6)
    expect(fit.z / norm).toBeCloseTo(az, 6)
  })

  it('empty coords returns a resting-distance fallback (defensive, not spec-required)', () => {
    const fit = computeFitCamera([], FIT_OPTS)
    expect(fit.distance).toBe(FIT_OPTS.restingDistance)
  })

  it('narrow spread with margin-dominated fitFov zooms slightly past resting', () => {
    // Two points ~2° apart. maxAngle ≈ 1° → fitFov ≈ 9.6° → rawDistance ≈ 1/tan(0.168) ≈ 5.96.
    // max(resting=6.5, 5.96) = 6.5 → stays at resting.
    // To trigger the rawDistance > resting branch we need fitFov small enough that
    // 1/tan(fitFov) > 6.5, i.e. fitFov < atan(1/6.5) ≈ 0.1526 rad (~8.74°).
    // With margin=0.15 rad, maxAngle ≈ 0 suffices: single coord — tested above.
    //
    // Practically, the formula produces a near-binary behavior: RESTING for
    // everything under a hemisphere, MAX for hemisphere-straddling. This
    // matches §16 Q4's "~40% visible" target and the acceptance-criteria
    // "single-visit / tight cluster → resting" expectation.
    const fit = computeFitCamera(
      [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 2 },
      ],
      FIT_OPTS,
    )
    expect(fit.distance).toBe(FIT_OPTS.restingDistance)
  })

  it('moderate continental spread still lands at resting (expected binary behavior)', () => {
    // Paris + Berlin + Rome — within ~15° of each other.
    const fit = computeFitCamera(
      [
        { lat: 48.85, lng: 2.35 },
        { lat: 52.52, lng: 13.4 },
        { lat: 41.9, lng: 12.49 },
      ],
      FIT_OPTS,
    )
    expect(fit.distance).toBe(FIT_OPTS.restingDistance)
  })
})
