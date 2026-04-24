'use client'

import { useRef, useEffect, useState } from 'react'
import { useGlobeData, useGlobePin, useGlobeUI } from './GlobeContext'

// Short intentional delay before the tooltip appears on pin hover — just
// enough to feel deliberate without lagging behind a quick scrub across
// the globe. Paired with a fade-in + small translate-up so the tooltip
// doesn't snap in.
const TOOLTIP_SHOW_DELAY_MS = 120

export default function GlobeTooltip() {
  const { pins, pinPositionRef } = useGlobeData()
  const { hoveredPin } = useGlobePin()
  const { showHover } = useGlobeUI()
  const tooltipRef = useRef<HTMLDivElement>(null)
  // `visible` is the post-delay intent: did the user dwell long enough
  // to earn a tooltip? `visibleRef` mirrors it so the RAF loop (below)
  // can read the latest value without re-subscribing on every flip.
  const [visible, setVisible] = useState(false)
  const visibleRef = useRef(false)
  useEffect(() => {
    visibleRef.current = visible
  }, [visible])

  const pinData = hoveredPin ? pins.find((p) => p.location._id === hoveredPin) : null

  // Delay the "visible" state transition — re-runs on every hoveredPin
  // change, so scrubbing across pins resets the timer (still snappy, but
  // avoids flicker when the pointer grazes neighbors). The `false` branch
  // is a synchronous clear (no dwell required to hide); the `true` branch
  // is timer-gated so brief pointer transit doesn't flash the tooltip.
  useEffect(() => {
    if (!hoveredPin || !showHover) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived clear on hover-out
      setVisible(false)
      return
    }
    const t = setTimeout(() => setVisible(true), TOOLTIP_SHOW_DELAY_MS)
    return () => clearTimeout(t)
  }, [hoveredPin, showHover])

  // Per-frame RAF loop — updates both the tooltip's pixel position AND
  // its visibility based on whether the pin is still on the near
  // hemisphere. Visibility lives here (not in a React-render check) so
  // that rotating the globe with the tooltip open hides it the moment
  // the pin crosses the silhouette, matching the pin's own back-face
  // fade rather than leaving a "floating label" attached to a dot that
  // isn't there.
  useEffect(() => {
    if (!hoveredPin || !showHover) return

    let raf: number
    const update = () => {
      const pos = pinPositionRef.current[hoveredPin]
      const el = tooltipRef.current
      if (pos && el) {
        el.style.transform = `translate(${pos.x + 12}px, ${pos.y - 24}px)`
        const onScreen = pos.visible && !pos.behind
        // `visibleRef` gates the initial show-delay; `onScreen` gates the
        // rotation-based hide. Both must be true to paint the tooltip.
        // Writing opacity/translate inline each frame avoids a React
        // re-render on every silhouette crossing.
        const show = visibleRef.current && onScreen
        el.style.opacity = show ? '1' : '0'
        el.style.translate = show ? '0 0' : '0 4px'
      }
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [hoveredPin, pinPositionRef, showHover])

  if (!hoveredPin || !pinData || !showHover) return null

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
        // Start hidden; the RAF loop flips to shown once the delay
        // elapses AND the pin is on the near hemisphere.
        opacity: 0,
        translate: '0 4px',
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
