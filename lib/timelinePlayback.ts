export interface PlaybackTrip {
  id: string
  xStart: number
  xEnd: number
}

export interface PlaybackState {
  playheadX: number
  highlightedTripIds: string[]
  phase: 'sweeping' | 'holding'
}

export interface PlaybackConfig {
  trips: PlaybackTrip[]
  /** Base sweep rate (compressed-x per second) while the playhead is
      inside a trip's range. */
  xPerSecond: number
  loopHoldMs?: number
  /** Multiplier applied to `xPerSecond` while the playhead is in a gap
      between trips. >1 fast-forwards dead time; keep the gaps readable
      by not going so fast the user can't register the jump. Default 7. */
  gapMultiplier?: number
  /** Multiplier applied to `xPerSecond` while the playhead is inside a
      trip. <1 slows trips down so the reader has time to register them.
      Default 0.6. */
  tripMultiplier?: number
  /** Lower bound on how long the playhead dwells inside a trip, in
      seconds. Short trips (day trips — `xEnd - xStart` tiny) would
      otherwise flash past faster than the eye can register. Caps
      velocity to `span / minTripDurationSec` while inside a trip.
      Default 0.8s. */
  minTripDurationSec?: number
}

export interface PlaybackController {
  getState(): PlaybackState
  tick(dtSec: number): void
  setTrips(trips: PlaybackTrip[]): void
  setXPerSecond(v: number): void
  /** Jump the playhead to `x` (clamped to [0,1]) and exit any hold phase
      so sweeping resumes from there on the next tick. */
  seekTo(x: number): void
  subscribe(fn: (s: PlaybackState) => void): () => void
}

const DEFAULT_HOLD_MS = 5000
const DEFAULT_GAP_MULTIPLIER = 7
const DEFAULT_TRIP_MULTIPLIER = 0.75
const DEFAULT_MIN_TRIP_DURATION_SEC = 1.0
// Short trips (especially day trips where `xStart === xEnd`) need a
// non-zero range so the playhead can dwell visibly inside them. We pad
// symmetrically so the pad doesn't shift the highlight entry point
// earlier by a large fraction of the compressed axis.
const EFFECTIVE_SPAN_FLOOR = 0.008

function sortByXStart(trips: PlaybackTrip[]): PlaybackTrip[] {
  // Ensures `highlightedTripIds` is chronological when the playhead crosses
  // overlapping trips — callers (e.g. floating-label click) rely on order.
  return [...trips].sort((a, b) => a.xStart - b.xStart)
}

export function createPlaybackController(cfg: PlaybackConfig): PlaybackController {
  let trips = sortByXStart(cfg.trips)
  let xPerSecond = cfg.xPerSecond
  const loopHoldMs = cfg.loopHoldMs ?? DEFAULT_HOLD_MS
  const gapMultiplier = cfg.gapMultiplier ?? DEFAULT_GAP_MULTIPLIER
  const tripMultiplier = cfg.tripMultiplier ?? DEFAULT_TRIP_MULTIPLIER
  const minTripDurationSec = cfg.minTripDurationSec ?? DEFAULT_MIN_TRIP_DURATION_SEC

  // Sweep starts at present (x=1), moves left to past (x=0).
  let playheadX = 1
  let highlightedTripIds: string[] = []
  let phase: PlaybackState['phase'] = 'sweeping'
  let holdElapsedMs = 0

  const subs = new Set<(s: PlaybackState) => void>()

  // Widen short trips symmetrically so the playhead can dwell inside
  // them long enough to register. For trips wider than the floor the
  // effective range is identical to the declared range.
  const effectiveRange = (t: PlaybackTrip): [number, number] => {
    const span = t.xEnd - t.xStart
    if (span >= EFFECTIVE_SPAN_FLOOR) return [t.xStart, t.xEnd]
    const pad = (EFFECTIVE_SPAN_FLOOR - span) / 2
    return [t.xStart - pad, t.xEnd + pad]
  }

  const computeHighlighted = (): string[] => {
    const out: string[] = []
    for (const t of trips) {
      const [lo, hi] = effectiveRange(t)
      if (playheadX >= lo && playheadX <= hi) out.push(t.id)
    }
    return out
  }

  const arrayEq = (a: string[], b: string[]) => {
    if (a === b) return true
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
  }

  const snapshot = (): PlaybackState => ({
    playheadX,
    highlightedTripIds,
    phase,
  })

  const notify = () => {
    const s = snapshot()
    for (const fn of subs) fn(s)
  }

  const recomputeAndNotify = () => {
    const next = computeHighlighted()
    if (!arrayEq(highlightedTripIds, next)) highlightedTripIds = next
    notify()
  }

  return {
    getState: snapshot,
    tick(dtSec) {
      if (phase === 'sweeping') {
        // Fast-forward through gaps between trips. Uses the current
        // playhead position (pre-step) to pick the rate — a single tick
        // that crosses a boundary uses the rate of the range it started
        // in, which is fine at RAF-rate dt ≈ 16ms.
        const inTrip = highlightedTripIds.length > 0
        let velocity: number
        if (inTrip) {
          // Cap velocity so a short trip (day trip) takes at least
          // `minTripDurationSec` to traverse. For typical multi-day trips
          // the cap is well above the base rate and `min(base, cap)` =
          // base — unchanged. Only day trips are slowed.
          // Dwell cap uses the EFFECTIVE span (widened by the floor for
          // short trips), matching the widened range the highlight check
          // uses — otherwise a zero-span day trip would pin velocity to 0
          // and the playhead would never leave.
          let minEffSpan = Infinity
          for (const tid of highlightedTripIds) {
            const t = trips.find((x) => x.id === tid)
            if (!t) continue
            const [lo, hi] = effectiveRange(t)
            const span = hi - lo
            if (span < minEffSpan) minEffSpan = span
          }
          const tripBase = xPerSecond * tripMultiplier
          const dwellCap =
            minEffSpan === Infinity ? tripBase : minEffSpan / minTripDurationSec
          velocity = Math.min(tripBase, dwellCap)
        } else {
          velocity = xPerSecond * gapMultiplier
        }
        let nextX = playheadX - velocity * dtSec
        // Guard: at gap velocity, a single tick can overshoot a very short
        // trip entirely (`nextX < xStart` while `playheadX > xEnd`). Clamp
        // to the trip's right edge so the next tick sees `inTrip = true`
        // and the dwell cap kicks in.
        if (!inTrip) {
          // Clamp to the top edge whenever the step would cross INTO a
          // trip's effective range from above. Covers both the full-skip
          // case (nextX < lo < hi < playheadX) and the barely-landed-inside
          // case (lo <= nextX < hi < playheadX) that floating-point drift
          // otherwise leaves with no dwell lane.
          let clampTo: number | null = null
          for (const t of trips) {
            const [, hi] = effectiveRange(t)
            if (hi < playheadX && hi > nextX) {
              if (clampTo === null || hi > clampTo) clampTo = hi
            }
          }
          if (clampTo !== null) nextX = clampTo
        }
        playheadX = nextX
        if (playheadX <= 0) {
          playheadX = 0
          phase = 'holding'
          holdElapsedMs = 0
          highlightedTripIds = []
          notify()
          return
        }
        recomputeAndNotify()
      } else {
        holdElapsedMs += dtSec * 1000
        if (holdElapsedMs >= loopHoldMs) {
          playheadX = 1
          phase = 'sweeping'
          recomputeAndNotify()
        }
      }
    },
    setTrips(t) {
      trips = sortByXStart(t)
      recomputeAndNotify()
    },
    setXPerSecond(v) {
      xPerSecond = v
    },
    seekTo(x) {
      const clamped = Math.min(1, Math.max(0, x))
      playheadX = clamped
      phase = 'sweeping'
      holdElapsedMs = 0
      recomputeAndNotify()
    },
    subscribe(fn) {
      subs.add(fn)
      fn(snapshot())
      return () => {
        subs.delete(fn)
      }
    },
  }
}
