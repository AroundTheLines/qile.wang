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
export function clampZoom(start: number, end: number, overscroll = 0): ZoomWindow {
  // Allow the window to extend past [0, 1] by `overscroll * span` on each
  // side so pan gestures reveal a small empty gutter beyond the first/last
  // history point — a physical "you've reached the end" affordance. When
  // fully zoomed out (span == 1), the overscroll collapses to zero because
  // there's nowhere to pan.
  const span = end - start
  // Overscroll collapses to 0 once the window covers the full history — there
  // is nowhere left to pan past.
  const ov =
    span >= 1 || overscroll <= 0 ? 0 : Math.max(0, overscroll) * Math.max(0, span)
  // Avoid `-ov` when ov === 0; negation of +0 yields -0 in IEEE 754 and
  // trips `expect(...).toBe(0)` with Object.is semantics.
  const minStart = ov > 0 ? -ov : 0
  const maxEnd = 1 + ov
  let s = start
  let e = end
  if (s < minStart) {
    e -= s - minStart
    s = minStart
  }
  if (e > maxEnd) {
    s -= e - maxEnd
    e = maxEnd
    if (s < minStart) s = minStart
  }
  return { start: s, end: e }
}

/**
 * Cursor-anchored wheel zoom. Returns the new window, or null when the zoom
 * would no-op (already at min/max span in the direction of the wheel).
 *
 * `cursorXFrac` is the cursor's fractional position within the current visible
 * window (0..1). The point under the cursor stays under the cursor after zoom.
 */
export function wheelZoom(
  cur: ZoomWindow,
  deltaY: number,
  cursorXFrac: number,
  minSpan: number,
  multiplier = 0.001,
): ZoomWindow | null {
  const span = cur.end - cur.start
  const cursorX = cur.start + cursorXFrac * span
  const zoomFactor = Math.exp(deltaY * -multiplier)
  const newSpan = Math.min(1, Math.max(minSpan, span * zoomFactor))
  if (newSpan === span) return null
  const newStart = cursorX - cursorXFrac * newSpan
  return clampZoom(newStart, newStart + newSpan)
}

/**
 * Shift the zoom window by `deltaX` pixels of wheel input. Used for trackpad
 * horizontal-swipe pan. Positive `deltaX` shifts the window rightward (content
 * appears to move left), matching native scroll semantics.
 */
export function wheelPan(cur: ZoomWindow, deltaX: number, width: number, overscroll = 0): ZoomWindow {
  if (width === 0) return cur
  const span = cur.end - cur.start
  const dxFrac = deltaX / width
  return clampZoom(cur.start + dxFrac * span, cur.end + dxFrac * span, overscroll)
}

/**
 * Pointer-drag pan. `dx` is the pixel delta from the gesture start; the window
 * shifts opposite to the drag (drag right → window moves left → content
 * appears to follow the finger).
 */
export function dragPan(startZoom: ZoomWindow, dx: number, width: number, overscroll = 0): ZoomWindow {
  if (width === 0) return startZoom
  const span = startZoom.end - startZoom.start
  const dxFrac = dx / width
  return clampZoom(startZoom.start - dxFrac * span, startZoom.end - dxFrac * span, overscroll)
}

/**
 * Pinch-zoom from two-pointer distance change. Zoom is anchored at the
 * gesture's starting center point (expressed as `startCenter` in zoom-space
 * and `centerXFrac` within the visible window at gesture start).
 */
export function pinchZoom(
  startCenter: number,
  centerXFrac: number,
  startSpan: number,
  startDist: number,
  newDist: number,
  minSpan: number,
): ZoomWindow {
  const safeDist = newDist || 1
  const ratio = startDist / safeDist
  const newSpan = Math.min(1, Math.max(minSpan, startSpan * ratio))
  const newStart = startCenter - centerXFrac * newSpan
  return clampZoom(newStart, newStart + newSpan)
}
