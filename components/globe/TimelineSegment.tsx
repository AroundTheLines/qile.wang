'use client'

import type { CompressedMap, TripRange } from '@/lib/timelineCompression'

interface Props {
  trip: TripRange & { title?: string }
  compressed: CompressedMap
  zoomWindow: { start: number; end: number }
  containerWidth: number
}

export default function TimelineSegment({ trip, compressed, zoomWindow, containerWidth }: Props) {
  const x0 = compressed.dateToX(trip.startDate)
  const x1 = compressed.dateToX(trip.endDate)
  const zoomSpan = zoomWindow.end - zoomWindow.start
  const projX0 = (x0 - zoomWindow.start) / zoomSpan
  const projX1 = (x1 - zoomWindow.start) / zoomSpan

  if (projX1 < -0.05 || projX0 > 1.05) return null

  const leftPx = projX0 * containerWidth
  const widthPx = Math.max(2, (projX1 - projX0) * containerWidth)
  const isDot = widthPx < 12

  return (
    <div className="absolute inset-y-0" style={{ left: leftPx, width: widthPx }}>
      {isDot ? (
        <div
          className="absolute top-1/2 w-2 h-2 rounded-full bg-black/20 dark:bg-white/[.18]"
          style={{ left: '50%', transform: 'translate(-50%, -50%)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/20 dark:bg-white/[.18]" />
      )}
    </div>
  )
}
