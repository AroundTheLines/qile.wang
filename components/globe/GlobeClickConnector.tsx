'use client'

import { useRef, useEffect, useState } from 'react'
import { useGlobe } from './GlobeContext'
import { clampPanelTop } from '@/lib/globe'

// Header band ~64px tall; aim line at its vertical center
const PANEL_HEADER_CENTER_OFFSET = 32
const FADE_IN_MS = 200
const FADE_OUT_MS = 150

export default function GlobeClickConnector() {
  const {
    selectedPin,
    slideComplete,
    pinPositionRef,
    showConnectors,
    selectedPinScreenY,
    isDesktop,
    isTablet,
    isDark,
    layoutState,
  } = useGlobe()
  const lineRef = useRef<SVGLineElement>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })

  // `drawPin` is the pin the line is currently drawn *to*. It lags
  // `selectedPin` so that a pin switch (A → B) animates out from A first,
  // then drawPin flips to B and we animate in.
  const [drawPin, setDrawPin] = useState<string | null>(null)
  const [drawProgress, setDrawProgress] = useState(0)

  useEffect(() => {
    const read = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])

  // Panel width (matches GlobeViewport) so the line endpoint sits exactly
  // at the panel's left edge rather than a hardcoded 60% guess.
  const panelWidthPx = viewport.w
    ? isDesktop
      ? Math.min(Math.max(viewport.w * 0.4, 320), 420)
      : isTablet
        ? viewport.w * 0.45
        : 0
    : 0
  // The connector SVG lives inside the globe container, which is translated
  // left by panelWidthPx/2 when a pin is selected. Pin positions are in
  // container-local coords, so the panel's left edge (viewport x =
  // viewport.w - panelWidthPx) maps to container-local x = viewport.w -
  // panelWidthPx/2.
  // Panel is inset 16px from the right edge.
  const panelLeftInContainer = viewport.w - panelWidthPx / 2 - 16

  // Fade-out controller — triggered when selectedPin diverges from drawPin
  // (includes closing the panel AND switching to a different pin).
  useEffect(() => {
    if (drawPin == null || drawPin === selectedPin) return
    if (drawProgress === 0) {
      setDrawPin(selectedPin)
      return
    }
    let raf: number
    let start: number | null = null
    const from = drawProgress
    const step = (t: number) => {
      if (start === null) start = t
      const p = Math.min((t - start) / FADE_OUT_MS, 1)
      setDrawProgress(from * (1 - p))
      if (p < 1) {
        raf = requestAnimationFrame(step)
      } else {
        setDrawPin(selectedPin)
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPin, drawPin])

  // First-open sync
  useEffect(() => {
    if (drawPin == null && selectedPin != null) {
      setDrawPin(selectedPin)
    }
  }, [selectedPin, drawPin])

  // Fade-in controller
  useEffect(() => {
    if (!drawPin || !slideComplete || drawPin !== selectedPin) return
    if (drawProgress >= 1) return

    let raf: number
    let start: number | null = null
    const from = drawProgress
    const step = (t: number) => {
      if (start === null) start = t
      const p = Math.min((t - start) / FADE_IN_MS, 1)
      setDrawProgress(from + (1 - from) * p)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawPin, selectedPin, slideComplete])

  // RAF loop for line position — render against `drawPin`, not selectedPin,
  // so the exit animation uses the previous pin's coordinates.
  useEffect(() => {
    if (!drawPin || !showConnectors || drawProgress === 0) return

    let raf: number
    const update = () => {
      const pos = pinPositionRef.current[drawPin]
      if (pos && lineRef.current) {
        // End point: panel's left edge (in container-local coords) at header Y
        const panelLeftX = panelLeftInContainer
        const panelTop = clampPanelTop(selectedPinScreenY, viewport.h)
        const targetY = panelTop + PANEL_HEADER_CENTER_OFFSET

        const endX = pos.x + (panelLeftX - pos.x) * drawProgress
        const endY = pos.y + (targetY - pos.y) * drawProgress

        lineRef.current.setAttribute('x1', String(pos.x))
        lineRef.current.setAttribute('y1', String(pos.y))
        lineRef.current.setAttribute('x2', String(endX))
        lineRef.current.setAttribute('y2', String(endY))
        lineRef.current.style.opacity = pos.visible ? '1' : '0'
      }
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [
    drawPin,
    pinPositionRef,
    showConnectors,
    panelLeftInContainer,
    viewport.h,
    drawProgress,
    selectedPinScreenY,
  ])

  if (!drawPin || !showConnectors || drawProgress === 0) return null
  // Hide while the article is open — the article connector replaces it.
  if (layoutState === 'article-open') return null

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-20"
      width={viewport.w}
      height={viewport.h}
    >
      <line ref={lineRef} stroke={isDark ? 'white' : 'black'} strokeWidth="1.5" />
    </svg>
  )
}
