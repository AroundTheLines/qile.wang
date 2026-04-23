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
      by not going so fast the user can't register the jump. Default 4. */
  gapMultiplier?: number
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
const DEFAULT_GAP_MULTIPLIER = 4

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

  // Sweep starts at present (x=1), moves left to past (x=0).
  let playheadX = 1
  let highlightedTripIds: string[] = []
  let phase: PlaybackState['phase'] = 'sweeping'
  let holdElapsedMs = 0

  const subs = new Set<(s: PlaybackState) => void>()

  const computeHighlighted = (): string[] => {
    const out: string[] = []
    for (const t of trips) {
      if (playheadX >= t.xStart && playheadX <= t.xEnd) out.push(t.id)
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
        const velocity = inTrip ? xPerSecond : xPerSecond * gapMultiplier
        playheadX -= velocity * dtSec
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
