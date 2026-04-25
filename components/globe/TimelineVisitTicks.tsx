'use client'

import { useMemo } from 'react'
import { useGlobeData } from './GlobeContext'
import type { CompressedMap } from '@/lib/timelineCompression'

interface Props {
  tripId: string
  compressed: CompressedMap
  zoomWindow: { start: number; end: number }
  /** Width of the timeline track (matches Timeline's `innerWidth`). */
  containerWidth: number
  /** leftPx of the containing TimelineSegment within the track. */
  segmentLeftPx: number
}

export default function TimelineVisitTicks({
  tripId,
  compressed,
  zoomWindow,
  containerWidth,
  segmentLeftPx,
}: Props) {
  // Destructure so the memo depends on the stable `pins` array rather than
  // the whole ctx object, which the provider rebuilds every render (hover
  // flips, frame-sub set churn). Matches the B4 shipped-notes dep pattern.
  const { pins } = useGlobeData()

  const visits = useMemo(() => {
    if (!pins) return []
    const out: { _id: string; startDate: string; endDate: string }[] = []
    for (const p of pins) {
      for (const v of p.visits) {
        if (v.trip._id === tripId) out.push(v)
      }
    }
    return out
  }, [pins, tripId])

  if (!pins || visits.length === 0) return null
  const zoomSpan = zoomWindow.end - zoomWindow.start
  if (zoomSpan <= 0) return null

  return (
    <>
      {visits.map((v) => {
        const vx0 = compressed.dateToX(v.startDate)
        const vx1 = compressed.dateToX(v.endDate)
        const projStart = (vx0 - zoomWindow.start) / zoomSpan
        const projEnd = (vx1 - zoomWindow.start) / zoomSpan
        if (projEnd < 0 || projStart > 1) return null
        const leftPx = projStart * containerWidth - segmentLeftPx
        const widthPx = Math.max(1, (projEnd - projStart) * containerWidth)
        return (
          <div
            key={v._id}
            data-no-skeleton
            className="absolute top-0 bottom-0 bg-black/40 dark:bg-white/40 pointer-events-none"
            style={{ left: leftPx, width: widthPx }}
          />
        )
      })}
    </>
  )
}
