'use client'

import { useRef, useEffect, useState } from 'react'
import { useGlobe } from './GlobeContext'

export default function GlobeHoverConnector() {
  const {
    hoveredPin,
    pinPositionRef,
    showConnectors,
    isDark,
  } = useGlobe()
  const svgRef = useRef<SVGSVGElement>(null)
  const lineRef = useRef<SVGLineElement>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const read = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])

  // RAF loop for line position
  useEffect(() => {
    if (!hoveredPin || !showConnectors) return

    let raf: number
    const update = () => {
      const pos = pinPositionRef.current[hoveredPin]
      if (pos && lineRef.current) {
        lineRef.current.setAttribute('x1', String(pos.x))
        lineRef.current.setAttribute('y1', String(pos.y))
        lineRef.current.setAttribute('x2', String(pos.x + 12))
        lineRef.current.setAttribute('y2', String(pos.y - 24))
        lineRef.current.style.opacity = pos.visible ? '1' : '0'
      }
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [hoveredPin, pinPositionRef, showConnectors])

  if (!hoveredPin || !showConnectors) return null

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 pointer-events-none z-20"
      width={viewport.w}
      height={viewport.h}
    >
      <line
        ref={lineRef}
        stroke={isDark ? 'white' : 'black'}
        strokeWidth="1.5"
        style={{
          transition: 'opacity 150ms',
        }}
      />
    </svg>
  )
}
