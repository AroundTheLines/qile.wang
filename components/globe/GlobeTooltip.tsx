'use client'

import { useRef, useEffect } from 'react'
import { useGlobe } from './GlobeContext'

export default function GlobeTooltip() {
  const { hoveredPin, pins, pinPositionRef, showHover } = useGlobe()
  const tooltipRef = useRef<HTMLDivElement>(null)

  const pinData = hoveredPin ? pins.find((p) => p.location._id === hoveredPin) : null

  // RAF loop to track pin position
  useEffect(() => {
    if (!hoveredPin || !showHover) return

    let raf: number
    const update = () => {
      const pos = pinPositionRef.current[hoveredPin]
      if (pos && tooltipRef.current) {
        tooltipRef.current.style.transform = `translate(${pos.x + 12}px, ${pos.y - 24}px)`
        tooltipRef.current.style.opacity = pos.visible ? '1' : '0'
      }
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [hoveredPin, pinPositionRef, showHover])

  if (!hoveredPin || !pinData || !showHover) return null

  const itemCount = pinData.visits.reduce((acc, v) => acc + v.items.length, 0)

  return (
    <div
      ref={tooltipRef}
      className="absolute top-0 left-0 pointer-events-none z-30"
      style={{ opacity: 0, transition: 'opacity 150ms' }}
    >
      <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 px-3 py-1.5 shadow-sm dark:shadow-none">
        <span className="text-[10px] tracking-widest uppercase font-light text-black dark:text-white">
          {pinData.location.name}
        </span>
        {itemCount > 1 && (
          <span className="text-[10px] tracking-widest uppercase text-gray-400 dark:text-gray-500 ml-2">
            {itemCount} items
          </span>
        )}
      </div>
    </div>
  )
}
