'use client'

import { useRef, useEffect, useState } from 'react'
import { useGlobe } from './GlobeContext'

// Short intentional delay before the tooltip appears on pin hover — just
// enough to feel deliberate without lagging behind a quick scrub across
// the globe. Paired with a fade-in + small translate-up so the tooltip
// doesn't snap in.
const TOOLTIP_SHOW_DELAY_MS = 120

export default function GlobeTooltip() {
  const { hoveredPin, pins, pinPositionRef, showHover } = useGlobe()
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  const pinData = hoveredPin ? pins.find((p) => p.location._id === hoveredPin) : null

  // Delay the "visible" state transition — re-runs on every hoveredPin
  // change, so scrubbing across pins resets the timer (still snappy, but
  // avoids flicker when the pointer grazes neighbors).
  useEffect(() => {
    if (!hoveredPin || !showHover) {
      setVisible(false)
      return
    }
    const t = setTimeout(() => setVisible(true), TOOLTIP_SHOW_DELAY_MS)
    return () => clearTimeout(t)
  }, [hoveredPin, showHover])

  // RAF loop to track pin position
  useEffect(() => {
    if (!hoveredPin || !showHover) return

    let raf: number
    const update = () => {
      const pos = pinPositionRef.current[hoveredPin]
      if (pos && tooltipRef.current) {
        tooltipRef.current.style.transform = `translate(${pos.x + 12}px, ${pos.y - 24}px)`
      }
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [hoveredPin, pinPositionRef, showHover])

  if (!hoveredPin || !pinData || !showHover) return null

  const pos = pinPositionRef.current[hoveredPin]
  const onScreen = pos ? pos.visible && !pos.behind : false
  const shown = visible && onScreen

  const visitCount = pinData.visits.length
  const label =
    visitCount > 1
      ? `${pinData.location.name} · ${visitCount} visits`
      : pinData.location.name

  return (
    <div
      ref={tooltipRef}
      className="absolute top-0 left-0 pointer-events-none z-30"
      style={{
        opacity: shown ? 1 : 0,
        // Small upward travel reinforces the "rising into view" feel
        // without drifting far from the pin anchor.
        translate: shown ? '0 0' : '0 4px',
        transition: 'opacity 150ms ease-out, translate 150ms ease-out',
      }}
    >
      <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 px-3 py-1.5 shadow-sm dark:shadow-none">
        <span className="text-[10px] tracking-widest uppercase font-light text-black dark:text-white">
          {label}
        </span>
      </div>
    </div>
  )
}
