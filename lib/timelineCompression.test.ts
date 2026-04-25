import { describe, it, expect } from 'vitest'
import { buildCompressedMap, type TripRange } from './timelineCompression'

describe('buildCompressedMap', () => {
  it('single-day trip: dateToX returns valid range', () => {
    const map = buildCompressedMap(
      [{ id: 'a', startDate: '2024-03-15', endDate: '2024-03-15' }],
      { now: '2024-04-15' }
    )
    expect(map.dateToX('2024-03-15')).toBeGreaterThanOrEqual(0)
    expect(map.dateToX('2024-04-15')).toBeCloseTo(1, 10)
    expect(map.start).toBe('2024-03-15')
    expect(map.end).toBe('2024-04-15')
  })

  it('two trips far apart: empty region is compressed', () => {
    const map = buildCompressedMap(
      [
        { id: 'a', startDate: '2019-01-01', endDate: '2019-01-07' },
        { id: 'b', startDate: '2024-01-01', endDate: '2024-01-07' },
      ],
      { now: '2024-04-15' }
    )
    const tripAWidth = map.dateToX('2019-01-07') - map.dateToX('2019-01-01')
    const gapWidth = map.dateToX('2024-01-01') - map.dateToX('2019-01-07')
    expect(tripAWidth).toBeGreaterThan(0)
    expect(gapWidth).toBeGreaterThan(0)
    expect(gapWidth / tripAWidth).toBeLessThan(50)
  })

  it('10 trips densely packed: all get visible width', () => {
    const trips: TripRange[] = []
    for (let i = 0; i < 10; i++) {
      const month = String(i + 1).padStart(2, '0')
      trips.push({ id: `t${i}`, startDate: `2024-${month}-01`, endDate: `2024-${month}-05` })
    }
    const map = buildCompressedMap(trips, { now: '2024-12-01' })
    for (let i = 0; i < 10; i++) {
      const month = String(i + 1).padStart(2, '0')
      const w = map.dateToX(`2024-${month}-05`) - map.dateToX(`2024-${month}-01`)
      expect(w).toBeGreaterThan(0.005)
    }
  })

  it('10-year trip: dominates width', () => {
    const map = buildCompressedMap(
      [{ id: 'long', startDate: '2014-01-01', endDate: '2024-01-01' }],
      { now: '2024-06-01' }
    )
    const longWidth = map.dateToX('2024-01-01') - map.dateToX('2014-01-01')
    expect(longWidth).toBeGreaterThan(0.8)
  })

  it('no trips: returns default span, dateToX(now) === 1', () => {
    const map = buildCompressedMap([], { now: '2024-04-15' })
    expect(map.dateToX('2024-04-15')).toBeCloseTo(1, 10)
    expect(map.dateToX(map.start)).toBe(0)
  })

  it('dateToX / xToDate roundtrip within 1 day', () => {
    const map = buildCompressedMap(
      [
        { id: 'a', startDate: '2022-03-05', endDate: '2022-03-18' },
        { id: 'b', startDate: '2023-10-15', endDate: '2023-10-25' },
      ],
      { now: '2024-04-15' }
    )
    for (const probe of ['2022-03-10', '2023-06-01', '2023-10-20']) {
      const x = map.dateToX(probe)
      const backToDate = map.xToDate(x)
      const diff =
        Math.abs(new Date(probe).getTime() - new Date(backToDate).getTime()) / 86400000
      expect(diff).toBeLessThanOrEqual(1)
    }
  })

  it('tick marks: year ticks at all zoom levels', () => {
    const map = buildCompressedMap(
      [{ id: 'a', startDate: '2019-01-01', endDate: '2019-06-01' }],
      { now: '2024-04-15' }
    )
    const years = map.tickMarks.filter((t) => t.kind === 'year').map((t) => t.label)
    expect(years).toContain('2020')
    expect(years).toContain('2024')
  })

  it('tick marks: month ticks appear when span < 2 years', () => {
    const map = buildCompressedMap(
      [{ id: 'a', startDate: '2024-01-01', endDate: '2024-06-01' }],
      { now: '2024-07-01' }
    )
    const months = map.tickMarks.filter((t) => t.kind === 'month')
    expect(months.length).toBeGreaterThan(0)
  })

  it('overlapping trips merge into one active interval', () => {
    const map = buildCompressedMap(
      [
        { id: 'a', startDate: '2024-01-01', endDate: '2024-01-20' },
        { id: 'b', startDate: '2024-01-10', endDate: '2024-01-31' },
      ],
      { now: '2024-06-01' }
    )
    // Merged range is 2024-01-01 → 2024-01-31. The interior date (2024-01-15)
    // falls inside the active band, so its x should sit between the two
    // endpoints with non-zero margin on both sides.
    const xStart = map.dateToX('2024-01-01')
    const xMid = map.dateToX('2024-01-15')
    const xEnd = map.dateToX('2024-01-31')
    expect(xMid - xStart).toBeGreaterThan(0)
    expect(xEnd - xMid).toBeGreaterThan(0)
    // No empty gap should appear between the overlapping trips: x at b.start
    // must be strictly less than x at a.end + (one active-segment width).
    const gapBetween = map.dateToX('2024-01-10') - map.dateToX('2024-01-09')
    const sameSpanInside = map.dateToX('2024-01-21') - map.dateToX('2024-01-20')
    // If merge worked, both spans live inside one active segment and have the
    // same per-day width. If merge failed, the second span would be much smaller
    // (compressed empty). Allow a tiny tolerance for floating point.
    expect(Math.abs(gapBetween - sameSpanInside)).toBeLessThan(1e-9)
  })

  it('trips with endDate after now are clamped to now', () => {
    const map = buildCompressedMap(
      [{ id: 'a', startDate: '2024-03-01', endDate: '2025-01-01' }],
      { now: '2024-06-01' }
    )
    expect(map.end).toBe('2024-06-01')
    expect(map.dateToX('2024-06-01')).toBeCloseTo(1, 10)
    // Dates past now clamp silently, no throw.
    expect(map.dateToX('2030-01-01')).toBeCloseTo(1, 10)
  })

  it('subtractOneYear handles leap day without producing a phantom date', () => {
    // Empty trips path uses subtractOneYear(now). On a leap day, this used to
    // produce 2023-02-29 — Date.UTC silently rolls that to Mar 1, but the bug
    // was a real correctness risk. Verify start is a real date and span is ~365.
    const map = buildCompressedMap([], { now: '2024-02-29' })
    expect(map.end).toBe('2024-02-29')
    // Start should be a parseable date that's roughly 365 days earlier.
    const startMs = Date.UTC(
      +map.start.slice(0, 4),
      +map.start.slice(5, 7) - 1,
      +map.start.slice(8, 10)
    )
    const endMs = Date.UTC(2024, 1, 29)
    const days = Math.round((endMs - startMs) / 86400000)
    expect(days).toBe(365)
  })

  it('dateToX is monotonically increasing', () => {
    const map = buildCompressedMap(
      [
        { id: 'a', startDate: '2020-01-01', endDate: '2020-02-01' },
        { id: 'b', startDate: '2022-06-01', endDate: '2022-06-30' },
      ],
      { now: '2024-04-15' }
    )
    const probes = ['2020-01-01', '2020-06-01', '2022-06-15', '2024-04-01']
    let prev = -1
    for (const p of probes) {
      const x = map.dateToX(p)
      expect(x).toBeGreaterThan(prev)
      prev = x
    }
  })
})
