import { describe, it, expect } from 'vitest'
import { clampZoom, wheelZoom, wheelPan, dragPan, pinchZoom } from './timelineZoom'

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

describe('wheelZoom', () => {
  const full = { start: 0, end: 1 }
  const minSpan = 0.2

  it('returns null when already at max span and wheeling to zoom out', () => {
    // deltaY < 0 → zoomFactor > 1 → span wants to grow, clamped to 1 (no change)
    expect(wheelZoom(full, -500, 0.5, minSpan)).toBeNull()
  })

  it('returns null when already at min span and wheeling to zoom in', () => {
    // deltaY > 0 → span wants to shrink, clamped to minSpan (no change).
    // Use { 0, 0.2 } so span === minSpan exactly (0.6 - 0.4 !== 0.2 in IEEE 754).
    expect(wheelZoom({ start: 0, end: 0.2 }, 500, 0.5, minSpan)).toBeNull()
  })

  it('zooms in around the cursor (keeps cursor point fixed)', () => {
    const result = wheelZoom(full, 500, 0.5, minSpan)!
    // Cursor at midpoint; symmetric zoom around 0.5.
    expect(result.start).toBeCloseTo(0.5 - (result.end - result.start) / 2, 10)
    expect((result.start + result.end) / 2).toBeCloseTo(0.5, 10)
  })

  it('zooms around an off-center cursor', () => {
    const result = wheelZoom(full, 500, 0.25, minSpan)!
    const newSpan = result.end - result.start
    // cursorX before zoom = 0 + 0.25 * 1 = 0.25. After zoom, cursorX should
    // still equal start + 0.25 * newSpan.
    expect(result.start + 0.25 * newSpan).toBeCloseTo(0.25, 10)
  })

  it('honours the minSpan floor', () => {
    const result = wheelZoom(full, 10000, 0.5, 0.3)!
    expect(result.end - result.start).toBeCloseTo(0.3, 10)
  })
})

describe('wheelPan', () => {
  it('shifts the window rightward for positive deltaX', () => {
    const result = wheelPan({ start: 0.3, end: 0.5 }, 100, 1000)
    // dxFrac = 0.1, span = 0.2, shift = 0.1 * 0.2 = 0.02
    expect(result.start).toBeCloseTo(0.32, 10)
    expect(result.end).toBeCloseTo(0.52, 10)
  })

  it('shifts the window leftward for negative deltaX', () => {
    const result = wheelPan({ start: 0.3, end: 0.5 }, -100, 1000)
    expect(result.start).toBeCloseTo(0.28, 10)
    expect(result.end).toBeCloseTo(0.48, 10)
  })

  it('preserves span when pan overshoots a bound', () => {
    const result = wheelPan({ start: 0.9, end: 1 }, 1000, 1000)
    // Would shift by 0.1, but end is at 1; clampZoom shifts start left.
    expect(result.end).toBe(1)
    expect(result.start).toBeCloseTo(0.9, 10)
  })

  it('returns the input unchanged when width is zero', () => {
    const cur = { start: 0.2, end: 0.6 }
    expect(wheelPan(cur, 100, 0)).toBe(cur)
  })
})

describe('dragPan', () => {
  it('shifts the window opposite to the drag direction', () => {
    // Drag right by 100 px in a 1000 px container → window moves LEFT by
    // 0.1 * span so that content appears to follow the finger.
    const result = dragPan({ start: 0.4, end: 0.6 }, 100, 1000)
    expect(result.start).toBeCloseTo(0.38, 10)
    expect(result.end).toBeCloseTo(0.58, 10)
  })

  it('clamps at the left edge when dragging past start', () => {
    const result = dragPan({ start: 0, end: 0.2 }, 500, 1000)
    // Wants to move to negative start; clamp restores to 0 and preserves span.
    expect(result.start).toBe(0)
    expect(result.end).toBeCloseTo(0.2, 10)
  })

  it('returns startZoom unchanged when width is zero', () => {
    const start = { start: 0.2, end: 0.6 }
    expect(dragPan(start, 100, 0)).toBe(start)
  })
})

describe('pinchZoom', () => {
  it('shrinks the window when fingers spread apart', () => {
    // newDist > startDist → ratio < 1 → newSpan < startSpan (zoom in).
    const result = pinchZoom(0.5, 0.5, 0.4, 100, 200, 0.1)
    expect(result.end - result.start).toBeCloseTo(0.2, 10)
    // Center preserved at 0.5.
    expect((result.start + result.end) / 2).toBeCloseTo(0.5, 10)
  })

  it('grows the window when fingers pinch closer', () => {
    // newDist < startDist → ratio > 1 → newSpan > startSpan (zoom out).
    const result = pinchZoom(0.5, 0.5, 0.2, 200, 100, 0.1)
    expect(result.end - result.start).toBeCloseTo(0.4, 10)
  })

  it('clamps newSpan at minSpan', () => {
    const result = pinchZoom(0.5, 0.5, 0.4, 100, 10000, 0.15)
    expect(result.end - result.start).toBeCloseTo(0.15, 10)
  })

  it('clamps newSpan at 1 (full history)', () => {
    const result = pinchZoom(0.5, 0.5, 0.5, 1000, 10, 0.1)
    expect(result.start).toBe(0)
    expect(result.end).toBe(1)
  })

  it('handles newDist of 0 without dividing by zero', () => {
    const result = pinchZoom(0.5, 0.5, 0.4, 100, 0, 0.1)
    // Falls back to newDist=1 so ratio=100 → newSpan clamps to 1.
    expect(result.start).toBe(0)
    expect(result.end).toBe(1)
  })
})
