'use client'

import { useRef, useEffect, useState } from 'react'
import { useGlobe } from './GlobeContext'
import { clampPanelTop, clipLineByGlobe } from '@/lib/globe'

// Header band ~64px tall; aim line at its vertical center
const PANEL_HEADER_CENTER_OFFSET = 32
const FADE_IN_MS = 200
const FADE_OUT_MS = 150

export default function GlobeClickConnector() {
  const {
    selectedPin,
    slideComplete,
    pinPositionRef,
    globeScreenRef,
    frameSubscribersRef,
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
  // Animated 0..1 progress of the draw-in / draw-out. Stored in a ref so
  // the per-frame animation step doesn't re-render the component (and
  // doesn't churn the frame-subscriber set in the bridge — re-adding the
  // subscriber 60 times per fade was wasteful). The subscriber reads the
  // ref each tick. A separate `drawing` boolean flips only when the
  // progress crosses 0 ↔ >0, which is the only thing the render needs.
  const drawProgressRef = useRef(0)
  const [drawing, setDrawing] = useState(false)

  // Last known panel-anchored pin Y. Kept in a ref so the fade-out keeps
  // aiming at the panel header position it had at the moment the close
  // started — selectPin(null) clears selectedPinScreenY to null in the
  // same tick, and without this cache `clampPanelTop(null, ...)` would
  // jump the endpoint to its default (top of the viewport) mid-retract.
  const lastPanelYRef = useRef<number | null>(null)
  useEffect(() => {
    if (drawPin && drawPin === selectedPin && selectedPinScreenY != null) {
      lastPanelYRef.current = selectedPinScreenY
    }
  }, [drawPin, selectedPin, selectedPinScreenY])

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
    if (drawProgressRef.current === 0) {
      setDrawPin(selectedPin)
      return
    }
    let raf: number
    let start: number | null = null
    const from = drawProgressRef.current
    const step = (t: number) => {
      if (start === null) start = t
      const p = Math.min((t - start) / FADE_OUT_MS, 1)
      drawProgressRef.current = from * (1 - p)
      if (p < 1) {
        raf = requestAnimationFrame(step)
      } else {
        drawProgressRef.current = 0
        setDrawing(false)
        setDrawPin(selectedPin)
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
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
    if (drawProgressRef.current >= 1) return

    let raf: number
    let start: number | null = null
    const from = drawProgressRef.current
    setDrawing(true)
    const step = (t: number) => {
      if (start === null) start = t
      const p = Math.min((t - start) / FADE_IN_MS, 1)
      drawProgressRef.current = from + (1 - from) * p
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [drawPin, selectedPin, slideComplete])

  // Subscribe to the bridge's frame tick — render against `drawPin`, not
  // selectedPin, so the exit animation uses the previous pin's coordinates.
  // Updating inline with the canvas frame keeps the line glued to the pin
  // during rotation (no separate rAF loop that could trail by one frame).
  // Deps intentionally exclude `drawProgressRef.current` — the subscriber
  // reads the ref live each tick, so it stays registered across the entire
  // fade-in/out instead of being torn down and re-added 60 times.
  useEffect(() => {
    if (!drawPin || !showConnectors) return
    const subscribers = frameSubscribersRef.current
    const update = () => {
      const pos = pinPositionRef.current[drawPin]
      if (!pos || !lineRef.current) return
      const progress = drawProgressRef.current
      // End point: panel's left edge (in container-local coords) at header Y
      const panelLeftX = panelLeftInContainer
      // Pick the anchor Y by whether we're drawing the currently-selected
      // pin or fading out a previous one:
      //   - Active (drawPin === selectedPin): use the live selected pin Y.
      //   - Fading out (drawPin !== selectedPin, which covers both panel
      //     close *and* a switch to a different pin): use the cached Y so
      //     the retract stays glued to the old panel position instead of
      //     jumping to the new pin's Y (pin-switch) or snapping to the
      //     clamp fallback (close, where selectedPinScreenY is null).
      const anchorY =
        drawPin === selectedPin ? selectedPinScreenY : lastPanelYRef.current
      const panelTop = clampPanelTop(anchorY, viewport.h)
      const targetY = panelTop + PANEL_HEADER_CENTER_OFFSET

      const endX = pos.x + (panelLeftX - pos.x) * progress
      const endY = pos.y + (targetY - pos.y) * progress

      const clipped = clipLineByGlobe(
        pos.x,
        pos.y,
        endX,
        endY,
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
  }, [
    drawPin,
    pinPositionRef,
    globeScreenRef,
    frameSubscribersRef,
    showConnectors,
    panelLeftInContainer,
    viewport.h,
    selectedPinScreenY,
  ])

  if (!drawPin || !showConnectors || !drawing) return null
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
