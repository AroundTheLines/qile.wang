'use client'

import { useRef, useEffect, useState } from 'react'
import { useGlobeData, useGlobePin, useGlobeUI } from './GlobeContext'
import { clipLineByGlobe } from '@/lib/globe'

export default function GlobeHoverConnector() {
  const { pinPositionRef, globeScreenRef, frameSubscribersRef } = useGlobeData()
  const { hoveredPin } = useGlobePin()
  const { showConnectors, isDark } = useGlobeUI()
  const svgRef = useRef<SVGSVGElement>(null)
  const lineRef = useRef<SVGLineElement>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const read = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])

  // Subscribe to the bridge's frame tick — updates SVG attributes inline
  // with the canvas render so the line cannot lag the pin.
  useEffect(() => {
    if (!hoveredPin || !showConnectors) return
    const subscribers = frameSubscribersRef.current
    const update = () => {
      const pos = pinPositionRef.current[hoveredPin]
      if (!pos || !lineRef.current) return
      const clipped = clipLineByGlobe(
        pos.x,
        pos.y,
        pos.x + 12,
        pos.y - 24,
        pos.behind,
        globeScreenRef.current,
      )
      lineRef.current.setAttribute('x1', String(clipped.x1))
      lineRef.current.setAttribute('y1', String(clipped.y1))
      lineRef.current.setAttribute('x2', String(clipped.x2))
      lineRef.current.setAttribute('y2', String(clipped.y2))
      lineRef.current.style.opacity = pos.visible && clipped.visible ? '1' : '0'
    }
    subscribers.add(update)
    return () => {
      subscribers.delete(update)
    }
  }, [hoveredPin, pinPositionRef, globeScreenRef, frameSubscribersRef, showConnectors])

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
