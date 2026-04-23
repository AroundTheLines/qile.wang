'use client'

import type { CompressedMap, TripRange } from '@/lib/timelineCompression'
import TimelineVisitTicks from './TimelineVisitTicks'

interface Props {
  trip: TripRange & { title?: string }
  compressed: CompressedMap
  zoomWindow: { start: number; end: number }
  containerWidth: number
  isActive?: boolean
  /** Lit by the playback sweep (§5). Tints accent without expanding
      visit ticks so the reader still knows hover/lock is distinct. */
  isPlaybackHighlighted?: boolean
}

/** Shared with B6 dot-render on playhead crossing. */
export const MIN_SEGMENT_WIDTH_PX = 12

export default function TimelineSegment({
  trip,
  compressed,
  zoomWindow,
  containerWidth,
  isActive = false,
  isPlaybackHighlighted = false,
}: Props) {
  const x0 = compressed.dateToX(trip.startDate)
  const x1 = compressed.dateToX(trip.endDate)
  const zoomSpan = zoomWindow.end - zoomWindow.start
  const projX0 = (x0 - zoomWindow.start) / zoomSpan
  const projX1 = (x1 - zoomWindow.start) / zoomSpan

  if (projX1 < -0.05 || projX0 > 1.05) return null

  const leftPx = projX0 * containerWidth
  const widthPx = Math.max(2, (projX1 - projX0) * containerWidth)
  const isDot = widthPx < MIN_SEGMENT_WIDTH_PX

  // Clip cue when the trip extends past the current zoom window on either
  // side. Cues are rendered inside the segment but anchored to the *track*'s
  // zoom-window boundary, not the segment's edges — when a trip is clipped
  // the segment's own edges sit off-track, so `left: 0` / `right: 0` would
  // render the cue invisibly past the window.
  const clippedLeft = projX0 < 0
  const clippedRight = projX1 > 1
  const leftCueOffset = clippedLeft ? -leftPx : 0
  const rightCueOffset = clippedRight ? leftPx + widthPx - containerWidth : 0

  const fillBase = 'transition-colors duration-150 ease-out'
  const emphasized = isActive || isPlaybackHighlighted
  const fillColor = emphasized
    ? 'bg-black/70 dark:bg-white/80'
    : 'bg-black/20 dark:bg-white/[.18]'

  return (
    <div className="absolute inset-y-0" style={{ left: leftPx, width: widthPx }}>
      {isDot ? (
        // Position the dot's center on leftPx (the trip start anchor) rather
        // than the midpoint of the 2px placeholder box — otherwise the
        // connector line above it appears 1px to the left of the dot.
        <div
          className={`absolute top-1/2 w-1.5 h-1.5 rounded-full ${fillBase} ${fillColor}`}
          style={{ left: 0, transform: 'translate(-50%, -50%)' }}
        />
      ) : (
        <>
          <div className={`absolute inset-0 ${fillBase} ${fillColor}`} />
          {isActive && (
            <TimelineVisitTicks
              tripId={trip.id}
              compressed={compressed}
              zoomWindow={zoomWindow}
              containerWidth={containerWidth}
              segmentLeftPx={leftPx}
            />
          )}
          {clippedLeft && (
            <div
              data-no-skeleton
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-2 bg-black/40 dark:bg-white/40 pointer-events-none"
              style={{ left: leftCueOffset }}
            />
          )}
          {clippedRight && (
            <div
              data-no-skeleton
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-2 bg-black/40 dark:bg-white/40 pointer-events-none"
              style={{ right: rightCueOffset }}
            />
          )}
        </>
      )}
    </div>
  )
}
