import { describe, it, expect } from 'vitest'
import { createPlaybackController, type PlaybackTrip } from './timelinePlayback'

// Shared helpers. `driveTo` ticks until a predicate holds (or gives up),
// returning every emitted state for downstream assertions. Running at
// dt=16ms matches the RAF rate TimelinePlayhead drives in production.
const DT = 0.016

function collect(ticks: number, trips: PlaybackTrip[], xPerSecond = 0.1, opts: Record<string, number> = {}) {
  const samples: Array<{ x: number; h: string; phase: string }> = []
  const c = createPlaybackController({
    trips,
    xPerSecond,
    loopHoldMs: opts.loopHoldMs ?? 10000,
    gapMultiplier: opts.gapMultiplier,
    tripMultiplier: opts.tripMultiplier,
    minTripDurationSec: opts.minTripDurationSec,
  })
  c.subscribe((s) =>
    samples.push({
      x: s.playheadX,
      h: s.highlightedTripIds.join(','),
      phase: s.phase,
    }),
  )
  for (let i = 0; i < ticks; i++) c.tick(DT)
  return { controller: c, samples }
}

describe('createPlaybackController', () => {
  it('sweeps present→past (x decreases from 1)', () => {
    const { samples } = collect(10, [{ id: 'a', xStart: 0.4, xEnd: 0.5 }])
    expect(samples[0].x).toBe(1)
    // strictly monotonically non-increasing
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].x).toBeLessThanOrEqual(samples[i - 1].x)
    }
  })

  it('reaches x=0 → holds → teleports to x=1 on next sweep', () => {
    // xPerSecond=2, gapMultiplier=1 so 0.5s covers the full range.
    const { samples } = collect(
      200,
      [{ id: 'a', xStart: 0.6, xEnd: 0.8 }],
      2,
      { loopHoldMs: 500, gapMultiplier: 1, tripMultiplier: 1, minTripDurationSec: 0.01 },
    )
    const holdIdx = samples.findIndex((s) => s.phase === 'holding')
    expect(holdIdx).toBeGreaterThan(0)
    expect(samples[holdIdx].x).toBe(0)
    expect(samples[holdIdx].h).toBe('') // spec §5.4 "fully neutral" during hold
    // After hold, we should see a sample at x=1 again (teleport back).
    const teleportIdx = samples.findIndex((s, i) => i > holdIdx && s.x === 1 && s.phase === 'sweeping')
    expect(teleportIdx).toBeGreaterThan(holdIdx)
  })

  it('highlights overlapping trips together, chronologically', () => {
    // A: 0.3..0.5. B: 0.45..0.7. Overlap on 0.45..0.5.
    const c = createPlaybackController({
      trips: [
        { id: 'A', xStart: 0.3, xEnd: 0.5 },
        { id: 'B', xStart: 0.45, xEnd: 0.7 },
      ],
      xPerSecond: 0.1,
    })
    // Land the playhead in the overlap band without depending on the
    // sweep path.
    c.seekTo(0.47)
    const s = c.getState()
    expect(s.highlightedTripIds).toEqual(['A', 'B'])
  })

  it('zero-span day trip dwells for ~minTripDurationSec', () => {
    // Pure day trip — startDate === endDate → xStart === xEnd.
    const { samples } = collect(
      800,
      [{ id: 'day', xStart: 0.5, xEnd: 0.5 }],
      0.1,
    )
    const inDay = samples.filter((s) => s.h === 'day')
    const duration = inDay.length * DT
    // Using default minTripDurationSec=1.0. Allow 10% tolerance
    // for tick-boundary effects.
    expect(duration).toBeGreaterThan(0.85)
    expect(duration).toBeLessThan(1.15)
  })

  it('clamp entry handles floating-point drift (playhead lands inside, not past)', () => {
    // Craft a situation where accumulated subtraction produces an nextX
    // with floating-point noise above a trip's lower edge. Verifies the
    // clamp catches the "crossing into" case, not just "overshooting past".
    const c = createPlaybackController({
      trips: [{ id: 'day', xStart: 0.5, xEnd: 0.5 }],
      xPerSecond: 0.1,
      gapMultiplier: 7,
      tripMultiplier: 0.75,
      minTripDurationSec: 1.0,
    })
    const sample: Array<{ x: number; h: string }> = []
    c.subscribe((s) => sample.push({ x: s.playheadX, h: s.highlightedTripIds.join(',') }))
    for (let i = 0; i < 120; i++) c.tick(DT)
    const inDay = sample.filter((s) => s.h === 'day')
    // Should dwell at LEAST several ticks — not a single-tick flyby.
    expect(inDay.length).toBeGreaterThan(10)
  })

  it('gap sweep is faster than in-trip sweep', () => {
    const { samples } = collect(
      400,
      [{ id: 'a', xStart: 0.4, xEnd: 0.6 }],
      0.1,
      { gapMultiplier: 7, tripMultiplier: 0.75, minTripDurationSec: 0.01 },
    )
    // measure average |dx| per tick in gap vs in-trip
    const gaps: number[] = []
    const trips: number[] = []
    for (let i = 1; i < samples.length; i++) {
      const dx = samples[i - 1].x - samples[i].x
      if (dx <= 0) continue // phase reset
      if (samples[i].h === 'a') trips.push(dx)
      else if (samples[i].h === '') gaps.push(dx)
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
    const avgTrip = trips.reduce((a, b) => a + b, 0) / trips.length
    // With the configured multipliers, ratio should be ~7 / 0.75 ≈ 9.3×.
    expect(avgGap / avgTrip).toBeGreaterThan(5)
  })

  it('seekTo clamps to [0,1] and exits hold phase', () => {
    const c = createPlaybackController({
      trips: [{ id: 'a', xStart: 0, xEnd: 0 }],
      xPerSecond: 10,
      loopHoldMs: 10000,
    })
    // Force hold by ticking until x <= 0.
    for (let i = 0; i < 100; i++) c.tick(0.1)
    expect(c.getState().phase).toBe('holding')

    c.seekTo(0.5)
    const s = c.getState()
    expect(s.playheadX).toBe(0.5)
    expect(s.phase).toBe('sweeping')

    c.seekTo(1.5) // clamps to 1
    expect(c.getState().playheadX).toBe(1)
    c.seekTo(-0.2) // clamps to 0
    expect(c.getState().playheadX).toBe(0)
  })

  it('ctor sorts trips by xStart so overlap highlight order is chronological', () => {
    const c = createPlaybackController({
      trips: [
        // Passed in reverse-chronological order on purpose.
        { id: 'late', xStart: 0.5, xEnd: 0.7 },
        { id: 'early', xStart: 0.4, xEnd: 0.6 },
      ],
      xPerSecond: 0.1,
    })
    c.seekTo(0.55) // overlap band
    expect(c.getState().highlightedTripIds).toEqual(['early', 'late'])
  })

  it('setTrips during hold preserves neutral highlights', () => {
    // Drive the controller to the holding phase, then refresh the trip
    // list. Highlights must stay empty per spec §5.4 — a list refresh
    // shouldn't relight trips while the playhead is parked at zero.
    const c = createPlaybackController({
      trips: [{ id: 'a', xStart: 0, xEnd: 0 }],
      xPerSecond: 10,
      loopHoldMs: 10000,
    })
    for (let i = 0; i < 100; i++) c.tick(0.1)
    expect(c.getState().phase).toBe('holding')
    expect(c.getState().highlightedTripIds).toEqual([])

    // Replace with a trip whose effective range overlaps x=0; without the
    // hold-phase guard this would relight highlights mid-hold.
    c.setTrips([{ id: 'b', xStart: 0, xEnd: 0.05 }])
    expect(c.getState().phase).toBe('holding')
    expect(c.getState().highlightedTripIds).toEqual([])
  })

  it('subscribe fires immediately with current state', () => {
    const c = createPlaybackController({
      trips: [],
      xPerSecond: 0.1,
    })
    let fired: boolean | undefined
    c.subscribe((s) => {
      fired = true
      expect(s.playheadX).toBe(1)
      expect(s.phase).toBe('sweeping')
    })
    expect(fired).toBe(true)
  })
})
