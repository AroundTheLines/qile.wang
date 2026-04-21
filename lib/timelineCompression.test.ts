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
