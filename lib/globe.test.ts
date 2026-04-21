import { describe, expect, it } from 'vitest'
import { aggregatePins } from './globe'
import type { VisitSummary } from './types'

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
