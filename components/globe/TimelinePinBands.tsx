'use client'

import { useContext, useMemo } from 'react'
import { GlobeContext } from './GlobeContext'
import type { CompressedMap } from '@/lib/timelineCompression'

interface Props {
  compressed: CompressedMap
  zoomWindow: { start: number; end: number }
  /** Width of the timeline track (matches Timeline's `innerWidth`). */
  containerWidth: number
}

/**
 * Renders visit sub-region bands on the timeline for the pin whose
 * `pinSubregionHighlight` is set. Spans the full track (not a single trip
 * segment) because a pin's visits can straddle multiple trips — §7.5.
 */
export default function TimelinePinBands({
  compressed,
  zoomWindow,
  containerWidth,
}: Props) {
  const ctx = useContext(GlobeContext)
  const highlight = ctx?.pinSubregionHighlight ?? null

  const pin = useMemo(() => {
    if (!ctx || !highlight) return null
    return ctx.pins.find((p) => p.location._id === highlight) ?? null
  }, [ctx, highlight])

  if (!pin) return null
  const zoomSpan = zoomWindow.end - zoomWindow.start
  if (zoomSpan <= 0) return null

  return (
    <>
      {pin.visits.map((v) => {
        const vx0 = compressed.dateToX(v.startDate)
        const vx1 = compressed.dateToX(v.endDate)
        const projStart = (vx0 - zoomWindow.start) / zoomSpan
        const projEnd = (vx1 - zoomWindow.start) / zoomSpan
        if (projEnd < 0 || projStart > 1) return null
        const clippedStart = Math.max(0, projStart)
        const clippedEnd = Math.min(1, projEnd)
        const leftPx = clippedStart * containerWidth
        const widthPx = Math.max(2, (clippedEnd - clippedStart) * containerWidth)
        return (
          <div
            key={v._id}
            data-no-skeleton
            className="absolute top-0 bottom-0 bg-black/30 dark:bg-white/30 pointer-events-none"
            style={{ left: leftPx, width: widthPx }}
          />
        )
      })}
    </>
  )
}
