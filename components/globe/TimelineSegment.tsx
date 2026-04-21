'use client'

import type { CompressedMap, TripRange } from '@/lib/timelineCompression'

interface Props {
  trip: TripRange & { title?: string }
  compressed: CompressedMap
  zoomWindow: { start: number; end: number }
  containerWidth: number
  isActive?: boolean
}

export default function TimelineSegment({
  trip,
  compressed,
  zoomWindow,
  containerWidth,
  isActive = false,
}: Props) {
  const x0 = compressed.dateToX(trip.startDate)
  const x1 = compressed.dateToX(trip.endDate)
  const zoomSpan = zoomWindow.end - zoomWindow.start
  const projX0 = (x0 - zoomWindow.start) / zoomSpan
  const projX1 = (x1 - zoomWindow.start) / zoomSpan

  if (projX1 < -0.05 || projX0 > 1.05) return null

  const leftPx = projX0 * containerWidth
  const widthPx = Math.max(2, (projX1 - projX0) * containerWidth)
  const isDot = widthPx < 12

  const fillBase = 'transition-colors duration-150 ease-out'
  const fillColor = isActive
    ? 'bg-black/70 dark:bg-white/80'
    : 'bg-black/20 dark:bg-white/[.18]'

  return (
    <div className="absolute inset-y-0" style={{ left: leftPx, width: widthPx }}>
      {isDot ? (
        // Position the dot's center on leftPx (the trip start anchor) rather
        // than the midpoint of the 2px placeholder box — otherwise the
        // connector line above it appears 1px to the left of the dot.
        <div
          className={`absolute top-1/2 w-2 h-2 rounded-full ${fillBase} ${fillColor}`}
          style={{ left: 0, transform: 'translate(-50%, -50%)' }}
        />
      ) : (
        <div className={`absolute inset-0 ${fillBase} ${fillColor}`} />
      )}
    </div>
  )
}
