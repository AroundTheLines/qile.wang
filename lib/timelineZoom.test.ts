import { describe, it, expect } from 'vitest'
import { clampZoom } from './timelineZoom'

describe('clampZoom', () => {
  it('returns the input unchanged when already within [0, 1]', () => {
    expect(clampZoom(0.2, 0.6)).toEqual({ start: 0.2, end: 0.6 })
    expect(clampZoom(0, 1)).toEqual({ start: 0, end: 1 })
  })

  it('shifts right when start overshoots below 0, preserving span', () => {
    const { start, end } = clampZoom(-0.1, 0.3)
    expect(start).toBeCloseTo(0, 10)
    expect(end).toBeCloseTo(0.4, 10)
  })

  it('shifts left when end overshoots above 1, preserving span', () => {
    const { start, end } = clampZoom(0.8, 1.2)
    expect(start).toBeCloseTo(0.6, 10)
    expect(end).toBeCloseTo(1, 10)
  })

  it('collapses to [0, 1] when span exceeds 1 (both bounds overshoot)', () => {
    const { start, end } = clampZoom(-0.2, 1.2)
    expect(start).toBe(0)
    expect(end).toBe(1)
  })

  it('handles exact boundary values without drift', () => {
    expect(clampZoom(0, 0.5)).toEqual({ start: 0, end: 0.5 })
    expect(clampZoom(0.5, 1)).toEqual({ start: 0.5, end: 1 })
  })
})
