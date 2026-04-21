export type ZoomWindow = { start: number; end: number }

/**
 * Clamp a zoom window to [0, 1] while preserving its span. If one bound
 * overshoots, shift the opposite bound by the same delta instead of
 * truncating — otherwise the span collapses at the edges.
 *
 * When span > 1 (both bounds overshoot), the result degenerates to { 0, 1 }.
 * Callers are expected to enforce min/max span before calling, but clamp
 * always produces a valid window within [0, 1].
 */
export function clampZoom(start: number, end: number): ZoomWindow {
  let s = start
  let e = end
  if (s < 0) {
    e -= s
    s = 0
  }
  if (e > 1) {
    s -= e - 1
    e = 1
    if (s < 0) s = 0
  }
  return { start: s, end: e }
}
